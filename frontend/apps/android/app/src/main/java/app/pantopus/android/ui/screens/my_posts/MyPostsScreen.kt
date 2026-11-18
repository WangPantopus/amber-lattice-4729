@file:Suppress("PackageNaming", "LongMethod", "LongParameterList")

package app.pantopus.android.ui.screens.my_posts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.pantopus.android.data.api.models.posts.MyPostDto
import app.pantopus.android.ui.components.RefreshNotice
import app.pantopus.android.ui.components.RefreshOnStoreChange
import app.pantopus.android.ui.components.Toast
import app.pantopus.android.ui.components.ToastKind
import app.pantopus.android.ui.components.ToastMessage
import app.pantopus.android.ui.components.rememberShareTextWithCompletion
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCard
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.feed.pulse.PulseRepostChooserSheet
import app.pantopus.android.ui.screens.profile.ProfilePinCopy
import app.pantopus.android.ui.screens.profile.ProfilePostCards
import app.pantopus.android.ui.screens.profile.ProfilePostOptionsSheet
import app.pantopus.android.ui.screens.profile.ProfilePostReportDialog
import app.pantopus.android.ui.screens.profile.profilePostHasOptions
import app.pantopus.android.ui.screens.shared.activity_filter_sheet.ActivityFilterSheet
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsScreen
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsTab
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsUiState
import app.pantopus.android.ui.screens.shared.list_of_rows.RowModel
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow

/** Test tag on the My posts root container. */
const val MY_POSTS_TAG = "my-posts"

/** How long a failed-action toast stays, as on the post page. */
private const val TOAST_MILLIS = 2_500L

