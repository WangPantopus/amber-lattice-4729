@file:Suppress("LongMethod", "MagicNumber", "LongParameterList", "MatchingDeclarationName", "CyclomaticComplexMethod")

package app.pantopus.android.ui.screens.profile.sources

import android.content.Context
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.InviteLinks
import app.pantopus.android.ui.components.Toast
import app.pantopus.android.ui.components.ToastAppearance
import app.pantopus.android.ui.components.shareText
import app.pantopus.android.ui.screens.profile.PreviewAudience
import app.pantopus.android.ui.screens.profile.PreviewBanner
import app.pantopus.android.ui.screens.profile.ProfileAvatar
import app.pantopus.android.ui.screens.profile.ProfileIconButton
import app.pantopus.android.ui.screens.profile.profileLargeText
import app.pantopus.android.ui.screens.scheduling.bookingpage.QrCanvas
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import kotlinx.coroutines.delay

/** The words for each part's switch (board 21); a key the app doesn't know is left out. */
internal data class PartWords(
    val title: String,
    val note: String?,
)

private const val NEW_LINK = "new"

private const val SWITCHED_OFF_NOTE =
    "A part you switch off simply isn't there. Nothing on the page says it exists, and the page closes up around it."

private val ABOUT_YOU =
    linkedMapOf(
        "says" to PartWords("Says", "Your one line"),
        "prompts" to PartWords("Get to know", "Your answers"),
        "shelf" to PartWords("Shelf", null),
        "city" to PartWords("City", null),
    )

private val WHAT_YOU_DID =
    linkedMapOf(
        "work" to PartWords("Work", "What you can do, your pieces and what you own"),
        "known_for" to PartWords("Known for", "Writers show by name only if they allow it."),
        "record_work" to PartWords("Record: work and learning", null),
        "record_home" to PartWords("Record: home", "That your home is verified. Never the address."),
        "record_others" to PartWords("Record: with others", null),
        "met" to PartWords("Met in person", "A count. Names are never on a shared page."),
        "reviews" to PartWords("Reviews", "Job reviews, all of them or none"),
    )

private val REACHING_YOU =
    linkedMapOf(
        "doors" to PartWords("Doors", "Hire, ask, send a card, leave a card. A visitor signs in to use one."),
    )

/** Every part's words, in board 21's order (a link for one purpose lists them the same way). */
internal val PART_WORDS: Map<String, PartWords> = ABOUT_YOU + WHAT_YOU_DID + REACHING_YOU

