@file:Suppress("LongMethod", "TooManyFunctions", "CyclomaticComplexMethod", "MagicNumber")

package app.pantopus.android.ui.screens.profile.sources

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.profile.ProfileIconButton
import app.pantopus.android.ui.screens.profile.profileLargeText
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

/** What opens the editor: a new piece (blank or from an offer) or one to change, under a fresh session key. */
data class PieceEditorRequest(
    val session: String,
    val pieceId: String?,
    val offer: PieceOffer?,
)

/** How the editor closed: nothing saved, saved, or the piece removed. */
enum class PieceEditorResult { Cancelled, Saved, Removed }

/** Keeps an open editor's request through a rotation or the app being stopped (its fields live in its view model). */
internal val PieceEditorRequestSaver: Saver<PieceEditorRequest?, Any> =
    listSaver(
        save = { r ->
            if (r == null) {
                emptyList()
            } else {
                listOf(
                    r.session,
                    r.pieceId.orEmpty(),
                    r.offer?.kind.orEmpty(),
                    r.offer?.id.orEmpty(),
                    r.offer?.title.orEmpty(),
                    r.offer?.whenText.orEmpty(),
                    r.offer?.with.orEmpty(),
                    r.offer?.text.orEmpty(),
                )
            }
        },
        restore = { l ->
            if (l.size < SAVED_FIELDS) {
                null
            } else {
                val offer = if (l[2].isEmpty()) null else PieceOffer(l[2], l[3], l[4], l[5].ifEmpty { null }, l[6].ifEmpty { null }, l[7])
                PieceEditorRequest(l[0], l[1].ifEmpty { null }, offer)
            }
        },
    )

private const val SAVED_FIELDS = 8