/**
 * T5.3.3 — My posts. Thin wrapper around [ListOfRowsScreen]. Four tabs
 * (Active / Archived / Saved / Reposts), 52dp secondary-create FAB, filter
 * icon in the top-bar trailing slot. Each post is drawn as its Pulse card, as on the Pulse tab, with the card's
 * controls; a post the build can't read as a card keeps the shell's row. Your own posts' ⋯ opens a modal bottom sheet
 * (Edit, Pin, Archive / Restore + Delete) → confirmation alert (for the destructive Delete action). Saved and Reposts
 * list other people's posts ([OffsetPostsTabViewModel]); their ⋯ is the profile's Post options (Share…, Report post).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyPostsScreen(
    onBack: () -> Unit,
    onOpenPost: (MyPostDto) -> Unit,
    onCompose: () -> Unit = {},
    onEditPost: (MyPostDto) -> Unit = {},
    /** The tab to open on (`my-posts?tab=saved`, the "Saved." toast's View); null opens Active. */
    initialTab: String? = null,
    /** "Repost with your words": the Pulse composer with the post quoted; null leaves that choice out. */
    onQuotePost: ((String) -> Unit)? = null,
    viewModel: MyPostsViewModel = hiltViewModel(),
    savedViewModel: SavedPostsViewModel = hiltViewModel(),
    repostsViewModel: RepostedPostsViewModel = hiltViewModel(),
) {
    // Once per visit, before the first read, so it reads the tab it opens on.
    viewModel.openInitialTab(initialTab)
    val topBarAction by viewModel.topBarAction.collectAsStateWithLifecycle()
    val fab by viewModel.fab.collectAsStateWithLifecycle()
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val kebabTarget by viewModel.kebabTarget.collectAsStateWithLifecycle()
    val deleteTarget by viewModel.deleteTarget.collectAsStateWithLifecycle()
    val showFilterSheet by viewModel.showFilterSheet.collectAsStateWithLifecycle()
    val activityFilter by viewModel.activityFilter.collectAsStateWithLifecycle()
    val toast by viewModel.toastMessage.collectAsStateWithLifecycle()
    // Saved and Reposts: other people's posts, read by their own view-models.
    val keptList: OffsetPostsTabViewModel? =
        when (selectedTab) {
            MyPostsTab.SAVED -> savedViewModel
            MyPostsTab.REPOSTS -> repostsViewModel
            else -> null
        }
    val list = remember(keptList) { MyPostsTabList(viewModel, keptList) }
    val listState by list.state.collectAsStateWithLifecycle()
    val listRefreshNotice by list.refreshNotice.collectAsStateWithLifecycle()
    val listToast by list.toastMessage.collectAsStateWithLifecycle()
    val savedToast by savedViewModel.toastMessage.collectAsStateWithLifecycle()
    val repostsToast by repostsViewModel.toastMessage.collectAsStateWithLifecycle()
    val cardToast by list.cardToast.collectAsStateWithLifecycle()
    val cards by list.cards.cards.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.bindCallbacks(
            onOpenPost = onOpenPost,
            onCompose = onCompose,
            onEditPost = onEditPost,
        )
        savedViewModel.bindCallbacks(onOpenPost = onOpenPost)
        repostsViewModel.bindCallbacks(onOpenPost = onOpenPost)
    }

    LifecycleResumeEffect(list) {
        list.load()
        onPauseOrDispose { }
    }
    RefreshOnStoreChange { list.load() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle, list) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            viewModel.postChanges.collect { list.load() }
        }
    }

    LaunchedEffect(savedToast) {
        if (savedToast != null) {
            delay(TOAST_MILLIS)
            savedViewModel.dismissToast()
        }
    }

    LaunchedEffect(repostsToast) {
        if (repostsToast != null) {
            delay(TOAST_MILLIS)
            repostsViewModel.dismissToast()
        }
    }

    LaunchedEffect(toast) {
        if (toast != null) {
            delay(TOAST_MILLIS)
            viewModel.dismissToast()
        }
    }

    LaunchedEffect(cardToast, list) {
        if (cardToast != null) {
            delay(TOAST_MILLIS)
            list.dismissCardToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().testTag(MY_POSTS_TAG)) {
        ListOfRowsScreen(
            refreshNotice = listRefreshNotice,
            title = "My posts",
            state = listState,
            onRefresh = list::refresh,
            onEndReached = list::loadMore,
            tabs =
                tabs +
                    ListOfRowsTab(id = MyPostsTab.SAVED, label = "Saved") +
                    ListOfRowsTab(id = MyPostsTab.REPOSTS, label = "Reposts"),
            selectedTab = selectedTab,
            onSelectTab = { viewModel.selectTab(it) },
            // The type/date filter applies to your own posts only.
            topBarAction = topBarAction.takeIf { list.isOwnPosts },
            fab = fab,
            onBack = onBack,
            rowContent = { row ->
                cards.firstOrNull { it.id == row.id }?.let { card ->
                    @Composable {
                        MyPostCard(card, row, list, onOwnPostOptions = viewModel::requestKebab, onOpenPost = viewModel::openPost)
                    }
                }
            },
        )
        listToast?.let { message ->
            Toast(
                message = ToastMessage(text = message, kind = ToastKind.Error),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 100.dp),
            )
        }
        // A card's Save, Repost or reaction, as on a profile.
        cardToast?.takeIf { listToast == null }?.let { message ->
            Toast(
                message = ToastMessage(text = message, kind = ToastKind.Neutral),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 100.dp),
            )
        }
    }

    MyPostCardSheets(list.cards, cards, ownPosts = list.isOwnPosts, onQuotePost = onQuotePost)

    val target = kebabTarget
    if (target != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { viewModel.cancelKebab() },
            sheetState = sheetState,
        ) {
            KebabSheetContent(
                target = target,
                onEdit = { viewModel.editPost(target.postId) },
                onArchive = { viewModel.archive(target.postId) },
                onRestore = { viewModel.unarchive(target.postId) },
                onDelete = { viewModel.requestDelete(target.postId) },
                onCancel = { viewModel.cancelKebab() },
                onToggleProfilePin = { viewModel.toggleProfilePin(target) },
                onOpenPlan = { viewModel.openPlan(target.postId) },
            )
        }
    }

    val deleteT = deleteTarget
    if (deleteT != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelDelete() },
            title = {
                Text(
                    text = "Delete this post?",
                    color = PantopusColors.appText,
                )
            },
            text = {
                Text(
                    text = "This post will be permanently removed from your profile and the Pulse feed.",
                    color = PantopusColors.appTextSecondary,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.confirmDelete() },
                    modifier = Modifier.testTag("delete-confirm"),
                ) {
                    Text("Delete", color = PantopusColors.error, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.cancelDelete() },
                    modifier = Modifier.testTag("delete-cancel"),
                ) {
                    Text("Cancel", color = PantopusColors.appText)
                }
            },
        )
    }

    if (showFilterSheet) {
        ActivityFilterSheet(
            statusTitle = viewModel.statusFilterTitle,
            statusOptions = viewModel.statusFilterOptions,
            sortOptions = viewModel.sortFilterOptions,
            filter = activityFilter,
            onApply = { viewModel.applyFilter(it) },
            onDismiss = { viewModel.dismissFilterSheet() },
        )
    }
}