/**
 * Share your profile (board 21): the link with Copy link, Send and Show code; a switch for each part the link shows
 * (on: anyone with the link; off: only people signed in to Pantopus); search engines; then See it as a visitor and
 * Save as PDF. Links for one purpose wait on the founder (SPEC 9.1) and are not here. A made-up username is never
 * shared: [onPickUsername] opens the app's username prompt first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfileShareSheet(
    name: String,
    portraitUrl: String?,
    userId: String,
    onPickUsername: (currentUsername: String) -> Unit,
    onDismiss: () -> Unit,
    /** Bumped after the username prompt saved a new name: the sheet reads its link again. */
    reloadKey: Int = 0,
    model: ProfileShareViewModel = hiltViewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    val notice by model.notice.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var showVisitor by rememberSaveable { mutableStateOf(false) }
    var showCode by rememberSaveable { mutableStateOf<String?>(null) }
    // A link for one purpose: "new" to make one, else the open link's id.
    var linkSheet by rememberSaveable { mutableStateOf<String?>(null) }
    val linkPreview by model.linkPreview.collectAsStateWithLifecycle()
    val linkSaving by model.linkSaving.collectAsStateWithLifecycle()
    LaunchedEffect(reloadKey) { model.load() }
    // A link's page shown last time doesn't come back when the sheet opens again.
    DisposableEffect(Unit) { onDispose { model.endLinkPreview() } }
    LaunchedEffect(notice) {
        if (notice != null) {
            delay(2_000)
            model.clearNotice()
        }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PantopusColors.appBg,
        modifier = Modifier.testTag("profileSources.shareSheet"),
    ) {
        Box(Modifier.fillMaxWidth().fillMaxHeight(0.96f)) {
            val loaded = state as? ProfileShareUiState.Loaded
            val visitor = loaded?.share?.visitor
            val linkPage = (linkPreview as? LinkPreviewState.Ready)?.page
            // Back ends a visitor's view first; only then does it close the sheet.
            BackHandler(enabled = linkPage != null) { model.endLinkPreview() }
            BackHandler(enabled = linkPage == null && showVisitor) { showVisitor = false }
            if (linkPage != null) {
                ProfileSourcesFrame(
                    page = linkPage,
                    selectedTab = null,
                    onSelectTab = {},
                    slots =
                        SourcesFrameSlots(
                            topBar = { PreviewBanner(audience = PreviewAudience.Anyone, onDone = model::endLinkPreview) },
                            headerActions = {},
                            pinnedPosts = {},
                            onShare = null,
                            onBack = model::endLinkPreview,
                        ),
                    actions = SourcesBlockActions(interactive = false),
                )
            } else if (showVisitor && visitor != null) {
                ProfileSourcesFrame(
                    page = visitor,
                    selectedTab = null,
                    onSelectTab = {},
                    slots =
                        SourcesFrameSlots(
                            topBar = { PreviewBanner(audience = PreviewAudience.Anyone, onDone = { showVisitor = false }) },
                            headerActions = {},
                            pinnedPosts = {},
                            onShare = null,
                            onBack = { showVisitor = false },
                        ),
                    actions = SourcesBlockActions(interactive = false),
                )
            } else {
                Column(Modifier.fillMaxSize()) {
                    ShareBar(onClose = onDismiss)
                    when (val s = state) {
                        ProfileShareUiState.Loading -> Box(Modifier.fillMaxWidth().padding(32.dp)) { }
                        is ProfileShareUiState.Error ->
                            Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(s.message, style = SourcesType.body)
                                TextButton(onClick = model::load, modifier = Modifier.heightIn(min = 48.dp)) { Text("Try again") }
                            }
                        is ProfileShareUiState.Loaded -> {
                            val share = s.share
                            val guard: (() -> Unit) -> Unit = { act ->
                                if (share.usernameIsMadeUp) onPickUsername(share.username) else act()
                            }
                            // The app's own link (this build's web origin), as `InviteLinks` builds every shared page.
                            val mainUrl = InviteLinks.profilePageUrl(share.username)
                            Column(
                                modifier =
                                    Modifier
                                        .weight(1f)
                                        .verticalScroll(rememberScrollState())
                                        .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                LinkCard(
                                    name = name,
                                    portraitUrl = portraitUrl,
                                    userId = userId,
                                    url = mainUrl,
                                    onCopy = {
                                        guard {
                                            clipboard.setText(AnnotatedString(mainUrl))
                                            model.say("Copied.")
                                        }
                                    },
                                    onSend = { guard { context.shareText(mainUrl) } },
                                    onShowCode = { guard { showCode = mainUrl } },
                                )
                                Text(
                                    text = SWITCHED_OFF_NOTE,
                                    style = SourcesType.secondary.copy(color = PantopusColors.primary900),
                                    modifier =
                                        Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(PantopusColors.primary50)
                                            .border(1.dp, PantopusColors.primary200, RoundedCornerShape(16.dp))
                                            .padding(horizontal = 14.dp, vertical = 12.dp),
                                )
                                PartsCard(
                                    title = "About you",
                                    words = ABOUT_YOU,
                                    share = share,
                                    saving = s.saving,
                                    leading = { FixedShareRow("Portrait, name and rings", "Always shown", divider = false) },
                                    onToggle = model::setPart,
                                )
                                PartsCard(
                                    title = "What you've done",
                                    words = WHAT_YOU_DID,
                                    share = share,
                                    saving = s.saving,
                                    onToggle = model::setPart,
                                )
                                PartsCard(
                                    title = "Reaching you",
                                    words = REACHING_YOU,
                                    share = share,
                                    saving = s.saving,
                                    trailing = { FixedShareRow("Phone and email", "Never on a link. Connections only.") },
                                    onToggle = model::setPart,
                                )
                                Column(Modifier.sourcesCard()) {
                                    ShareSwitchRow(
                                        title = "Let search engines list this page",
                                        note = "On unless you switch it off. Links for one purpose are never listed.",
                                        on = share.searchEngines,
                                        enabled = "search_engines" !in s.saving,
                                        tag = "profileSources.share.search_engines",
                                        onToggle = model::setSearchEngines,
                                    )
                                }
                                ShareLinksSection(
                                    share = share,
                                    saving = s.saving,
                                    onSetEnabled = model::setLinksEnabled,
                                    onOpen = { link -> linkSheet = link.id },
                                    onMake = { guard { linkSheet = NEW_LINK } },
                                )
                            }
                            ShareFooter(
                                onSeeVisitor = share.visitor?.let { { showVisitor = true } },
                                onSavePdf = { guard { printProfileLink(context, mainUrl, "$name on Pantopus") } },
                            )
                            showCode?.let { url -> CodeDialog(url = url, onDismiss = { showCode = null }) }
                            linkSheet?.let { id ->
                                val link = share.links.firstOrNull { it.id == id }
                                if (id == NEW_LINK || link != null) {
                                    val linkUrl: (
                                        ShareLink,
                                    ) -> String? = { it.key?.let { key -> InviteLinks.profileKeyUrl(share.username, key) } }
                                    ShareLinkSheet(
                                        link = link,
                                        share = share,
                                        saving = linkSaving,
                                        onCreate = { linkName, parts, endsOn ->
                                            model.createLink(linkName, parts, endsOn) { made -> linkSheet = made.id }
                                        },
                                        onUpdate = { parts, endsOn, clearEnd, switchedOff ->
                                            link?.let { model.updateLink(it.id, null, parts, endsOn, clearEnd, switchedOff) }
                                        },
                                        onDelete = { link?.let { model.deleteLink(it.id) { linkSheet = null } } },
                                        onCopy = { l ->
                                            linkUrl(l)?.let {
                                                clipboard.setText(AnnotatedString(it))
                                                model.say("Copied.")
                                            }
                                        },
                                        onSend = { l -> linkUrl(l)?.let { context.shareText(it) } },
                                        onPreview = { l ->
                                            linkSheet = null
                                            model.previewLink(l)
                                        },
                                        onDismiss = { linkSheet = null },
                                    )
                                }
                            }
                            if (linkPreview == LinkPreviewState.Failed) {
                                LaunchedEffect(Unit) {
                                    model.say("That link doesn't open right now.")
                                    model.endLinkPreview()
                                }
                            }
                        }
                    }
                }
            }
            notice?.let { message ->
                Toast(
                    text = message,
                    appearance =
                        ToastAppearance(
                            background = PantopusColors.appText.copy(alpha = 0.9f),
                            foreground = PantopusColors.appTextInverse,
                            textStyle = PantopusTextStyle.small,
                        ),
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp),
                )
            }
        }
    }
}

