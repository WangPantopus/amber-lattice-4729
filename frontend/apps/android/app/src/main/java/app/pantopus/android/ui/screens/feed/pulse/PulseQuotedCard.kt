@file:Suppress("PackageNaming", "MagicNumber")

package app.pantopus.android.ui.screens.feed.pulse

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.feed.FeedQuotedPost
import app.pantopus.android.data.api.models.posts.PostDetailDto
import app.pantopus.android.ui.screens.shared.feed.FeedAvatar
import app.pantopus.android.ui.screens.shared.feed.FeedAvatarTint
import app.pantopus.android.ui.screens.shared.media.MediaStillTile
import app.pantopus.android.ui.screens.shared.media.PostMediaItem
import app.pantopus.android.ui.screens.shared.media.PostMediaKind
import app.pantopus.android.ui.screens.shared.media.buildPostMediaItems
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * The post a quote post quotes, as its compact card shows it (contract §8.3): the original's author, time, up to three
 * lines of its text and its first picture; or the quiet "This post isn't available." box.
 */
@Immutable
sealed interface PulseQuotedCard {
    /** Deleted, hidden, removed, or not this viewer's to read: a quiet box that opens nothing. */
    data object Unavailable : PulseQuotedCard

    data class Post(
        val postId: String,
        val authorName: String,
        val authorInitials: String,
        val avatarTint: FeedAvatarTint,
        val authorAvatarUrl: String?,
        /** "3h", as the card's own meta line says it. */
        val time: String,
        val title: String?,
        val body: String,
        /** The first photo or video, drawn small at the end; null without one. */
        val thumbnail: PostMediaItem?,
    ) : PulseQuotedCard
}

/** A row's `quoted_post` as its card draws it; null for an ordinary post. */
internal fun pulseQuotedCard(quoted: FeedQuotedPost?): PulseQuotedCard? {
    if (quoted == null) return null
    val post = quoted.post?.takeIf { quoted.available } ?: return PulseQuotedCard.Unavailable
    return pulseQuotedPreview(post)
}

/** A feed row as a quoted card. */
internal fun pulseQuotedPreview(post: FeedPost): PulseQuotedCard.Post {
    val name = post.creator?.displayName() ?: "Pantopus user"
    val isBusiness = post.creator?.accountType == "business" || post.businessAuthorId != null
    return PulseQuotedCard.Post(
        postId = post.id,
        authorName = name,
        authorInitials = pulseInitials(name),
        avatarTint = if (isBusiness) FeedAvatarTint.Violet else FeedAvatarTint.Sky,
        authorAvatarUrl = post.creator?.photoUrl,
        time = pulseRelativeTime(post.createdAt),
        title = post.title?.trim()?.takeIf { it.isNotEmpty() },
        body = post.content.orEmpty().trim(),
        thumbnail = firstPicture(buildPostMediaItems(post.mediaUrls, post.mediaTypes, post.mediaThumbnails, post.mediaLiveUrls)),
    )
}

/** A post page's copy as a quoted card: what the composer shows under the text box. */
internal fun pulseQuotedPreview(post: PostDetailDto): PulseQuotedCard.Post {
    val creator = post.creator
    val name = creator?.displayName ?: "Pantopus user"
    val isBusiness = creator?.identityType == "business" || creator?.accountType == "business"
    return PulseQuotedCard.Post(
        postId = post.id,
        authorName = name,
        authorInitials = pulseInitials(name),
        avatarTint = if (isBusiness) FeedAvatarTint.Violet else FeedAvatarTint.Sky,
        authorAvatarUrl = creator?.avatarUrl ?: creator?.profilePictureUrl,
        time = pulseRelativeTime(post.createdAt),
        title = post.title?.trim()?.takeIf { it.isNotEmpty() },
        body = post.content.trim(),
        thumbnail = firstPicture(buildPostMediaItems(post.mediaUrls, post.mediaTypes, post.mediaThumbnails, post.mediaLiveUrls)),
    )
}

/** The first photo, Live Photo or video (a PDF has no picture to show). */
private fun firstPicture(items: List<PostMediaItem>): PostMediaItem? = items.firstOrNull { it.kind != PostMediaKind.Document }

