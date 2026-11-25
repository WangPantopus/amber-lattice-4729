@file:Suppress("LongMethod", "LongParameterList", "CyclomaticComplexMethod", "MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.profile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.profile.sources.OwnerWorkStart
import app.pantopus.android.ui.screens.profile.sources.PieceEditorRequest
import app.pantopus.android.ui.screens.profile.sources.PieceEditorRequestSaver
import app.pantopus.android.ui.screens.profile.sources.PieceEditorResult
import app.pantopus.android.ui.screens.profile.sources.PieceOffer
import app.pantopus.android.ui.screens.profile.sources.ProfileBlock
import app.pantopus.android.ui.screens.profile.sources.ProfileMonthSheet
import app.pantopus.android.ui.screens.profile.sources.ProfileMonthState
import app.pantopus.android.ui.screens.profile.sources.ProfileOwnerWorkViewModel
import app.pantopus.android.ui.screens.profile.sources.ProfilePage
import app.pantopus.android.ui.screens.profile.sources.ProfilePageAction
import app.pantopus.android.ui.screens.profile.sources.ProfilePageLink
import app.pantopus.android.ui.screens.profile.sources.ProfilePieceEditor
import app.pantopus.android.ui.screens.profile.sources.ProfilePieceScreen
import app.pantopus.android.ui.screens.profile.sources.ProfilePieceState
import app.pantopus.android.ui.screens.profile.sources.ProfileSourcesFrame
import app.pantopus.android.ui.screens.profile.sources.RecordMonth
import app.pantopus.android.ui.screens.profile.sources.SourcesBlockActions
import app.pantopus.android.ui.screens.profile.sources.SourcesFrameSlots
import app.pantopus.android.ui.screens.profile.sources.SourcesType
import app.pantopus.android.ui.screens.profile.sources.SourcesVisitorBar
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import java.util.UUID

/** Where the profile with sources hands off to today's screen and the app. */
internal class SourcesHostCallbacks(
    val onBack: () -> Unit,
    val onOverflow: () -> Unit,
    /** The owner's Share: the share sheet with parts (board 21). */
    val onOpenShareSheet: () -> Unit,
    /** A visitor's Share: the link through the system share sheet. */
    val onShareLink: (String) -> Unit,
    val onSelectTab: (String) -> Unit,
    val onOpenMonth: (RecordMonth) -> Unit,
    val onCloseMonth: () -> Unit,
    val onOpenPost: (String) -> Unit,
    val onOpenProfile: (String) -> Unit,
    val onOpenPlan: (String) -> Unit,
    val onOpenGig: (String) -> Unit,
    val onOpenSupportTrain: (String) -> Unit,
    val onOpenUrl: (String) -> Unit,
    /** Opens a `pantopus://` link through the app's router (a business by its username, a person by theirs). */
    val onOpenAppLink: (Uri) -> Unit,
    /** The person's posts: today's Posts list on its own page (or, on your own page, My posts). */
    val onOpenPosts: () -> Unit,
    /** The person's Moments: their ring's player, when they have one now. */
    val onOpenMoments: (String) -> Unit,
    /** The owner added or removed pieces: the page is read again. */
    val onPiecesChanged: () -> Unit = {},
    /** One piece opened over the page (board 8), and closed again; [onRetryPiece] reads it again. */
    val onOpenPiece: (String) -> Unit = {},
    val onClosePiece: () -> Unit = {},
    val onRetryPiece: () -> Unit = {},
)

/**
 * The profile with sources inside today's profile screen: [page] is drawn by `ProfileSourcesFrame`, and everything
 * around it (Connect, Message and their sheets, ⋯, the owner's Edit profile, Preview as, tips, account list and Log
 * out, the pinned row) is today's, so it all works as it does today (SPEC §2, "What stays").
 */
@Composable
internal fun ProfileSourcesPage(
    page: ProfilePage,
    content: PublicProfileContent,
    mode: ProfileFrameMode,
    actions: ProfileActionsState,
    callbacks: ProfileActionCallbacks,
    pinned: List<PinnedCard>?,
    selectedTab: String?,
    month: ProfileMonthState?,
    viewerId: String?,
    host: SourcesHostCallbacks,
    piece: ProfilePieceState? = null,
) {
    val owner = mode as? ProfileFrameMode.Owner
    val preview = mode as? ProfileFrameMode.Preview
    val header = page.header
    val shareUrl = page.actions.filterIsInstance<ProfilePageAction.Share>().firstOrNull()?.url
    val context = LocalContext.current
    // Phase 2 (board 10): the owner's offers and pieces at the top of Work, and the piece editor over the page.
    val ownerWork: ProfileOwnerWorkViewModel? = if (owner != null && preview == null) hiltViewModel() else null
    val ownerPieces = ownerWork?.state?.collectAsStateWithLifecycle()?.value
    LaunchedEffect(ownerWork) { ownerWork?.load() }
    var editor by rememberSaveable(stateSaver = PieceEditorRequestSaver) { mutableStateOf<PieceEditorRequest?>(null) }

    fun openEditor(
        pieceId: String?,
        offer: PieceOffer?,
    ) {
        editor = PieceEditorRequest(UUID.randomUUID().toString(), pieceId, offer)
    }
    val onOpenLink: (ProfilePageLink) -> Unit = { link ->
        when (link) {
            is ProfilePageLink.Tab -> host.onSelectTab(link.key)
            ProfilePageLink.Record -> host.onSelectTab("record")
            is ProfilePageLink.Month ->
                link.month.split("-").takeIf { it.size == 2 }?.let { (y, m) ->
                    val year = y.toIntOrNull()
                    val index = m.toIntOrNull()?.minus(1)
                    if (year != null && index != null && index in 0..11) host.onOpenMonth(RecordMonth(year, index))
                }
            is ProfilePageLink.Piece -> host.onOpenPiece(link.id)
            is ProfilePageLink.Business -> host.onOpenAppLink(Uri.parse("pantopus://b/${Uri.encode(link.username)}"))
            is ProfilePageLink.Profile ->
                link.userId?.let(host.onOpenProfile)
                    ?: link.username?.let { host.onOpenAppLink(Uri.parse("pantopus://u/${Uri.encode(it)}")) }
            is ProfilePageLink.Plan -> host.onOpenPlan(link.id)
            is ProfilePageLink.Gig -> host.onOpenGig(link.id)
            is ProfilePageLink.SupportTrain -> host.onOpenSupportTrain(link.id)
            is ProfilePageLink.Posts -> host.onOpenPosts()
            is ProfilePageLink.Moments -> host.onOpenMoments(link.userId)
            is ProfilePageLink.Url -> host.onOpenUrl(link.url)
        }
    }
    val blockActions =
        SourcesBlockActions(
            onOpenLink = onOpenLink,
            onOpenMonth = host.onOpenMonth,
            onConnect = callbacks.onConnect.takeIf { actions.connection == ProfileConnection.None && preview == null },
            viewerId = viewerId,
            interactive = preview == null,
        )
    val slots =
        SourcesFrameSlots(
            topBar = {
                when (mode) {
                    is ProfileFrameMode.Preview -> PreviewBanner(audience = mode.audience, onDone = mode.onDone)
                    is ProfileFrameMode.Owner -> OwnerTopBar(cover = mode.cover, onClose = host.onBack, onShare = host.onOpenShareSheet)
                    ProfileFrameMode.Visitor ->
                        SourcesVisitorBar(
                            firstName = header.firstName,
                            onBack = host.onBack,
                            onShare = shareUrl?.let { url -> { host.onShareLink(url) } },
                            onMore = host.onOverflow,
                        )
                }
            },
            headerActions = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ProfileFrameHeaderActions(
                        mode = mode,
                        content = content,
                        header = owner?.extras?.let { ownerHeader(content.header, it) } ?: content.header,
                        actions = actions,
                        callbacks = callbacks,
                        hasNoPins = pinned?.isEmpty() == true,
                    )
                    if (mode == ProfileFrameMode.Visitor) {
                        ReachButtons(
                            page = page,
                            onCall = { phone -> context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(phone)}"))) },
                            onEmail = {
                                    email ->
                                context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${Uri.encode(email)}")))
                            },
                        )
                    }
                }
            },
            pinnedPosts = {
                PinnedRow(
                    cards = pinned.orEmpty(),
                    onOpen = host.onOpenPost.takeIf { preview == null },
                    onEdit = callbacks.onEditProfile.takeIf { owner != null },
                )
            },
            workStart =
                owner?.takeIf { preview == null }?.let {
                    {
                        OwnerWorkStart(
                            offers = ownerPieces?.offered.orEmpty(),
                            onStart = { offer -> openEditor(pieceId = null, offer = offer) },
                            onAdd = { openEditor(pieceId = null, offer = null) },
                        )
                    }
                },
            pageEnd = {
                if (owner != null) {
                    OwnerAccountSection(
                        extras = owner.extras ?: OwnerExtras(),
                        navigation = owner.navigation,
                        onOpenMonth = owner.actions.onOpenMonth,
                        onShareMonth = owner.actions.onShareMonth,
                        onOpenInvite = owner.actions.onOpenInvite,
                        onLogOut = owner.actions.onLogOut,
                    )
                }
            },
            onShare =
                when {
                    preview != null -> null
                    owner != null -> host.onOpenShareSheet
                    else -> shareUrl?.let { url -> { host.onShareLink(url) } }
                },
            onBack = {
                if (selectedTab != null && selectedTab != page.tabs.firstOrNull()?.key) {
                    host.onSelectTab(
                        page.tabs.first().key,
                    )
                } else {
                    host.onBack()
                }
            },
        )
    // An opened piece covers the page, which stays where it was underneath (its scroll, its tab) for Back.
    Box(Modifier.fillMaxSize()) {
        Box(if (piece != null || editor != null) Modifier.clearAndSetSemantics { } else Modifier) {
            ProfileSourcesFrame(
                page = page,
                selectedTab = selectedTab,
                onSelectTab = host.onSelectTab,
                slots = slots,
                actions = blockActions,
                month = month?.takeIf { it !is ProfileMonthState.Empty }?.at,
            )
        }
        if (piece != null) {
            Box(if (editor != null) Modifier.clearAndSetSemantics { } else Modifier) {
                ProfilePieceScreen(
                    state = piece,
                    firstName = if (owner != null && preview == null) "you" else header.firstName,
                    onBack = host.onClosePiece,
                    onRetry = host.onRetryPiece,
                    onOpenLink = onOpenLink,
                    onEdit = { openEditor(pieceId = piece.id, offer = null) }.takeIf { owner != null && preview == null },
                )
            }
        }
        editor?.let { request ->
            ProfilePieceEditor(
                ownerId = header.userId,
                request = request,
                onClose = { result ->
                    editor = null
                    if (result != PieceEditorResult.Cancelled) {
                        ownerWork?.load()
                        host.onPiecesChanged()
                        when {
                            piece == null -> Unit
                            result == PieceEditorResult.Removed -> host.onClosePiece()
                            else -> host.onRetryPiece()
                        }
                    }
                },
            )
        }
    }
    val chart = page.tabs.flatMap { it.blocks }.filterIsInstance<ProfileBlock.RecordChart>().firstOrNull()
    if (month != null && month !is ProfileMonthState.Empty && chart != null) {
        ProfileMonthSheet(
            state = month,
            chart = chart,
            onOpenMonth = host.onOpenMonth,
            onOpenLink = { link ->
                host.onCloseMonth()
                onOpenLink(link)
            },
            onDismiss = host.onCloseMonth,
        )
    }
}

