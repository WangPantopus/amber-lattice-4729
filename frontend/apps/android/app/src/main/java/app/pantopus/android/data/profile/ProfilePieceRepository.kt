package app.pantopus.android.data.profile

import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.ProfilePageApi
import app.pantopus.android.data.store.ScreenStore
import app.pantopus.android.data.store.StoreTopics
import app.pantopus.android.ui.screens.profile.sources.OwnerPieces
import app.pantopus.android.ui.screens.profile.sources.PieceAttachment
import app.pantopus.android.ui.screens.profile.sources.PieceLinkCard
import app.pantopus.android.ui.screens.profile.sources.PieceProof
import app.pantopus.android.ui.screens.profile.sources.WorkPiece
import app.pantopus.android.ui.screens.profile.sources.mapHowItWillShow
import app.pantopus.android.ui.screens.profile.sources.mapLinkCard
import app.pantopus.android.ui.screens.profile.sources.mapOwnerPieces
import app.pantopus.android.ui.screens.profile.sources.mapPieceProof
import app.pantopus.android.ui.screens.profile.sources.mapSavedPiece
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * What the owner sends for a piece (P2.3 piece fields). [attachments] is null to leave the piece's files as they
 * are, else the whole list in order; [links] the whole list of URLs (a link already on the piece keeps its card).
 */
data class PieceFields(
    val title: String,
    /** did | built | owns | null */
    val kind: String?,
    /** `YYYY-MM` */
    val from: String?,
    val to: String?,
    val city: String?,
    val state: String?,
    val description: String?,
    val skills: List<String>,
    /** anyone | members | connections */
    val audience: String,
    val pinned: Boolean,
    val hidden: Boolean,
    val draft: Boolean,
    /** `gig` or `plan` and its id: only when the piece is made from an offer. */
    val startedFrom: Pair<String, String>?,
    val attachments: List<String>?,
    val links: List<String>,
)

/** One file just uploaded through today's portfolio upload, ready to attach to a piece by its id. */
data class UploadedAttachment(
    val fileId: String,
    val kind: PieceAttachment.Kind,
    val url: String,
    val thumbnailUrl: String?,
)

/**
 * The owner's pieces (contract P2.3 and P2.4, `backend/routes/profilePage.js`): the list with offers, making,
 * changing, previewing and removing a piece, proving a link's page, and uploading an attachment through today's
 * `POST /api/files/portfolio` (whatever check it runs). Every write marks the owner's page to be read again.
 */
@Singleton
class ProfilePieceRepository
    @Inject
    constructor(
        private val api: ProfilePageApi,
        private val tabs: ProfileTabsRepository,
        private val store: ScreenStore,
    ) {
        suspend fun mine(): NetworkResult<OwnerPieces> =
            when (val result = safeApiCall { api.myPieces() }) {
                is NetworkResult.Success -> NetworkResult.Success(mapOwnerPieces(result.data))
                is NetworkResult.Failure -> result
            }

        /** Makes the piece ([id] null) or changes it; the answer is the piece and "How this piece will show". */
        suspend fun save(
            id: String?,
            fields: PieceFields,
        ): NetworkResult<Pair<WorkPiece, List<String>>> {
            val body = fields.toJson(forCreate = id == null).toBody()
            val result = safeApiCall { if (id == null) api.createPiece(body) else api.updatePiece(id, body) }
            return when (result) {
                is NetworkResult.Success -> {
                    store.markEdited(StoreTopics.PROFILE_ME)
                    mapSavedPiece(result.data)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                }
                is NetworkResult.Failure -> result
            }
        }

        /** "How this piece will show" for fields not saved yet (board 10's foot), worked out by the server. */
        suspend fun preview(fields: PieceFields): NetworkResult<List<String>> =
            when (val result = safeApiCall { api.previewPiece(fields.toJson(forCreate = true).toBody()) }) {
                is NetworkResult.Success -> NetworkResult.Success(mapHowItWillShow(result.data))
                is NetworkResult.Failure -> result
            }

        suspend fun delete(id: String): NetworkResult<Unit> =
            when (val result = safeApiCall { api.deletePiece(id) }) {
                is NetworkResult.Success -> {
                    store.markEdited(StoreTopics.PROFILE_ME)
                    NetworkResult.Success(Unit)
                }
                is NetworkResult.Failure -> result
            }

        suspend fun proof(
            id: String,
            linkId: String,
        ): NetworkResult<PieceProof> =
            when (val result = safeApiCall { api.linkProof(id, linkId) }) {
                is NetworkResult.Success ->
                    mapPieceProof(result.data)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                is NetworkResult.Failure -> result
            }

        /** The card, Seen, when the line is on the page; a 409 `PROOF_NOT_FOUND` otherwise. */
        suspend fun check(
            id: String,
            linkId: String,
        ): NetworkResult<PieceLinkCard> =
            when (val result = safeApiCall { api.checkLink(id, linkId) }) {
                is NetworkResult.Success -> {
                    store.markEdited(StoreTopics.PROFILE_ME)
                    mapLinkCard(result.data)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                }
                is NetworkResult.Failure -> result
            }

        /** Uploads one photo, video or document for a piece; the server decides its kind from what it is. */
        suspend fun upload(
            filename: String,
            mimeType: String,
            bytes: ByteArray,
        ): NetworkResult<UploadedAttachment> =
            when (
                val result =
                    tabs.uploadPortfolioItem(
                        filename = filename,
                        mimeType = mimeType,
                        bytes = bytes,
                        title = filename,
                        description = null,
                        category = "work",
                        clientRequestId = UUID.randomUUID().toString(),
                    )
            ) {
                is NetworkResult.Success -> {
                    val file = result.data.file
                    val url = file?.url
                    if (file == null || url == null) {
                        NetworkResult.Failure(NetworkError.NotFound)
                    } else {
                        val kind =
                            when {
                                mimeType.startsWith("video/") -> PieceAttachment.Kind.Video
                                mimeType.startsWith("image/") -> PieceAttachment.Kind.Photo
                                else -> PieceAttachment.Kind.Document
                            }
                        val thumbnail = file.thumbnails?.let { (it["medium"] ?: it["small"]) as? String }
                        NetworkResult.Success(UploadedAttachment(file.id, kind, url, thumbnail))
                    }
                }
                is NetworkResult.Failure -> result
            }

        private fun PieceFields.toJson(forCreate: Boolean): JSONObject =
            JSONObject().apply {
                put("title", title)
                put("kind", kind ?: JSONObject.NULL)
                put("from", from ?: JSONObject.NULL)
                put("to", to ?: JSONObject.NULL)
                put("city", city ?: JSONObject.NULL)
                put("state", state ?: JSONObject.NULL)
                put("description", description ?: JSONObject.NULL)
                put("skills", JSONArray(skills))
                put("audience", audience)
                put("pinned", pinned)
                put("hidden", hidden)
                put("draft", draft)
                if (forCreate) {
                    startedFrom?.let { (kind, id) -> put("started_from", JSONObject().put("kind", kind).put("id", id)) }
                }
                attachments?.let { ids -> put("attachments", JSONArray(ids.map { JSONObject().put("file_id", it) })) }
                put("links", JSONArray(links.map { JSONObject().put("url", it) }))
            }

        private fun JSONObject.toBody(): RequestBody = toString().toRequestBody("application/json".toMediaType())
    }