/**
 * Adding and changing a piece (board 10), over the profile. "How this piece will show" is the server's; uploads go
 * through today's portfolio upload; a link becomes a card of words; "Prove it's yours" works on a saved piece.
 * [onClose] says whether anything was saved or removed, so the page is read again.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ProfilePieceEditor(
    ownerId: String,
    request: PieceEditorRequest,
    onClose: (PieceEditorResult) -> Unit,
) {
    val vm: ProfilePieceEditorViewModel = hiltViewModel(key = "pieceEditor-${request.session}")
    LaunchedEffect(request.session) {
        if (request.pieceId != null) vm.startEdit(ownerId, request.pieceId) else vm.startNew(request.offer)
    }
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onClose(if (s.removed) PieceEditorResult.Removed else PieceEditorResult.Saved) }
    var confirmLeave by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    val leave: () -> Unit = {
        if (s.title.isNotBlank() && !s.done) {
            confirmLeave = true
        } else {
            onClose(PieceEditorResult.Cancelled)
        }
    }
    BackHandler(onBack = leave)

    val photos =
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(PieceEditorState.MAX_ATTACHMENTS)) {
            vm.addFiles(it)
        }
    val video =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { vm.addFiles(listOf(it)) } }
    val document =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { vm.addFiles(listOf(it)) } }

    Column(
        Modifier
            .fillMaxSize()
            .background(PantopusColors.appBg)
            .testTag("profileSources.pieceEditor"),
    ) {
        EditorTopBar(
            title = if (request.pieceId == null) "New piece" else "Change piece",
            onClose = leave,
            onSaveDraft = { vm.save(toWork = false) }.takeIf { !s.onWork },
            draftEnabled = s.canSave,
        )
        if (s.loading) {
            Box(Modifier.fillMaxSize().semantics { contentDescription = "Opening the piece" })
            return@Column
        }
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            s.offer?.let { OfferBanner(it) }
            Field(label = "What did you do or build?", counter = "${s.title.length} of ${PieceEditorState.TITLE_MOST}") {
                OutlinedTextField(
                    value = s.title,
                    onValueChange = vm::setTitle,
                    singleLine = true,
                    placeholder = { Text("Rebuilt a 1912 porch") },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.title"),
                )
            }
            Field(label = "Kind") { KindChoice(s.kind, vm::setKind) }
            WhenAndWhere(
                month = s.month,
                place = s.place,
                onOpenMonth = { monthOpen = true },
                onPlace = vm::setPlace,
            )
            ShowIt(
                state = s,
                onPhotos = { photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onVideo = { video.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                onDocument = { document.launch(arrayOf("application/pdf")) },
                onRemove = vm::removeAttachment,
                onRetry = vm::retryAttachment,
            )
            Field(label = "A link") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = s.linkInput,
                        onValueChange = vm::setLinkInput,
                        singleLine = true,
                        placeholder = { Text("yoursite.com/the-piece") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { vm.addLink() }),
                        trailingIcon = {
                            if (s.linkInput.isNotBlank()) {
                                TextButton(onClick = vm::addLink, modifier = Modifier.heightIn(min = 48.dp)) { Text("Add") }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.link"),
                    )
                    s.links.forEach { link ->
                        EditorLinkCard(
                            link = link,
                            saved = s.id != null,
                            onProve = vm::startProof,
                            onRemove = { vm.removeLink(link.url) },
                        )
                    }
                }
            }
            Field(label = "In your words", counter = "${s.description.length} of ${PieceEditorState.WORDS_MOST}") {
                OutlinedTextField(
                    value = s.description,
                    onValueChange = vm::setDescription,
                    minLines = 3,
                    textStyle = SourcesType.said,
                    placeholder = { Text("What you did, and what it took.", style = SourcesType.said) },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.words"),
                )
            }
            Field(label = "Who sees it") { AudienceChoice(s.audience, vm::setAudience) }
            Column(Modifier.sourcesCard()) {
                SwitchRow("Pin it to the top of your Work", s.pinned, vm::setPinned)
                SourcesDivider(Modifier.padding(horizontal = 16.dp))
                SwitchRow("Hide it from everyone else", s.hidden, vm::setHidden)
            }
            if (s.howItWillShow.isNotEmpty()) HowItWillShow(s.howItWillShow)
            if (request.pieceId != null) {
                Text(
                    text = "Remove this piece",
                    style = SourcesType.title.copy(color = PantopusColors.error),
                    modifier =
                        Modifier
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(role = Role.Button) { confirmRemove = true }
                            .padding(vertical = 12.dp, horizontal = 4.dp),
                )
            }
            Spacer(Modifier.size(8.dp))
        }
        Column(
            Modifier
                .fillMaxWidth()
                .background(PantopusColors.appSurface)
                .navigationBarsPadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            s.notice?.let { notice ->
                Text(
                    text = notice,
                    style = SourcesType.secondary.copy(color = PantopusColors.appText),
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(PantopusColors.appSurfaceSunken)
                            .clickable(onClickLabel = "Dismiss", role = Role.Button, onClick = vm::dismissNotice)
                            .padding(12.dp)
                            .testTag("profileSources.pieceEditor.notice"),
                )
            }
            PrimaryButton(
                title = if (s.onWork) "Save changes" else "Add to Work",
                onClick = { vm.save(toWork = true) },
                isEnabled = s.canSave,
                isLoading = s.saving,
                modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.save"),
            )
        }
    }

    if (monthOpen) {
        MonthPicker(
            chosen = s.month,
            onChoose = {
                vm.setMonth(it)
                monthOpen = false
            },
            onDismiss = { monthOpen = false },
        )
    }
    s.proof?.let { proof -> ProofDialog(proof, onCheck = vm::checkProof, onClose = vm::closeProof) }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("Leave without saving?") },
            text = { Text("What you added here isn't saved. Save it as a draft to come back to it.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmLeave = false
                    onClose(PieceEditorResult.Cancelled)
                }) { Text("Leave") }
            },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Keep going") } },
        )
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove this piece?") },
            text = { Text("It leaves your Work and every page, and anyone named on it is taken off it.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false
                    vm.remove()
                }) { Text("Remove", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Keep it") } },
        )
    }
}

@Composable
private fun EditorTopBar(
    title: String,
    onClose: () -> Unit,
    onSaveDraft: (() -> Unit)?,
    draftEnabled: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth().background(PantopusColors.appSurface).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileIconButton(
            icon = PantopusIcon.X,
            label = "Close",
            onClick = onClose,
            iconSize = 24.dp,
            testTag = "profileSources.pieceEditor.close",
        )
        Text(title, style = SourcesType.title, textAlign = TextAlign.Center, modifier = Modifier.weight(1f).semantics { heading() })
        if (onSaveDraft != null) {
            TextButton(onClick = onSaveDraft, enabled = draftEnabled, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(
                    "Save draft",
                    style = SourcesType.link.copy(color = if (draftEnabled) PantopusColors.primary600 else PantopusColors.appTextMuted),
                )
            }
        } else {
            Spacer(Modifier.size(48.dp))
        }
    }
}

/** Board 10's top: the job or plan Pantopus saw, which makes the piece Seen. */
@Composable
private fun OfferBanner(offer: PieceOffer) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(PantopusColors.primary50)
            .border(1.dp, PantopusColors.primary100, RoundedCornerShape(16.dp))
            .padding(16.dp)
            .semantics(mergeDescendants = true) { },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.padding(top = 5.dp)) { InkGlyph(ProfileInk.Seen) }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    if (offer.kind == "plan") "Pantopus has seen this plan." else "Pantopus has seen this job.",
                    style = SourcesType.title,
                )
                // A job's title is the poster's words: shown here to the owner, never put in the title field.
                if (offer.title.isNotBlank()) {
                    Text(
                        "\u201C${offer.title}\u201D",
                        style = SourcesType.secondary.copy(color = PantopusColors.appText, fontWeight = FontWeight.SemiBold),
                    )
                }
                Text(
                    "${offer.text} A piece started from it shows as Seen.",
                    style = SourcesType.secondary.copy(color = PantopusColors.appText),
                )
            }
        }
        Row(
            modifier =
                Modifier
                    .padding(start = 20.dp)
                    .clip(RoundedCornerShape(50))
                    .background(PantopusColors.primary600)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 14.dp, tint = PantopusColors.appTextInverse)
            Text(
                if (offer.kind == "plan") "Started from this plan" else "Started from this job",
                style = SourcesType.secondary.copy(color = PantopusColors.appTextInverse, fontWeight = FontWeight.SemiBold),
            )
        }
    }
}