/**
 * The list the selected tab shows: your own posts ([own], Active and Archived) or a kept list ([kept]: Saved or
 * Reposts), with its reads.
 */
private class MyPostsTabList(
    private val own: MyPostsViewModel,
    private val kept: OffsetPostsTabViewModel?,
) {
    /** Active or Archived: the type/date filter applies. */
    val isOwnPosts: Boolean get() = kept == null
    val state: StateFlow<ListOfRowsUiState> = kept?.state ?: own.state
    val refreshNotice: StateFlow<RefreshNotice?> = kept?.refreshNotice ?: own.refreshNotice
    val toastMessage: StateFlow<String?> = kept?.toastMessage ?: own.toastMessage

    /** The tab's posts as Pulse cards. */
    val cards: ProfilePostCards = kept?.cards ?: own.cards
    val cardToast: StateFlow<String?> = kept?.cardToast ?: own.cardToast

    fun dismissCardToast() = if (kept != null) kept.dismissCardToast() else own.dismissCardToast()

    fun load() = if (kept != null) kept.load() else own.load()

    fun refresh() = if (kept != null) kept.refresh() else own.refresh()

    fun loadMore() = if (kept != null) kept.loadMoreIfNeeded() else own.loadMoreIfNeeded()
}

/**
 * One post as its Pulse card, with the controls the Pulse feed gives it. Your own posts' ⋯ opens this screen's menu
 * ([onOwnPostOptions]); a saved or reposted post's opens Post options, as on a profile.
 */
@Composable
private fun MyPostCard(
    card: PulsePostCardContent,
    row: RowModel,
    list: MyPostsTabList,
    onOwnPostOptions: (String) -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val model = list.cards
    val postId = card.id
    val going = { model.tapReaction(postId) }
    val ownOptions: () -> Unit = { onOwnPostOptions(postId) }
    val keptOptions: () -> Unit = { model.openOptions(postId) }
    Box(modifier = Modifier.testTag("myPostsCard_$postId")) {
        PulsePostCard(
            content = card,
            onTap = row.onTap,
            onPrimaryReaction = going,
            onRSVP = going.takeIf { card.attendees != null },
            onReact = { emoji -> model.chooseReaction(postId, emoji) },
            onOverflow = if (list.isOwnPosts) ownOptions else keptOptions.takeIf { profilePostHasOptions(card) },
            onToggleSave = { model.toggleSave(postId) },
            // ↻ opens the Repost chooser, as on every Pulse card.
            onToggleRepost = { model.openRepostChooser(postId) },
            onOpenQuoted = { quotedId ->
                model.seedQuotedPost(quotedId)
                onOpenPost(quotedId)
            },
        )
    }
}

/**
 * The menus behind the cards: the Repost chooser (Repost, or Repost with your words), and on Saved and Reposts the
 * profile's Post options (Share…, Report post) with the report reasons.
 */
