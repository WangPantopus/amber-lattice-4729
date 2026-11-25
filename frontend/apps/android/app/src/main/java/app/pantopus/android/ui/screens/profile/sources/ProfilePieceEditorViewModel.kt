@file:Suppress("TooManyFunctions")

package app.pantopus.android.ui.screens.profile.sources

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.links.LinkPreviewRepository
import app.pantopus.android.data.profile.AttachmentRef
import app.pantopus.android.data.profile.PieceFields
import app.pantopus.android.data.profile.ProfilePageRepository
import app.pantopus.android.data.profile.ProfilePieceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import javax.inject.Inject

/** One attachment in the editor: uploaded (it has a file id), uploading, or failed (try again or remove). */
data class EditorAttachment(
    val key: String,
    val kind: PieceAttachment.Kind,
    val fileId: String?,
    val url: String?,
    val thumbnailUrl: String?,
    /** The picked file, kept until it is uploaded so a failed one can be sent again. */
    val source: Uri? = null,
    val uploading: Boolean = false,
    val failed: Boolean = false,
    /** A picture from before phase 2 (no file id): kept, moved or removed by its url (p2.12). */
    val legacy: Boolean = false,
)

/** One link in the editor: its address and, once read, its card of words. */
data class EditorLink(
    val url: String,
    val card: PieceLinkCard?,
)

/** The line that proves a page, for the link being proven, and whether the last check found it. */
data class EditorProof(
    val linkId: String,
    val site: String?,
    val proof: PieceProof?,
    val checking: Boolean = false,
    /** The server's own words when a check didn't find the line (or failed). */
    val problem: String? = null,
)

/** Board 10: a new piece or a piece being changed. */
data class PieceEditorState(
    val loading: Boolean = false,
    val id: String? = null,
    val offer: PieceOffer? = null,
    val title: String = "",
    val kind: String? = null,
    val month: YearMonth? = null,
    val place: String = "",
    val description: String = "",
    val skills: List<String> = emptyList(),
    val audience: String = "anyone",
    val pinned: Boolean = false,
    val hidden: Boolean = false,
    /** A piece already on Work (not a draft): its button saves changes; a new piece or a draft adds it to Work. */
    val onWork: Boolean = false,
    val attachments: List<EditorAttachment> = emptyList(),
    val attachmentsChanged: Boolean = false,
    val links: List<EditorLink> = emptyList(),
    val linkInput: String = "",
    val howItWillShow: List<String> = emptyList(),
    val saving: Boolean = false,
    val notice: String? = null,
    val proof: EditorProof? = null,
    /** Set once a save or a removal is done: the editor closes and the page is read again. */
    val done: Boolean = false,
    val removed: Boolean = false,
) {
    val count: Int get() = attachments.size + links.size
    val room: Int get() = (MAX_ATTACHMENTS - count).coerceAtLeast(0)
    val uploading: Boolean get() = attachments.any { it.uploading }
    val canSave: Boolean get() = title.isNotBlank() && !uploading && !saving && attachments.none { it.failed }

    companion object {
        const val MAX_ATTACHMENTS = 12
        const val TITLE_MOST = 60
        const val WORDS_MOST = 280
    }
}

/**
 * Adding and changing a piece (board 10, contract P2.3 and P2.4): the fields, up to twelve attachments through
 * today's portfolio upload, links read into cards by the server, "How this piece will show" as the server works it
 * out, draft, pin, hide, who sees it, and remove. Proving a link's page happens on a saved piece.
 */