/** A field's label, with its "20 of 60" on the right when it has one. */
@Composable
private fun Field(
    label: String,
    counter: String? = null,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = SourcesType.title, modifier = Modifier.weight(1f).semantics { heading() })
            counter?.let { Text(it, style = SourcesType.caption) }
        }
        content()
    }
}

/** Did · Built · Owns (board 10). Choosing the chosen one again clears it: a piece may have no kind. */
@Composable
private fun KindChoice(
    kind: String?,
    onChoose: (String?) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(PantopusColors.appSurfaceSunken)
            .padding(3.dp)
            .selectableGroup(),
    ) {
        listOf("did" to "Did", "built" to "Built", "owns" to "Owns").forEach { (key, word) ->
            val selected = kind == key
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .then(
                            if (selected) {
                                Modifier
                                    .background(PantopusColors.appSurface)
                                    .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(10.dp))
                            } else {
                                Modifier
                            },
                        )
                        .selectable(selected = selected, role = Role.RadioButton, onClick = { onChoose(if (selected) null else key) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    word,
                    style =
                        SourcesType.rowTitle.copy(
                            color = if (selected) PantopusColors.appText else PantopusColors.appTextSecondary,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        ),
                )
            }
        }
    }
}

/** When (a month) and Where (city and state only, never the address); stacked at the largest text. */
@Composable
private fun WhenAndWhere(
    month: YearMonth?,
    place: String,
    onOpenMonth: () -> Unit,
    onPlace: (String) -> Unit,
) {
    val whenField: @Composable (Modifier) -> Unit = { modifier ->
        Field(label = "When") {
            Box(
                modifier =
                    modifier
                        .heightIn(min = 56.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(4.dp))
                        .clickable(onClickLabel = "Choose the month", role = Role.Button, onClick = onOpenMonth)
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                        .testTag("profileSources.pieceEditor.when"),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    month?.let { "${it.month.getDisplayName(TextStyle.FULL, Locale.US)} ${it.year}" } ?: "Choose a month",
                    style = SourcesType.body.copy(color = if (month == null) PantopusColors.appTextMuted else PantopusColors.appText),
                )
            }
        }
    }
    // A city refuses anything with a digit (a street number is an address, and a piece never says one).
    var refused by remember { mutableStateOf(false) }
    val whereField: @Composable (Modifier) -> Unit = { modifier ->
        Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Field(label = "Where") {
                OutlinedTextField(
                    value = place,
                    onValueChange = { typed ->
                        refused = typed.any(Char::isDigit)
                        if (!refused) onPlace(typed)
                    },
                    isError = refused,
                    singleLine = true,
                    placeholder = { Text("Camas, WA") },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.where"),
                )
            }
            Text(
                if (refused) "City and state only: no numbers, never the address" else "City only, never the address",
                style = SourcesType.caption.copy(color = if (refused) PantopusColors.error else PantopusColors.appTextMuted),
            )
        }
    }
    if (profileLargeText()) {
        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            whenField(Modifier.fillMaxWidth())
            whereField(Modifier.fillMaxWidth())
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.weight(1f)) { whenField(Modifier.fillMaxWidth()) }
            whereField(Modifier.weight(1f))
        }
    }
}