/**
 * The quoted card inside a post's card or page, or under the composer's text box: bordered and rounded, with no
 * reactions, menu or repost of its own. [onOpen] opens the original's page (its tap wins over the card around it); null
 * leaves it still (the composer). [testTag] is `pulseQuotedPost_<quoting post id>` or `pulseQuoteComposerCard`.
 */
@Composable
internal fun PulseQuotedPostCard(
    card: PulseQuotedCard,
    testTag: String,
    onOpen: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    when (card) {
        PulseQuotedCard.Unavailable -> QuotedUnavailable(testTag = testTag, modifier = modifier)
        is PulseQuotedCard.Post -> QuotedPost(card = card, testTag = testTag, onOpen = onOpen, modifier = modifier)
    }
}

/** "This post isn't available.": a quiet box that opens nothing. */
@Composable
private fun QuotedUnavailable(
    testTag: String,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurfaceSunken)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(Spacing.s3)
                .semantics(mergeDescendants = true) {}
                .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon = PantopusIcon.EyeOff, contentDescription = null, size = 14.dp, tint = PantopusColors.appTextMuted)
        Text(text = PulsePostCopy.QUOTED_UNAVAILABLE, fontSize = 12.sp, color = PantopusColors.appTextSecondary)
    }
}

/** The original's author, time, text and first picture, in a bordered card that opens it ([onOpen]). */
@Composable
private fun QuotedPost(
    card: PulseQuotedCard.Post,
    testTag: String,
    onOpen: ((String) -> Unit)?,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .then(
                    if (onOpen != null) {
                        Modifier.clickable(onClickLabel = "Open post", role = Role.Button) { onOpen(card.postId) }
                    } else {
                        Modifier
                    },
                ).padding(Spacing.s3)
                .semantics(mergeDescendants = true) { contentDescription = quotedLabel(card) }
                .testTag(testTag),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FeedAvatar(
                    initials = card.authorInitials,
                    tint = card.avatarTint,
                    size = 20.dp,
                    imageUrl = card.authorAvatarUrl,
                )
                Text(
                    text = card.authorName,
                    modifier = Modifier.weight(1f, fill = false),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.appText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = "· ${card.time}", fontSize = 10.5.sp, color = PantopusColors.appTextSecondary, maxLines = 1)
            }
            val text =
                buildAnnotatedString {
                    card.title?.let { title ->
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)) { append(title) }
                        if (card.body.isNotEmpty()) append("\n")
                    }
                    append(card.body)
                }
            if (text.isNotEmpty()) {
                Text(
                    text = text,
                    fontSize = 12.sp,
                    color = PantopusColors.appTextStrong,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        card.thumbnail?.let { QuotedThumbnail(it) }
    }
}

/** The original's first photo or video frame, small; a video without a frame shows its play mark on the sunken tile. */
@Composable
private fun QuotedThumbnail(item: PostMediaItem) {
    Box(
        modifier = Modifier.size(56.dp).clip(RoundedCornerShape(Radii.md)).background(PantopusColors.appSurfaceSunken),
        contentAlignment = Alignment.Center,
    ) {
        val still = if (item.kind == PostMediaKind.Video) item.thumbnailUrl else item.thumbnailUrl ?: item.url
        if (!still.isNullOrBlank()) {
            MediaStillTile(
                url = still,
                modifier = Modifier.fillMaxSize(),
                fallbackUrl = item.url.takeIf { item.kind != PostMediaKind.Video },
            )
        }
        if (item.kind == PostMediaKind.Video) {
            PantopusIconImage(
                icon = PantopusIcon.Play,
                contentDescription = null,
                size = 16.dp,
                // White over the frame; on the bare tile, the tile's own grey text colour.
                tint = if (still.isNullOrBlank()) PantopusColors.appTextSecondary else PantopusColors.appTextInverse,
            )
        }
    }
}

/** What TalkBack reads for the quoted card. */
private fun quotedLabel(card: PulseQuotedCard.Post): String =
    listOfNotNull("Quoted post by ${card.authorName}", card.time, card.title, card.body.takeIf { it.isNotEmpty() })
        .joinToString(". ")