@Composable
private fun MyPostCardSheets(
    model: ProfilePostCards,
    cards: List<PulsePostCardContent>,
    ownPosts: Boolean,
    onQuotePost: ((String) -> Unit)?,
) {
    val chooserId by model.repostChooserPostId.collectAsStateWithLifecycle()
    val optionsId by model.optionsPostId.collectAsStateWithLifecycle()
    val reportingId by model.reportingPostId.collectAsStateWithLifecycle()
    val shareText = rememberShareTextWithCompletion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    chooserId?.let { id -> cards.firstOrNull { it.id == id } }?.let { card ->
        PulseRepostChooserSheet(
            isReposted = card.actions.isReposted,
            onToggleRepost = { model.toggleRepost(card.id) },
            onQuote =
                onQuotePost?.let { quote ->
                    {
                        model.prepareQuote(card.id)
                        quote(card.id)
                    }
                },
            onDismiss = { model.dismissRepostChooser() },
        )
    }
    if (ownPosts) return
    optionsId?.let { id -> cards.firstOrNull { it.id == id } }?.let { card ->
        ProfilePostOptionsSheet(
            card = card,
            onShare = {
                model.dismissOptions()
                model.shareExternally(card.id) { url, onCompleted ->
                    lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && shareText(url, onCompleted)
                }
            },
            onReport = { model.beginReport(card.id) },
            onDismiss = { model.dismissOptions() },
            onToggleProfilePin = { model.toggleProfilePin(card.id) },
            onOpenPlan = { model.openPlan(card.id) },
        )
    }
    reportingId?.let { id ->
        ProfilePostReportDialog(onReport = { reason -> model.report(id, reason) }, onDismiss = { model.cancelReport() })
    }
}

@Composable
private fun KebabSheetContent(
    target: MyPostsKebabTarget,
    onEdit: () -> Unit,
    onArchive: () -> Unit,
    onRestore: () -> Unit,
    onDelete: () -> Unit,
    onCancel: () -> Unit,
    onToggleProfilePin: () -> Unit = {},
    onOpenPlan: () -> Unit = {},
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(Spacing.s4),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            text = "Post options",
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appText,
        )

        if (!target.isArchived && !target.isPlanPost) {
            // The row's Edit, now that each post is its Pulse card.
            ActionRow(label = "Edit post", icon = PantopusIcon.Pencil, testTag = "kebab-edit", onClick = onEdit)
        }
        if (target.isPlanPost) {
            // A plan's own post changes or is cancelled from its plan, which tells everyone; the server refuses
            // archiving or deleting it.
            ActionRow(label = "Open plan", icon = PantopusIcon.Calendar, testTag = "kebab-open-plan", onClick = onOpenPlan)
            if (target.isArchived) {
                ActionRow(label = "Restore post", icon = PantopusIcon.ArrowsRepeat, testTag = "kebab-restore", onClick = onRestore)
            }
        } else {
            if (target.isArchived) {
                ActionRow(
                    label = "Restore post",
                    icon = PantopusIcon.ArrowsRepeat,
                    testTag = "kebab-restore",
                    onClick = onRestore,
                )
            } else {
                ActionRow(
                    label = "Archive post",
                    icon = PantopusIcon.Archive,
                    testTag = "kebab-archive",
                    onClick = onArchive,
                )
            }
            target.profilePinned?.let { pinned ->
                ActionRow(
                    label = if (pinned) ProfilePinCopy.UNPIN else ProfilePinCopy.PIN,
                    icon = PantopusIcon.Pin,
                    testTag = "kebab-profile-pin",
                    onClick = onToggleProfilePin,
                )
            }
            ActionRow(
                label = "Delete post",
                icon = PantopusIcon.Trash2,
                testTag = "kebab-delete",
                isDestructive = true,
                onClick = onDelete,
            )
        }
        Spacer(Modifier.height(Spacing.s2))
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(Radii.md))
                    .background(PantopusColors.appSurfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            TextButton(
                onClick = onCancel,
                modifier = Modifier.testTag("kebab-cancel"),
            ) {
                Text(
                    text = "Cancel",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.appText,
                )
            }
        }
    }
}

@Composable
private fun ActionRow(
    label: String,
    icon: PantopusIcon,
    testTag: String,
    isDestructive: Boolean = false,
    onClick: () -> Unit,
) {
    val tint = if (isDestructive) PantopusColors.error else PantopusColors.appText
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.appSurface)
                .testTag(testTag),
        contentAlignment = Alignment.CenterStart,
    ) {
        TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                PantopusIconImage(
                    icon = icon,
                    contentDescription = null,
                    size = 18.dp,
                    tint = tint,
                )
                Text(
                    text = label,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = tint,
                )
            }
        }
    }
}