/** "Show it": Photos, Video, Document (and Link, below), what is added so far, and the attachments. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ShowIt(
    state: PieceEditorState,
    onPhotos: () -> Unit,
    onVideo: () -> Unit,
    onDocument: () -> Unit,
    onRemove: (String) -> Unit,
    onRetry: (String) -> Unit,
) {
    val canAdd = state.room > 0
    Field(label = "Show it", counter = "${state.count} of ${PieceEditorState.MAX_ATTACHMENTS} added") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                maxItemsInEachRow = if (profileLargeText()) 2 else 3,
            ) {
                AddButton(PantopusIcon.Image, "Photos", canAdd, onPhotos, Modifier.weight(1f))
                AddButton(PantopusIcon.Video, "Video", canAdd, onVideo, Modifier.weight(1f))
                AddButton(PantopusIcon.FileText, "Document", canAdd, onDocument, Modifier.weight(1f))
            }
            if (state.attachments.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
                    items(state.attachments, key = { it.key }) { attachment ->
                        AttachmentTile(attachment, onRemove = { onRemove(attachment.key) }, onRetry = { onRetry(attachment.key) })
                    }
                }
            }
        }
    }
}

@Composable
private fun AddButton(
    icon: PantopusIcon,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    Column(
        modifier =
            modifier
                .heightIn(min = 64.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(12.dp))
                .clickable(enabled = enabled, onClickLabel = "Add", role = Role.Button, onClick = onClick)
                .padding(vertical = 10.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        PantopusIconImage(
            icon = icon,
            contentDescription = null,
            size = 20.dp,
            tint = if (enabled) PantopusColors.appText else PantopusColors.appTextMuted,
        )
        Text(label, style = SourcesType.rowTitle.copy(color = if (enabled) PantopusColors.appText else PantopusColors.appTextMuted))
    }
}

/** One attachment in the strip: its picture (or a document mark), uploading, failed (try again), and remove. */
@Composable
private fun AttachmentTile(
    attachment: EditorAttachment,
    onRemove: () -> Unit,
    onRetry: () -> Unit,
) {
    val word =
        when (attachment.kind) {
            PieceAttachment.Kind.Photo -> "Photo"
            PieceAttachment.Kind.Video -> "Video"
            PieceAttachment.Kind.Document -> "Document"
        }
    Box(
        modifier =
            Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(PantopusColors.appSurfaceSunken)
                .then(if (attachment.failed) Modifier.border(2.dp, PantopusColors.error, RoundedCornerShape(10.dp)) else Modifier)
                .semantics(mergeDescendants = true) {
                    contentDescription =
                        when {
                            attachment.uploading -> "$word, uploading"
                            attachment.failed -> "$word, didn't upload"
                            else -> word
                        }
                },
        contentAlignment = Alignment.Center,
    ) {
        val picture = attachment.thumbnailUrl ?: attachment.url.takeIf { attachment.kind == PieceAttachment.Kind.Photo }
        when {
            attachment.kind == PieceAttachment.Kind.Document ->
                PantopusIconImage(
                    icon = PantopusIcon.FileText,
                    contentDescription = null,
                    size = 24.dp,
                    tint = PantopusColors.appTextSecondary,
                )
            picture != null -> PieceImage(picture, iconSize = 18.dp)
            attachment.source != null && attachment.kind == PieceAttachment.Kind.Photo ->
                PieceImage(attachment.source.toString(), iconSize = 18.dp)
            else ->
                PantopusIconImage(
                    icon = PantopusIcon.Video,
                    contentDescription = null,
                    size = 22.dp,
                    tint = PantopusColors.appTextSecondary,
                )
        }
        if (attachment.uploading) {
            Box(Modifier.fillMaxSize().background(PantopusColors.appText.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Text("Uploading", style = SourcesType.caption.copy(color = PantopusColors.appTextInverse))
            }
        }
        if (attachment.failed) {
            Box(
                Modifier
                    .fillMaxSize()
                    .clickable(onClickLabel = "Upload it again", role = Role.Button, onClick = onRetry),
                contentAlignment = Alignment.Center,
            ) {
                Text("Try again", style = SourcesType.caption.copy(color = PantopusColors.error, fontWeight = FontWeight.SemiBold))
            }
        }
        if (!attachment.uploading) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .size(40.dp)
                        .clickable(onClickLabel = "Remove $word", role = Role.Button, onClick = onRemove),
                contentAlignment = Alignment.TopEnd,
            ) {
                Box(
                    Modifier.padding(4.dp).size(22.dp).clip(CircleShape).background(PantopusColors.appText.copy(alpha = 0.72f)),
                    contentAlignment = Alignment.Center,
                ) {
                    PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 12.dp, tint = PantopusColors.appTextInverse)
                }
            }
        }
    }
}

