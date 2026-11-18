package app.pantopus.android.ui.screens.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.pantopus.android.core.identity.ProfileChanges
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.feed.FeedRepostedBy
import app.pantopus.android.data.api.models.posts.PostReactionEmoji
import app.pantopus.android.data.api.models.posts.PostReactionKind
import app.pantopus.android.data.api.models.posts.PostReactionSummary
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.posts.PostsRepository
import app.pantopus.android.ui.screens.feed.pulse.PulseCardLiveValues
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCopy
import app.pantopus.android.ui.screens.feed.pulse.PulseToastAction
import app.pantopus.android.ui.screens.feed.pulse.PulseToastActionFor
import app.pantopus.android.ui.screens.feed.pulse.afterViewerRepost
import app.pantopus.android.ui.screens.feed.pulse.pulseCardContent
import app.pantopus.android.ui.screens.feed.pulseReportReasons
import app.pantopus.android.ui.screens.shared.feed.FeedAvatarTint
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A person's posts on their profile, drawn with the Pulse card (`PulsePostCard`): photos and
 * videos, event times, tappable links, emoji reactions (Going on an Event), Save, Repost and the post menu (share, report).
 * The rows come from `GET /api/posts/user/:id?include_reposts=true` (the feed's serializer) and each tap calls the
 * endpoint the Pulse feed calls for it (`PulseFeedViewModel`). Owned by [PublicProfileViewModel].
 *
 * The list also holds the posts that person reposted, each under its "reposted" line. Such a row is someone else's
 * post, on your own profile too: every owner action is decided from the post's own author ([pulseCardContent]), never
 * from whose profile this is.
 */
@Suppress("TooManyFunctions") // One entry per card control, as on the Pulse feed's view-model.
class ProfilePostCards internal constructor(
    private val scope: CoroutineScope,
    private val posts: PostsRepository,
    private val viewerId: () -> String?,
    private val onToast: (String) -> Unit,
    /** A pin changed: the Pinned row reads again. */
    private val onPinsChanged: () -> Unit = {},
    /** The author's avatar takes their profile color, as on a profile; off elsewhere (Today's Around you), as in Pulse. */
    private val profileColors: Boolean = true,
    /** The button that goes with the next toast ("View" after "Saved."); called just before [onToast]. */
    private val onToastAction: (PulseToastActionFor) -> Unit = {},
    /** The server answered a card's Save (post id, saved): My posts' Saved tab lets an unsaved post go. */
    private val onSaveSettled: (String, Boolean) -> Unit = { _, _ -> },
    /** The server answered a card's Repost (post id, reposted): My posts' Reposts tab lets an undone one go. */
    private val onRepostSettled: (String, Boolean) -> Unit = { _, _ -> },
) {
    private val _cards = MutableStateFlow<List<PulsePostCardContent>>(emptyList())

    /** One card per post, in the order the server listed them. */
    val cards: StateFlow<List<PulsePostCardContent>> = _cards.asStateFlow()

    private val _optionsPostId = MutableStateFlow<String?>(null)

    /** The post whose "Post options" menu is open. */
    val optionsPostId: StateFlow<String?> = _optionsPostId.asStateFlow()

    private val _repostChooserPostId = MutableStateFlow<String?>(null)

    /** The post whose Repost chooser is open (contract §2). */
    val repostChooserPostId: StateFlow<String?> = _repostChooserPostId.asStateFlow()

    private val _reportingPostId = MutableStateFlow<String?>(null)

    /** The post being reported: the reason picker is open. */
    val reportingPostId: StateFlow<String?> = _reportingPostId.asStateFlow()

    /** Bumped by every tap, so a read that started before one can't undo it. */
    var actionRevision = 0
        private set

    private var rows: List<FeedPost> = emptyList()
    private var overrides: Map<String, Override> = emptyMap()
    private val liking = mutableSetOf<String>()
    private val saving = mutableSetOf<String>()
    private val reposting = mutableSetOf<String>()
    private val sharing = mutableSetOf<String>()
    private var toastSerial = 0L

    /** A tap's value until a later read confirms it. */
    private data class Override(
        val hasReacted: Boolean? = null,
        val likeCount: Int? = null,
        val reactions: PostReactionSummary? = null,
        val isSaved: Boolean? = null,
        val isReposted: Boolean? = null,
        val shareCount: Int? = null,
        /** The "reposted" line after a repost or undo here; [Line.value] null is no line. */
        val repostLine: Line? = null,
    )

    private data class Line(
        val value: FeedRepostedBy?,
    )

    /**
     * Rows from a read. A tap still waiting for the server keeps its value; a settled one gives
     * way to a read that started after the last tap. A post listed twice (written, then reposted) shows once.
     */
    fun show(
        newRows: List<FeedPost>,
        readRevision: Int,
    ) {
        rows = newRows.distinctBy { it.id }
        if (readRevision == actionRevision) {
            overrides = overrides.filterKeys { it in liking || it in saving || it in reposting }
        }
        rebuild()
    }

    /** Whether the card's "Post options" menu has anything in it. */
    fun hasOptions(card: PulsePostCardContent): Boolean = profilePostHasOptions(card)

    /** "Pin to profile" / "Unpin from profile" on your own post (PRF step 5); a 4th pin shows the server's sentence. */
    fun toggleProfilePin(postId: String) {
        val pinned = rows.firstOrNull { it.id == postId }?.profilePinned ?: return
        _optionsPostId.value = null
        scope.launch {
            when (val result = posts.setProfilePin(postId, !pinned)) {
                is NetworkResult.Success -> {
                    val now = result.data.profilePinned
                    rows = rows.map { if (it.id == postId) it.copy(profilePinned = now) else it }
                    rebuild()
                    onToast(if (now) ProfilePinCopy.PINNED else ProfilePinCopy.UNPINNED)
                    ProfileChanges.notifyChanged()
                    onPinsChanged()
                }
                is NetworkResult.Failure -> onToast(result.error.displayMessage(ProfilePinCopy.FAILED))
            }
        }
    }

    fun openOptions(postId: String) {
        _optionsPostId.value = postId
    }

    fun dismissOptions() {
        _optionsPostId.value = null
    }

    /** ↻ on a card opens the Repost chooser instead of reposting at once (contract §2). */
    fun openRepostChooser(postId: String) {
        _optionsPostId.value = null
        _repostChooserPostId.value = postId
    }

    fun dismissRepostChooser() {
        _repostChooserPostId.value = null
    }

    /** "Repost with your words": the chooser closes and the card is copied for the composer's quoted card. */
    fun prepareQuote(postId: String) {
        _repostChooserPostId.value = null
        rows.firstOrNull { it.id == postId }?.let(posts::seedDetail)
    }

    /** A card's quoted post opens its page: its copy goes in the store first, as a tapped feed card's does. */
    fun seedQuotedPost(postId: String) {
        rows.firstNotNullOfOrNull { row -> row.quotedPost?.takeIf { it.available }?.post?.takeIf { it.id == postId } }
            ?.let(posts::seedDetail)
    }

    /** The host's own plan post opens its plan on the Plans tab, where Change and Cancel tell everyone. */
    fun openPlan(postId: String) {
        _optionsPostId.value = null
        DeepLinkRouter.handle("/plans/$postId")
    }

    fun beginReport(postId: String) {
        _optionsPostId.value = null
        _reportingPostId.value = postId
    }

    fun cancelReport() {
        _reportingPostId.value = null
    }

    /**
     * An emoji picked on a card: it becomes the viewer's reaction, or takes theirs away when it already is
     * (`POST /api/posts/:id/like` `{"reaction": …}`), shown at once and rolled back on failure.
     */
    fun chooseReaction(
        postId: String,
        emoji: PostReactionEmoji,
    ) {
        val post = rows.firstOrNull { it.id == postId } ?: return
        if (PostReactionKind.fromPostType(post.postType) != PostReactionKind.Emoji || !liking.add(postId)) return
        actionRevision++
        val original = overrides[postId]?.reactions ?: post.reactionSummary
        val originalHasReacted = overrides[postId]?.hasReacted ?: post.userHasLiked
        val originalCount = overrides[postId]?.likeCount ?: post.likeCount
        val next = original.afterPicking(emoji)
        val optimistic = original.withMine(next)
        put(postId) { it.copy(reactions = optimistic, hasReacted = next != null, likeCount = optimistic.total) }
        scope.launch {
            try {
                when (val result = posts.setReaction(postId, next)) {
                    is NetworkResult.Success ->
                        put(postId) {
                            it.copy(
                                reactions = optimistic.settled(result.data),
                                hasReacted = result.data.liked,
                                likeCount = result.data.likeCount,
                            )
                        }
                    is NetworkResult.Failure -> {
                        put(postId) { it.copy(reactions = original, hasReacted = originalHasReacted, likeCount = originalCount) }
                        onToast("Couldn't update your reaction. Try again.")
                    }
                }
            } finally {
                liking.remove(postId)
                actionRevision++
                rebuild()
            }
        }
    }

    /** Going on an Event: `POST /api/posts/:id/like`, shown at once and rolled back on failure. */
    fun tapReaction(postId: String) {
        val post = rows.firstOrNull { it.id == postId } ?: return
        if (PostReactionKind.fromPostType(post.postType) != PostReactionKind.Going || !liking.add(postId)) return
        actionRevision++
        val original = overrides[postId]?.hasReacted ?: post.userHasLiked
        val originalCount = overrides[postId]?.likeCount ?: post.likeCount
        val toggled = !original
        put(postId) { it.copy(hasReacted = toggled, likeCount = (originalCount + if (toggled) 1 else -1).coerceAtLeast(0)) }
        scope.launch {
            try {
                when (val result = posts.toggleLike(postId, liked = toggled)) {
                    is NetworkResult.Success ->
                        put(postId) { it.copy(hasReacted = result.data.liked, likeCount = result.data.likeCount) }
                    is NetworkResult.Failure -> {
                        put(postId) { it.copy(hasReacted = original, likeCount = originalCount) }
                        onToast("Couldn't update your reaction. Try again.")
                    }
                }
            } finally {
                liking.remove(postId)
                actionRevision++
                rebuild()
            }
        }
    }

    /** `POST /api/posts/:id/save`, shown at once and rolled back on failure. */
    fun toggleSave(postId: String) {
        val post = rows.firstOrNull { it.id == postId } ?: return
        if (!saving.add(postId)) return
        actionRevision++
        val original = overrides[postId]?.isSaved ?: post.userHasSaved
        put(postId) { it.copy(isSaved = !original) }
        scope.launch {
            try {
                when (val result = posts.toggleSave(postId, saved = !original)) {
                    is NetworkResult.Success -> {
                        put(postId) { it.copy(isSaved = result.data.saved) }
                        if (result.data.saved) {
                            // "Saved." with "View", which opens My posts on the Saved tab (contract §5).
                            onToastAction(PulseToastActionFor(PulsePostCopy.SAVED, PulseToastAction.ViewSaved, ++toastSerial))
                            onToast(PulsePostCopy.SAVED)
                        } else {
                            onToast(PulsePostCopy.UNSAVED)
                        }
                        onSaveSettled(postId, result.data.saved)
                    }
                    is NetworkResult.Failure -> {
                        put(postId) { it.copy(isSaved = original) }
                        onToast(PulsePostCopy.SAVE_FAILED)
                    }
                }
            } finally {
                saving.remove(postId)
                actionRevision++
                rebuild()
            }
        }
    }

    /**
     * "Repost" / "Undo repost" in the chooser: `POST /api/posts/:id/share` as a repost, with the count and the
     * "reposted" line ("You reposted") shown at once and rolled back on failure (contract §1).
     */
    fun toggleRepost(postId: String) {
        _repostChooserPostId.value = null
        val post = rows.firstOrNull { it.id == postId } ?: return
        if (!reposting.add(postId)) return
        actionRevision++
        val original = overrides[postId]?.isReposted ?: post.userHasReposted
        val originalCount = overrides[postId]?.shareCount ?: post.shareCount
        val originalLine = overrides[postId]?.repostLine.let { line -> if (line != null) line.value else post.repostedBy }
        put(postId) {
            it.copy(
                isReposted = !original,
                shareCount = (originalCount + if (original) -1 else 1).coerceAtLeast(0),
                repostLine = Line(originalLine.afterViewerRepost(!original)),
            )
        }
        scope.launch {
            try {
                when (val result = posts.share(postId, shareType = "repost", reposted = !original)) {
                    is NetworkResult.Success -> {
                        val reposted = result.data.reposted ?: !original
                        put(postId) {
                            it.copy(
                                isReposted = reposted,
                                shareCount = result.data.shareCount ?: originalCount,
                                repostLine = Line(originalLine.afterViewerRepost(reposted)),
                            )
                        }
                        onToast(if (reposted) PulsePostCopy.REPOSTED else PulsePostCopy.REPOST_REMOVED)
                        onRepostSettled(postId, reposted)
                    }
                    is NetworkResult.Failure -> {
                        put(postId) { it.copy(isReposted = original, shareCount = originalCount, repostLine = Line(originalLine)) }
                        onToast(PulsePostCopy.REPOST_FAILED)
                    }
                }
            } finally {
                reposting.remove(postId)
                actionRevision++
                rebuild()
            }
        }
    }

    /**
     * The list may predate an audience change, so the server confirms the post can still be
     * shared before its link leaves the app; [onReady] opens the share sheet with the link.
     */
    fun shareExternally(
        postId: String,
        onReady: (String, () -> Unit) -> Boolean,
    ) {
        val actor = viewerId() ?: return
        if (rows.firstOrNull { it.id == postId }?.canShareExternally != true || !sharing.add(postId)) return
        scope.launch {
            try {
                when (val result = posts.share(postId, shareType = "external", checkOnly = true)) {
                    is NetworkResult.Success ->
                        if (viewerId() == actor) {
                            val opened =
                                result.data.canShare == true &&
                                    onReady("https://www.pantopus.com/posts/$postId") { recordShare(postId, actor) }
                            if (!opened) onToast("Couldn't share this post. Try again.")
                        }
                    is NetworkResult.Failure -> onToast(result.error.displayMessage("Couldn't share this post. Try again."))
                }
            } finally {
                sharing.remove(postId)
            }
        }
    }

    /** `POST /api/posts/:id/report` with one of Pulse's report reasons. */
    fun report(
        postId: String,
        reason: String,
    ) {
        _reportingPostId.value = null
        scope.launch {
            when (posts.report(postId, reason)) {
                is NetworkResult.Success -> onToast("Report sent. We'll review it shortly.")
                is NetworkResult.Failure -> onToast("Couldn't send that report.")
            }
        }
    }

    private fun recordShare(
        postId: String,
        actor: String,
    ) {
        if (viewerId() != actor) return
        scope.launch {
            if (posts.share(postId, shareType = "external") is NetworkResult.Failure && viewerId() == actor) {
                onToast("Couldn't update the share count.")
            }
        }
    }

    private fun put(
        postId: String,
        transform: (Override) -> Override,
    ) {
        overrides = overrides + (postId to transform(overrides[postId] ?: Override()))
        rebuild()
    }

    private fun rebuild() {
        val viewer = viewerId()
        _cards.value =
            rows.map { post ->
                val value = overrides[post.id]
                val base = PulseCardLiveValues.of(post)
                pulseCardContent(
                    post = post,
                    viewerId = viewer,
                    surface = null,
                    live =
                        base.copy(
                            hasReacted = value?.hasReacted ?: base.hasReacted,
                            likeCount = value?.likeCount ?: base.likeCount,
                            reactions = value?.reactions ?: base.reactions,
                            isSaved = value?.isSaved ?: base.isSaved,
                            isReposted = value?.isReposted ?: base.isReposted,
                            shareCount = value?.shareCount ?: base.shareCount,
                            likePending = post.id in liking,
                            savePending = post.id in saving,
                            repostedBy = value?.repostLine.let { line -> if (line != null) line.value else base.repostedBy },
                        ),
                ).let { card -> if (profileColors) profileCardColors(post, card) else card }
            }
    }
}

/** What each control on a profile's Pulse card does; every callback takes the post's id. */
data class ProfilePostCardActions(
    val onOpen: (String) -> Unit = {},
    /** Going on an Event. */
    val onReact: (String) -> Unit = {},
    /** The emoji picked in the card's reaction picker (every post but an Event). */
    val onChooseReaction: (String, PostReactionEmoji) -> Unit = { _, _ -> },
    val onOptions: (String) -> Unit = {},
    val onToggleSave: (String) -> Unit = {},
    /** ↻: opens the Repost chooser. */
    val onToggleRepost: (String) -> Unit = {},
    /** A card's quoted post: opens that post's page (with its id). */
    val onOpenQuoted: (String) -> Unit = {},
)

/** The card's "Post options": Share… and Report post, worded as in Pulse; Open plan on your own plan's post. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfilePostOptionsSheet(
    card: PulsePostCardContent,
    onShare: () -> Unit,
    onReport: () -> Unit,
    onDismiss: () -> Unit,
    onToggleProfilePin: () -> Unit = {},
    onOpenPlan: () -> Unit = {},
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appBg,
        modifier = Modifier.testTag("profilePostOptionsSheet"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Spacing.s4),
            verticalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            Text(text = "Post options", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)
            if (card.actions.canOpenPlan) {
                OptionRow(label = "Open plan", testTag = "profilePostOptionsOpenPlan", onClick = onOpenPlan)
            }
            if (card.actions.canShareExternally) {
                OptionRow(label = "Share…", testTag = "profilePostOptionsShare", onClick = onShare)
            }
            card.actions.profilePinned?.let { pinned ->
                OptionRow(
                    label = if (pinned) ProfilePinCopy.UNPIN else ProfilePinCopy.PIN,
                    testTag = "profilePostOptionsProfilePin",
                    onClick = onToggleProfilePin,
                )
            }
            if (card.actions.canReport) {
                OptionRow(label = "Report post", testTag = "profilePostOptionsReport", isDestructive = true, onClick = onReport)
            }
            OptionRow(label = "Cancel", testTag = "profilePostOptionsCancel", onClick = onDismiss)
        }
    }
}

/** Pulse's report-reason picker for a post on a profile. */
@Composable
internal fun ProfilePostReportDialog(
    onReport: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report this post?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
                Text(
                    text = "Reports are reviewed by the Pantopus team. The author isn't told who reported.",
                    fontSize = 13.sp,
                    color = PantopusColors.appTextSecondary,
                )
                pulseReportReasons.forEach { (key, label) ->
                    TextButton(
                        onClick = { onReport(key) },
                        modifier = Modifier.fillMaxWidth().testTag("profilePostReportReason_$key"),
                    ) {
                        Text(label, color = PantopusColors.appText)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun OptionRow(
    label: String,
    testTag: String,
    isDestructive: Boolean = false,
    onClick: () -> Unit,
) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag(testTag)) {
        Text(
            text = label,
            color = if (isDestructive) PantopusColors.error else PantopusColors.appText,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** On a profile the author's avatar matches the header's: one color per person (PRF), a business keeps violet. */
internal fun profileCardColors(
    post: FeedPost,
    card: PulsePostCardContent,
): PulsePostCardContent {
    val authorId = post.userId ?: post.creator?.id
    if (authorId == null || card.avatarTint == FeedAvatarTint.Violet) return card
    return card.copy(avatarTint = profileAvatarTint(authorId), authorInitials = profileInitials(card.authorName))
}

/** A post as a visitor's card in Preview as: no viewer (no owner menus), the counts as the server sent them. */
internal fun profilePreviewCard(post: FeedPost): PulsePostCardContent =
    profileCardColors(post, pulseCardContent(post = post, viewerId = null, surface = null, live = PulseCardLiveValues.of(post)))

/**
 * Whether a profile card's "Post options" menu has anything in it: share, report, your own post's pin, or Open plan
 * on your own plan's post.
 */
internal fun profilePostHasOptions(card: PulsePostCardContent): Boolean =
    card.actions.canShareExternally || card.actions.canReport || card.actions.profilePinned != null ||
        card.actions.canOpenPlan