@HiltViewModel
class ProfilePieceEditorViewModel
    @Inject
    constructor(
        private val pieces: ProfilePieceRepository,
        private val pages: ProfilePageRepository,
        private val linkPreviews: LinkPreviewRepository,
        @ApplicationContext private val context: Context,
    ) : ViewModel() {
        private val _state = MutableStateFlow(PieceEditorState())
        val state: StateFlow<PieceEditorState> = _state.asStateFlow()

        private var previewJob: Job? = null
        private var started = false

        /** A new piece, blank or started from [offer] (a job's title stays the poster's: the field starts empty). */
        fun startNew(offer: PieceOffer?) {
            if (started) return
            started = true
            _state.value =
                PieceEditorState(
                    offer = offer,
                    title = if (offer?.kind == "plan") offer.title.take(PieceEditorState.TITLE_MOST) else "",
                    month = offer?.whenText?.let(::parseOfferDay),
                )
            previewSoon()
        }

        /** An existing piece of the owner's ([ownerId]), read whole so nothing is lost on save. */
        fun startEdit(
            ownerId: String,
            pieceId: String,
        ) {
            if (started) return
            started = true
            _state.value = PieceEditorState(loading = true, id = pieceId)
            viewModelScope.launch {
                when (val result = pages.piece(ownerId, pieceId)) {
                    is NetworkResult.Success -> {
                        val detail = result.data
                        val piece = detail.piece
                        _state.value =
                            PieceEditorState(
                                id = piece.id,
                                title = piece.title,
                                kind = piece.kind,
                                month = (piece.toMonth ?: piece.fromMonth)?.let { runCatching { YearMonth.parse(it) }.getOrNull() },
                                place = piece.place.orEmpty(),
                                description = detail.description?.text.orEmpty(),
                                skills = detail.showsCan,
                                audience = piece.audience ?: "anyone",
                                pinned = piece.pinned,
                                hidden = piece.hidden,
                                onWork = !piece.draft,
                                attachments =
                                    detail.attachments.map { a ->
                                        EditorAttachment(
                                            key = a.id,
                                            kind = a.kind,
                                            fileId = a.id.takeUnless { ':' in it },
                                            url = a.url,
                                            thumbnailUrl = a.thumbnailUrl,
                                            legacy = ':' in a.id,
                                        )
                                    },
                                links = detail.links.map { EditorLink(it.url, it) },
                                howItWillShow = detail.howItWillShow,
                            )
                    }
                    is NetworkResult.Failure ->
                        _state.value = PieceEditorState(id = pieceId, notice = "This piece didn't open. Close and try again.")
                }
            }
        }

        fun setTitle(value: String) = change { it.copy(title = value.take(PieceEditorState.TITLE_MOST)) }

        fun setKind(value: String?) = change { it.copy(kind = value) }

        fun setMonth(value: YearMonth?) = change { it.copy(month = value) }

        fun setPlace(value: String) = change { it.copy(place = value.take(PLACE_MOST)) }

        fun setDescription(value: String) = change { it.copy(description = value.take(PieceEditorState.WORDS_MOST)) }

        fun setAudience(value: String) = change { it.copy(audience = value) }

        fun setPinned(value: Boolean) = change { it.copy(pinned = value) }

        fun setHidden(value: Boolean) = change { it.copy(hidden = value) }

        /** The person let go of the offer: the piece is their own, Said, with nothing Pantopus saw. */
        fun dropOffer() = change { it.copy(offer = null) }

        fun dismissNotice() = _state.update { it.copy(notice = null) }

        /** Picked photos, a video or a document: each is uploaded through today's portfolio upload, in order. */
        fun addFiles(uris: List<Uri>) {
            val room = _state.value.room
            if (uris.size > room) {
                _state.update { it.copy(notice = "A piece holds 12 things at most, files and links together.") }
            }
            uris.take(room).forEach { uri ->
                val key = UUID.randomUUID().toString()
                val kind = kindOf(uri)
                _state.update {
                    it.copy(
                        attachments = it.attachments + EditorAttachment(key, kind, null, null, null, source = uri, uploading = true),
                        attachmentsChanged = true,
                    )
                }
                upload(key, uri)
            }
        }

        fun retryAttachment(key: String) {
            val uri = _state.value.attachments.firstOrNull { it.key == key }?.source ?: return
            _state.update { s ->
                s.copy(attachments = s.attachments.map { if (it.key == key) it.copy(uploading = true, failed = false) else it })
            }
            upload(key, uri)
        }

        fun removeAttachment(key: String) =
            change { s -> s.copy(attachments = s.attachments.filterNot { it.key == key }, attachmentsChanged = true) }

        fun setLinkInput(value: String) = _state.update { it.copy(linkInput = value) }

        /** Adds the typed link: read now for its words (the server reads it again on save and keeps that card). */
        fun addLink() {
            val url = _state.value.linkInput.trim().let { if (it.startsWith("http://") || it.startsWith("https://")) it else "https://$it" }
            if (url.length < MIN_URL || _state.value.links.any { it.url == url }) return
            if (_state.value.room == 0) {
                _state.update { it.copy(notice = "A piece holds 12 things at most, files and links together.") }
                return
            }
            change { it.copy(links = it.links + EditorLink(url, null), linkInput = "") }
            viewModelScope.launch {
                val preview = linkPreviews.preview(url).getOrNull() ?: return@launch
                val card =
                    PieceLinkCard(
                        url = url,
                        kind = "site",
                        site = preview.site,
                        title = preview.title,
                        description = preview.description,
                        ink = ProfileInk.Said,
                        how = "Said, until you prove the page is yours",
                    )
                _state.update { s -> s.copy(links = s.links.map { if (it.url == url && it.card == null) it.copy(card = card) else it }) }
            }
        }

        fun removeLink(url: String) = change { s -> s.copy(links = s.links.filterNot { it.url == url }) }

        /** Saves: [toWork] false keeps it a draft (nobody else sees it); true puts it on Work. */
        fun save(toWork: Boolean) {
            val s = _state.value
            if (!s.canSave) return
            _state.update { it.copy(saving = true, notice = null) }
            viewModelScope.launch {
                when (val result = pieces.save(s.id, s.fields(draft = !toWork))) {
                    is NetworkResult.Success -> _state.update { it.copy(saving = false, done = true) }
                    is NetworkResult.Failure -> _state.update { it.copy(saving = false, notice = result.error.message) }
                }
            }
        }

        fun remove() {
            val id = _state.value.id ?: return
            _state.update { it.copy(saving = true, notice = null) }
            viewModelScope.launch {
                when (val result = pieces.delete(id)) {
                    is NetworkResult.Success -> _state.update { it.copy(saving = false, done = true, removed = true) }
                    is NetworkResult.Failure -> _state.update { it.copy(saving = false, notice = result.error.message) }
                }
            }
        }

        /** "Prove it's yours" on a saved piece's link: the line to put in the page's title or description. */
        fun startProof(link: PieceLinkCard) {
            val id = _state.value.id ?: return
            val linkId = link.id ?: return
            _state.update { it.copy(proof = EditorProof(linkId, link.site, null)) }
            viewModelScope.launch {
                when (val result = pieces.proof(id, linkId)) {
                    is NetworkResult.Success -> _state.update { it.copy(proof = it.proof?.copy(proof = result.data)) }
                    is NetworkResult.Failure -> _state.update { it.copy(proof = null, notice = result.error.message) }
                }
            }
        }

        /** "Check now": reads the page's head; Seen when the line is there. */
        fun checkProof() {
            val id = _state.value.id ?: return
            val proof = _state.value.proof ?: return
            _state.update { it.copy(proof = proof.copy(checking = true, problem = null)) }
            viewModelScope.launch {
                when (val result = pieces.check(id, proof.linkId)) {
                    is NetworkResult.Success -> {
                        val card = result.data
                        _state.update { s ->
                            s.copy(
                                proof = null,
                                links = s.links.map { if (it.card?.id == card.id) it.copy(card = card) else it },
                                notice = "The page is proven yours. The card shows as Seen.",
                            )
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update { s -> s.copy(proof = s.proof?.copy(checking = false, problem = result.error.message)) }
                }
            }
        }

        fun closeProof() = _state.update { it.copy(proof = null) }

        private fun upload(
            key: String,
            uri: Uri,
        ) {
            viewModelScope.launch {
                val read = withContext(Dispatchers.IO) { readFile(uri) }
                if (read == null) {
                    markFailed(key, "That file couldn't be read.")
                    return@launch
                }
                val (name, mime, bytes) = read
                when (val result = pieces.upload(name, mime, bytes)) {
                    is NetworkResult.Success -> {
                        val file = result.data
                        _state.update { s ->
                            s.copy(
                                attachments =
                                    s.attachments.map {
                                        if (it.key == key) {
                                            it.copy(
                                                kind = file.kind,
                                                fileId = file.fileId,
                                                url = file.url,
                                                thumbnailUrl = file.thumbnailUrl,
                                                uploading = false,
                                                failed = false,
                                            )
                                        } else {
                                            it
                                        }
                                    },
                            )
                        }
                        previewSoon()
                    }
                    is NetworkResult.Failure -> markFailed(key, result.error.message)
                }
            }
        }

        private fun markFailed(
            key: String,
            message: String,
        ) = _state.update { s ->
            s.copy(
                attachments = s.attachments.map { if (it.key == key) it.copy(uploading = false, failed = true) else it },
                notice = message,
            )
        }

        private fun readFile(uri: Uri): Triple<String, String, ByteArray>? =
            runCatching {
                val resolver = context.contentResolver
                val mime = resolver.getType(uri) ?: "application/octet-stream"
                var name = "piece-file"
                var size = -1L
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        c.getString(0)?.let { name = it }
                        if (!c.isNull(1)) size = c.getLong(1)
                    }
                }
                if (size > MAX_BYTES) return null
                val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
                Triple(name, mime, bytes)
            }.getOrNull()

        private fun kindOf(uri: Uri): PieceAttachment.Kind {
            val mime = context.contentResolver.getType(uri).orEmpty()
            return when {
                mime.startsWith("video/") -> PieceAttachment.Kind.Video
                mime.startsWith("image/") -> PieceAttachment.Kind.Photo
                else -> PieceAttachment.Kind.Document
            }
        }

        /** A change to a field: "How this piece will show" is asked for again shortly after typing stops. */
        private fun change(transform: (PieceEditorState) -> PieceEditorState) {
            _state.update(transform)
            previewSoon()
        }

        private fun previewSoon() {
            previewJob?.cancel()
            previewJob =
                viewModelScope.launch {
                    delay(PREVIEW_WAIT_MS)
                    val s = _state.value
                    if (s.title.isBlank() || s.loading) return@launch
                    val result = pieces.preview(s.fields(draft = false))
                    if (result is NetworkResult.Success) _state.update { it.copy(howItWillShow = result.data) }
                }
        }

        private fun PieceEditorState.fields(draft: Boolean): PieceFields {
            val (city, region) = splitPlace(place)
            val key = month?.toString()
            return PieceFields(
                title = title.trim(),
                kind = kind,
                from = key,
                to = key,
                city = city,
                state = region,
                description = description.trim().takeIf { it.isNotEmpty() },
                skills = skills,
                audience = audience,
                pinned = pinned && !draft,
                hidden = hidden,
                draft = draft,
                startedFrom = offer?.let { it.kind to it.id },
                // A piece's files are sent only when they changed, and never while older pictures (no file id) are on it.
                // Sent only when they changed: files by id, and a picture from before phase 2 by its url (p2.12), in order.
                attachments =
                    if (attachmentsChanged) {
                        attachments.mapNotNull {
                                a ->
                            a.fileId?.let { AttachmentRef(fileId = it) } ?: a.url?.takeIf { a.legacy }?.let { AttachmentRef(url = it) }
                        }
                    } else {
                        null
                    },
                links = links.map { it.url },
            )
        }

        private companion object {
            const val PREVIEW_WAIT_MS = 700L
            const val PLACE_MOST = 80
            const val MIN_URL = 11
            const val MAX_BYTES = 100L * 1024 * 1024
        }
    }

/** "Camas, WA" → ("Camas", "WA"); a city alone keeps no state. City and state only, never an address. */
internal fun splitPlace(place: String): Pair<String?, String?> {
    val trimmed = place.trim()
    if (trimmed.isEmpty()) return null to null
    val comma = trimmed.lastIndexOf(',')
    if (comma < 0) return trimmed to null
    val city = trimmed.substring(0, comma).trim().takeIf { it.isNotEmpty() }
    val region = trimmed.substring(comma + 1).trim().takeIf { it.isNotEmpty() }
    return city to region
}

/** "August 14, 2026" → August 2026. */
private fun parseOfferDay(text: String): YearMonth? =
    runCatching { YearMonth.from(DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US).parse(text)) }.getOrNull()