/** Call and Email for someone who shows them to this viewer (board 3, connections and household only). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReachButtons(
    page: ProfilePage,
    onCall: (String) -> Unit,
    onEmail: (String) -> Unit,
) {
    val call = page.actions.filterIsInstance<ProfilePageAction.Call>().firstOrNull()
    val email = page.actions.filterIsInstance<ProfilePageAction.Email>().firstOrNull()
    if (call == null && email == null) return
    ProfileActionRow(profileLargeText()) {
        call?.let {
            ProfileActionButton(
                title = "Call",
                icon = PantopusIcon.Phone,
                primary = false,
                onClick = { onCall(it.phone) },
                modifier = Modifier.weight(1f),
                testTag = "profileSources.call",
            )
        }
        email?.let {
            ProfileActionButton(
                title = "Email",
                icon = PantopusIcon.Mail,
                primary = false,
                onClick = { onEmail(it.email) },
                modifier = Modifier.weight(1f),
                testTag = "profileSources.email",
            )
        }
    }
}

/**
 * The person's posts on their own page (the November 1 Posts tab, which the profile with sources turns into a row;
 * SPEC §2): today's Pulse cards, empty state and Try again.
 */
@Composable
internal fun ProfileSourcesPostsPage(
    firstName: String,
    content: PublicProfileContent,
    cards: List<PulsePostCardContent>,
    actions: ProfilePostCardActions,
    loadFailed: Boolean,
    loading: Boolean,
    hiddenByBlock: Boolean,
    onSayHi: () -> Unit,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(PantopusColors.appBg).testTag("profileSources.posts")) {
        Row(
            modifier = Modifier.fillMaxWidth().background(PantopusColors.appSurface).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProfileIconButton(
                icon = PantopusIcon.ChevronLeft,
                label = "Back",
                onClick = onBack,
                iconSize = 26.dp,
                testTag = "profileSources.posts.back",
            )
            Text(
                text = "$firstName's posts",
                style = SourcesType.title,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Spacer(Modifier.size(48.dp))
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 12.dp)) {
            Box(Modifier.fillMaxWidth()) {
                LocalProfilePosts(
                    cards = cards,
                    actions = actions,
                    firstName = firstName,
                    joinedRecently = content.header.trust.joinedRecently,
                    isOwnProfile = content.isOwner,
                    loadFailed = loadFailed,
                    hiddenByBlock = hiddenByBlock,
                    onSayHi = onSayHi,
                    onRetry = onRetry,
                    loading = loading,
                )
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}