@Composable
private fun ShareBar(onClose: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(PantopusColors.appSurface).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileIconButton(
            icon = PantopusIcon.X,
            label = "Close",
            onClick = onClose,
            iconSize = 22.dp,
            testTag = "profileSources.share.close",
        )
        Text(
            text = "Share your profile",
            style = SourcesType.title.copy(color = PantopusColors.appTextStrong),
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        Spacer(Modifier.size(48.dp))
    }
}

/** The link with its three ways out (board 21). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkCard(
    name: String,
    portraitUrl: String?,
    userId: String,
    url: String,
    onCopy: () -> Unit,
    onSend: () -> Unit,
    onShowCode: () -> Unit,
) {
    Column(Modifier.sourcesCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.border(2.dp, PantopusColors.appText, androidx.compose.foundation.shape.CircleShape).padding(2.dp)) {
                ProfileAvatar(name = name, photoUrl = portraitUrl, seed = userId, size = 40.dp)
            }
            Column(Modifier.weight(1f)) {
                Text(
                    url.removePrefix("https://").removePrefix("http://"),
                    style = SourcesType.title,
                    modifier = Modifier.testTag("profileSources.share.url"),
                )
                Text("Anyone with this link can open it. No account needed.", style = SourcesType.caption)
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            // At the largest text sizes each button takes a row of its own, as the profile's own actions do.
            maxItemsInEachRow = if (profileLargeText()) 1 else 3,
        ) {
            ShareButton("Copy link", primary = true, onClick = onCopy, tag = "profileSources.share.copy", modifier = Modifier.weight(1f))
            ShareButton("Send", primary = false, onClick = onSend, tag = "profileSources.share.send", modifier = Modifier.weight(1f))
            ShareButton(
                "Show code",
                primary = false,
                onClick = onShowCode,
                tag = "profileSources.share.code",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ShareButton(
    title: String,
    primary: Boolean,
    onClick: () -> Unit,
    tag: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .widthIn(min = 96.dp)
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (primary) PantopusColors.primary600 else PantopusColors.appSurface)
                .then(if (primary) Modifier else Modifier.border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(12.dp)))
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 8.dp, vertical = 10.dp)
                .testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = title,
            style = SourcesType.title.copy(color = if (primary) PantopusColors.appTextInverse else PantopusColors.appText),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PartsCard(
    title: String,
    words: Map<String, PartWords>,
    share: ProfileShareState,
    saving: Set<String>,
    onToggle: (String, Boolean) -> Unit,
    leading: @Composable () -> Unit = {},
    trailing: @Composable () -> Unit = {},
) {
    // A part with nothing in it yet has no switch (contract §6): there is nothing it could show.
    val parts = words.keys.mapNotNull { key -> share.parts.firstOrNull { it.key == key && it.hasContent } }
    Column(Modifier.sourcesCard()) {
        SourcesOverline(title, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp))
        leading()
        parts.forEach { part ->
            SourcesDivider()
            val word = words.getValue(part.key)
            val note =
                when {
                    part.key == "city" && share.cityLimit == "none" -> "Only you see your city (Settings, Privacy)."
                    part.key == "city" && share.cityLimit != "anyone" -> "Your privacy setting keeps your city to your connections."
                    part.key == "city" && !part.on -> "Off, the page names no place"
                    else -> word.note
                }
            ShareSwitchRow(
                title = word.title,
                note = note,
                on = part.on && !(part.key == "city" && share.cityLimit != "anyone"),
                enabled = part.key !in saving && !(part.key == "city" && share.cityLimit != "anyone"),
                tag = "profileSources.share.${part.key}",
                onToggle = { onToggle(part.key, it) },
            )
        }
        trailing()
    }
}

@Composable
internal fun FixedShareRow(
    title: String,
    note: String,
    divider: Boolean = true,
) {
    if (divider) SourcesDivider()
    Column(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 12.dp).semantics(mergeDescendants = true) { },
    ) {
        Text(title, style = SourcesType.rowTitle)
        Text(note, style = SourcesType.caption)
    }
}

/** A part's row: the whole row toggles (a 48 dp target), and TalkBack reads it as a switch with its words. */
@Composable
internal fun ShareSwitchRow(
    title: String,
    note: String?,
    on: Boolean,
    enabled: Boolean,
    tag: String,
    onToggle: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onToggle)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = SourcesType.rowTitle)
            note?.let { Text(it, style = SourcesType.caption) }
        }
        Switch(
            checked = on,
            onCheckedChange = null,
            enabled = enabled,
            colors =
                SwitchDefaults.colors(
                    checkedTrackColor = PantopusColors.primary600,
                    uncheckedTrackColor = PantopusColors.appBorderStrong,
                    uncheckedBorderColor = PantopusColors.appBorderStrong,
                    uncheckedThumbColor = PantopusColors.appSurface,
                ),
        )
    }
}