/** A link in the editor (board 10): its card of words, "Prove it's yours" on a saved piece's Said card, and remove. */
@Composable
private fun EditorLinkCard(
    link: EditorLink,
    saved: Boolean,
    onProve: (PieceLinkCard) -> Unit,
    onRemove: () -> Unit,
) {
    val card =
        link.card ?: PieceLinkCard(
            url = link.url,
            kind = "site",
            site = link.url.substringAfter("://").substringBefore('/').removePrefix("www."),
            title = null,
            description = "Read when you save.",
            ink = ProfileInk.Said,
            how = "Said, until you prove the page is yours",
        )
    PieceLinkCardView(
        link = card,
        onOpen = null,
        footer = {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Only a saved card the server marks provable (p2.5): a page anyone can edit never offers it.
                val canProve = card.ink == ProfileInk.Said && card.id != null && saved && card.provable == true
                when {
                    canProve ->
                        Text(
                            "Prove it's yours",
                            style = SourcesType.title,
                            modifier =
                                Modifier
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(PantopusColors.appSurface)
                                    .clickable(role = Role.Button) { onProve(card) }
                                    .padding(horizontal = 16.dp, vertical = 13.dp),
                        )
                    card.ink == ProfileInk.Said && card.id == null ->
                        Text(
                            "You can prove it's yours once the piece is saved.",
                            style = SourcesType.caption,
                            modifier = Modifier.weight(1f),
                        )
                }
                if (canProve || card.id != null) Spacer(Modifier.weight(1f))
                Text(
                    "Remove",
                    style = SourcesType.link.copy(color = PantopusColors.appTextSecondary),
                    modifier =
                        Modifier
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClickLabel = "Remove this link", role = Role.Button, onClick = onRemove)
                            .padding(horizontal = 8.dp, vertical = 14.dp),
                )
            }
        },
    )
}

/** Who sees the piece: never wider than the Work part (the server keeps the narrower). */
@Composable
private fun AudienceChoice(
    audience: String,
    onChoose: (String) -> Unit,
) {
    Column(Modifier.sourcesCard().selectableGroup()) {
        listOf(
            "anyone" to "Anyone with your link",
            "members" to "People signed in to Pantopus",
            "connections" to "Your connections",
        ).forEachIndexed { index, (key, words) ->
            if (index > 0) SourcesDivider(Modifier.padding(horizontal = 16.dp))
            val selected = audience == key
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .selectable(selected = selected, role = Role.RadioButton, onClick = { onChoose(key) })
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .border(2.dp, if (selected) PantopusColors.primary600 else PantopusColors.appBorderStrong, CircleShape)
                        .padding(4.dp)
                        .clip(CircleShape)
                        .background(if (selected) PantopusColors.primary600 else PantopusColors.appSurface)
                        .clearAndSetSemantics { },
                )
                Text(words, style = SourcesType.body, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(label, style = SourcesType.body, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** Board 10's foot (and the owner's opened piece): the server's lines, each with the glyph of the ink it begins with. */
@Composable
internal fun HowItWillShow(
    lines: List<String>,
    title: String = "How this piece will show",
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(PantopusColors.appSurfaceSunken)
            .padding(16.dp)
            .testTag("profileSources.pieceEditor.howItWillShow"),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SourcesOverline(title)
        lines.forEach { line ->
            val ink =
                when {
                    line.startsWith("Seen") -> ProfileInk.Seen
                    line.startsWith("Signed") -> ProfileInk.Signed
                    line.startsWith("Said") -> ProfileInk.Said
                    else -> null
                }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(16.dp).padding(top = 4.dp, start = 3.dp)) { ink?.let { InkGlyph(it) } }
                Text(line, style = SourcesType.secondary.copy(color = PantopusColors.appText), modifier = Modifier.weight(1f))
            }
        }
    }
}

/** A month and its year, nothing finer (a piece says "August 2026"). Months to come can't be chosen. */
@Composable
private fun MonthPicker(
    chosen: YearMonth?,
    onChoose: (YearMonth?) -> Unit,
    onDismiss: () -> Unit,
) {
    val now = YearMonth.now()
    var year by remember { mutableIntStateOf(chosen?.year ?: now.year) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("When was it?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ProfileIconButton(icon = PantopusIcon.ChevronLeft, label = "Year before", onClick = { year -= 1 })
                    Text("$year", style = SourcesType.h3, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                    if (year < now.year) {
                        ProfileIconButton(icon = PantopusIcon.ChevronRight, label = "Year after", onClick = { year += 1 })
                    } else {
                        Spacer(Modifier.size(48.dp))
                    }
                }
                for (row in (1..12).chunked(3)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { m ->
                            val month = YearMonth.of(year, m)
                            val enabled = !month.isAfter(now)
                            val selected = month == chosen
                            Box(
                                modifier =
                                    Modifier
                                        .weight(1f)
                                        .heightIn(min = 48.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (selected) PantopusColors.appText else PantopusColors.appSurfaceSunken)
                                        .clickable(enabled = enabled, role = Role.Button) { onChoose(month) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    month.month.getDisplayName(TextStyle.SHORT, Locale.US),
                                    style =
                                        SourcesType.rowTitle.copy(
                                            color =
                                                when {
                                                    selected -> PantopusColors.appTextInverse
                                                    enabled -> PantopusColors.appText
                                                    else -> PantopusColors.appTextMuted
                                                },
                                        ),
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        dismissButton = {
            if (chosen != null) TextButton(onClick = { onChoose(null) }) { Text("No month") }
        },
    )
}

/** One thing to put on the page, under what it is for, with its copy button. */
@Composable
private fun ProofSnippet(
    label: String,
    text: String,
    copyLabel: String,
    tag: String,
    onCopy: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = SourcesType.rowTitle)
        Text(
            text,
            style = SourcesType.secondary.copy(fontFamily = FontFamily.Monospace, color = PantopusColors.appText),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(PantopusColors.appSurfaceSunken)
                    .padding(12.dp)
                    .testTag(tag),
        )
        Text(
            copyLabel,
            style = SourcesType.link,
            modifier =
                Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = onCopy)
                    .padding(vertical = 14.dp),
        )
    }
}

/** "Prove it's yours" (P2.4): the server's sentence, the line and the meta tag to put on the page, then "Check now". */
@Composable
private fun ProofDialog(
    proof: EditorProof,
    onCheck: () -> Unit,
    onClose: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Prove the page is yours") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val line = proof.proof
                if (line == null) {
                    Text("Getting your line…", style = SourcesType.secondary)
                } else {
                    // The server's sentence first, then the line for a page's title or description, then the meta tag.
                    Text(line.how, style = SourcesType.secondary.copy(color = PantopusColors.appText))
                    ProofSnippet(
                        label = "For the page's title or description",
                        text = line.line,
                        copyLabel = "Copy the line",
                        tag = "profileSources.pieceEditor.proofLine",
                        onCopy = { clipboard.setText(AnnotatedString(line.line)) },
                    )
                    line.meta?.let { meta ->
                        ProofSnippet(
                            label = "For your own site",
                            text = meta,
                            copyLabel = "Copy the tag",
                            tag = "profileSources.pieceEditor.proofMeta",
                            onCopy = { clipboard.setText(AnnotatedString(meta)) },
                        )
                    }
                    proof.problem?.let { problem ->
                        Text(problem, style = SourcesType.secondary.copy(color = PantopusColors.error))
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onCheck, enabled = proof.proof != null && !proof.checking) {
                Text(if (proof.checking) "Checking…" else "Check now")
            }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