@Composable
private fun ShareFooter(
    onSeeVisitor: (() -> Unit)?,
    onSavePdf: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(PantopusColors.appSurface)
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (onSeeVisitor != null) {
            ShareButton(
                "See it as a visitor",
                primary = false,
                onClick = onSeeVisitor,
                tag = "profileSources.share.visitor",
                modifier = Modifier.weight(1f),
            )
        }
        Box(
            modifier =
                Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(PantopusColors.appSurfaceSunken)
                    .clickable(role = Role.Button, onClick = onSavePdf)
                    .padding(horizontal = 8.dp, vertical = 10.dp)
                    .testTag("profileSources.share.pdf"),
            contentAlignment = Alignment.Center,
        ) {
            Text("Save as PDF", style = SourcesType.title, textAlign = TextAlign.Center)
        }
    }
}

/** Show code: the link as a code someone can scan from this screen. */
@Composable
private fun CodeDialog(
    url: String,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } },
        title = { Text("Scan to open your profile", style = SourcesType.title) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Box(Modifier.size(240.dp).background(PantopusColors.appSurface).padding(12.dp)) {
                    QrCanvas(url = url, modifier = Modifier.fillMaxSize().semantics { heading() })
                }
                Spacer(Modifier.height(8.dp))
                Text(url.removePrefix("https://"), style = SourcesType.caption.copy(fontWeight = FontWeight.SemiBold))
            }
        },
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.testTag("profileSources.share.codeDialog"),
    )
}

/**
 * Save as PDF: the system's print, to "Save as PDF", of the page a signed-out visitor gets at [url] (the web's print
 * style lays it out; profile-web DECISIONS 11-23). The page loads without the app's sign-in, so a part that is off is
 * absent from the PDF too.
 */
private fun printProfileLink(
    context: Context,
    url: String,
    jobName: String,
) {
    val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
    val webView = WebView(context)
    webView.webViewClient =
        object : WebViewClient() {
            private var printed = false

            override fun onPageFinished(
                view: WebView,
                loadedUrl: String?,
            ) {
                if (printed) return
                printed = true
                printManager.print(jobName, view.createPrintDocumentAdapter(jobName), null)
            }
        }
    webView.settings.javaScriptEnabled = true
    webView.loadUrl(url)
}
