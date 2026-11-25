@file:Suppress("LongMethod", "MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.feed.pulse

import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.data.api.models.feed.AroundYouStoryFacts
import app.pantopus.android.data.api.models.feed.FeedConversation
import app.pantopus.android.data.api.models.feed.FeedMuteEntityType
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.feed.FeedPostCreator
import app.pantopus.android.data.api.models.feed.FeedRepostedBy
import app.pantopus.android.data.api.models.posts.PostReactionKind
import app.pantopus.android.data.api.models.posts.PostReactionSummary
import app.pantopus.android.ui.screens.feed.FeedSurface
import app.pantopus.android.ui.screens.shared.feed.FeedAvatarTint
import app.pantopus.android.ui.screens.shared.media.buildPostMediaItems
import java.time.Duration
import java.time.Instant

/**
 * One card's values after the viewer's own taps, ahead of the next read. The Pulse feed and a
 * person's profile (`ProfilePostCards`) build the same card from a row plus these.
 */
internal data class PulseCardLiveValues(
    val hasReacted: Boolean,
    val likeCount: Int,
    /** An emoji post's counts and the viewer's own emoji (an event's reaction is its Going: the two above). */
    val reactions: PostReactionSummary,
    val isSaved: Boolean,
    val isReposted: Boolean,
    val shareCount: Int,
    val isSolved: Boolean,
    /** The asker already used "Keep open 7 more days". */
    val keptOpen: Boolean,
    val likePending: Boolean = false,
    val savePending: Boolean = false,
    /** Who reposted it, with "You" once the viewer reposted it here ([afterViewerRepost]); null draws no line. */
    val repostedBy: FeedRepostedBy? = null,
) {
    /** Whether the viewer reacted: Going, when [kind] is an event's; an emoji on every other post. */
    fun viewerReacted(kind: PostReactionKind): Boolean = if (kind == PostReactionKind.Going) hasReacted else reactions.mine != null

    companion object {
        /** The row as the server sent it, before any tap. */
        fun of(post: FeedPost): PulseCardLiveValues =
            PulseCardLiveValues(
                hasReacted = post.userHasLiked,
                likeCount = post.likeCount,
                reactions = post.reactionSummary,
                isSaved = post.userHasSaved,
                isReposted = post.userHasReposted,
                shareCount = post.shareCount,
                isSolved = post.state == "solved",
                keptOpen = !post.lifecycleMetadata?.keptOpenAt.isNullOrBlank(),
                repostedBy = post.repostedBy,
            )
    }
}

/**
 * The Pulse card for one row. [surface] is null off the feed (a person's profile): no Beacon
 * credential badge and no "Not helpful here".
 */
internal fun pulseCardContent(
    post: FeedPost,
    viewerId: String?,
    surface: FeedSurface?,
    live: PulseCardLiveValues,
): PulsePostCardContent {
    val intent = PulseIntent.fromPostType(post.postType)
    // A made-up name's post: its name and drawn picture, its marks, and no profile (contract "The card").
    val madeUp = pulseMadeUpAuthor(post)
    val authorName = post.cardAuthor?.displayName() ?: "Pantopus user"
    val isBusiness = post.creator?.accountType == "business" || post.businessAuthorId != null
    val likeCount = live.likeCount
    // An event's reaction is Going; every other post's is an emoji.
    val reaction = PulseReaction.forPost(post.postType, likeCount, live.reactions)
    val hasReacted = live.viewerReacted(reaction.kind)
    val isOwner = post.isOwnedBy(viewerId)
    val isSolved = live.isSolved
    val openAsk = LaunchFeatures.pulseRedesign && isOwner && isOpenAsk(post, isSolved)
    val topic = PulseTopic.fromKey(post.topic)?.takeIf { LaunchFeatures.pulseRedesign }
    val story = pulseStory(post.content, post.lifecycleMetadata?.sourceName, post.aroundYou)
    return PulsePostCardContent(
        id = post.id,
        likePending = live.likePending,
        savePending = live.savePending,
        authorName = authorName,
        authorInitials = pulseInitials(authorName),
        // Beacon credentials come from the public profile, never the surface.
        // Other surfaces carry no verification field, so no badge (being
        // a business isn't being verified).
        authorVerified = surface == FeedSurface.Beacons && post.creator?.credential?.status == "verified",
        avatarTint = if (isBusiness) FeedAvatarTint.Violet else FeedAvatarTint.Sky,
        authorAvatarUrl = post.cardAuthor?.photoUrl,
        madeUp = madeUp,
        meta = metaString(post, topic),
        intent = intent,
        chipLabel = pulseChipLabel(post, intent),
        story = story,
        conversation = pulseConversation(post.conversation),
        isVisitor = showsVisitorBadge(post),
        origin = post.origin,
        title = post.title,
        body = post.content.orEmpty(),
        source = post.source,
        event =
            pulseEventDetails(
                postType = post.postType,
                startsAt = post.eventDate,
                endsAt = post.eventEndDate,
                venue = post.eventVenue,
                isPlanPost = post.isPlanPost,
            ),
        reaction = reaction,
        attendees =
            if (intent == PulseIntent.Event) {
                PulseAttendeeStrip(
                    avatars = emptyList(),
                    goingCount = likeCount,
                    userIsGoing = hasReacted,
                )
            } else {
                null
            },
        userHasReacted = hasReacted,
        commentCount = post.commentCount,
        media =
            buildPostMediaItems(
                urls = post.mediaUrls,
                types = post.mediaTypes,
                thumbnails = post.mediaThumbnails,
                liveUrls = post.mediaLiveUrls,
            ),
        actions =
            PulsePostActions(
                isSeeded = post.isSeeded,
                isSaved = live.isSaved,
                isReposted = live.isReposted,
                shareCount = live.shareCount,
                canShareExternally = post.canShareExternally,
                isSolved = isSolved,
                isOwner = isOwner,
                canMarkSolved = isOwner && post.postType == "ask_local" && !isSolved,
                canFlagNotHelpful = surface?.supportsNotHelpful == true && !isOwner && !post.isSeeded,
                muteEntityType =
                    when {
                        post.businessAuthorId != null -> FeedMuteEntityType.Business
                        post.userId != null -> FeedMuteEntityType.User
                        else -> null
                    },
                muteEntityId = post.businessAuthorId ?: post.userId,
                muteEntityName = authorName,
                postType = post.postType.takeUnless { intent == PulseIntent.Generic },
                topicLabel = intent.cardChipLabel,
                pulseTopic = topic,
                canKeepOpen = openAsk && !live.keptOpen,
                canCloseAsk = openAsk,
                // Seeded posts are never yours.
                profilePinned = ownProfilePin(post, isOwner),
                isPlanPost = post.isPlanPost,
            ),
        status = statusFor(post, live),
        repostedBy = repostedByText(live.repostedBy),
        authorLink = pulseAuthorLink(post),
        quoted = pulseQuotedCard(post.quotedPost),
    )
}

/** Who the card names: a made-up name's own projection (its name and drawn picture), else the creator. */
private val FeedPost.cardAuthor: FeedPostCreator?
    get() = (if (isMadeUp) author else null) ?: creator

/**
 * A made-up name's author, or null for every other post. Its id is where an author's id goes on the row (`user_id`),
 * so Mute and Block act on the name; its writer alone gets [PulseMadeUpAuthor.isYou].
 */
internal fun pulseMadeUpAuthor(post: FeedPost): PulseMadeUpAuthor? {
    val id = post.penNameId ?: return null
    val badges = post.author?.badges
    return PulseMadeUpAuthor(
        penNameId = id,
        isYou = post.viewerIsAuthor == true || post.author?.isYou == true,
        // An older row without badges still says it: every made-up name needs a verified home nearby.
        verifiedHome = badges == null || "verified_home" in badges,
    )
}

/**
 * Where the author's photo and name lead, as on the post's page: a business's published page or a person's profile. A
 * tip, a creator persona (whose id is not the person's) and a post written as a home lead nowhere.
 */
internal fun pulseAuthorLink(post: FeedPost): PulseAuthorLink? {
    // A made-up name opens its small card, never a profile.
    val creator = post.creator?.takeUnless { post.isSeeded || post.isMadeUp } ?: return null
    return when (creator.type) {
        "business" ->
            creator.id
                ?.takeIf { !(creator.handle ?: creator.username).isNullOrEmpty() }
                ?.let { PulseAuthorLink.Business(it) }
        "persona", "home" -> null
        else -> post.userId?.takeIf { it.isNotEmpty() && post.businessAuthorId == null }?.let { PulseAuthorLink.Person(it) }
    }
}

/** The viewer wrote this post (as themselves or as their business's writer). */
internal fun FeedPost.isOwnedBy(viewerId: String?): Boolean {
    val viewer = viewerId?.takeIf { it.isNotEmpty() } ?: return false
    return userId == viewer || creator?.id == viewer
}

/**
 * Your own post's pin state ("Pin to profile" / "Unpin from profile"); null hides both. A plan's post never shows on a
 * profile, so the server refuses its pin (iOS hides it too).
 */
private fun ownProfilePin(
    post: FeedPost,
    isOwner: Boolean,
): Boolean? = post.profilePinned.takeIf { isOwner && !post.isPlanPost }

/** An Ask that hasn't ended: no resolution, not solved or archived, and not past its end. */
internal fun isOpenAsk(
    post: FeedPost,
    isSolved: Boolean,
): Boolean {
    if (post.postType != "ask_local" || isSolved) return false
    if (post.resolution != null || (post.state != null && post.state != "open")) return false
    return PostStatus.askWindowIsOpen(post.createdAt, post.expiresAt)
}

/**
 * The "reposted" line (contract §1), after the ↻ the card draws: "You reposted", "Ben C. reposted", "You and Ben C.
 * reposted", "You and 2 others reposted" (as on web). Null without a name.
 */
private fun repostedByText(repostedBy: FeedRepostedBy?): String? {
    val first = repostedBy?.names?.firstOrNull()
    val second = repostedBy?.names?.getOrNull(1)
    val others = (repostedBy?.count ?: 0) - 1
    return when {
        first == null || others < 0 -> null
        others == 0 -> "$first reposted"
        others == 1 && second != null -> "$first and $second reposted"
        else -> "$first and $others ${if (others == 1) "other" else "others"} reposted"
    }
}

/** The status word (S7). The October 13 card (the Pulse redesign off) has none, only its "Solved" badge. */
private fun statusFor(
    post: FeedPost,
    live: PulseCardLiveValues,
): PostStatus? =
    if (!LaunchFeatures.pulseRedesign) {
        null
    } else {
        PostStatus.of(
            postType = post.postType,
            state = if (live.isSolved) "solved" else post.state,
            resolution = post.resolution,
            expiresAt = post.expiresAt,
            goingCount = live.likeCount,
        )
    }

// Around you's topics, as the chips name them (`backend/services/aroundYou/topics.js`).
private val AROUND_TOPIC_TITLES =
    mapOf(
        "events" to "Events",
        "kids" to "Kids & schools",
        "sports" to "Sports",
        "government" to "Government",
        "business" to "Business",
        "safety" to "Roads & safety",
    )

/** The chip's word: a story's topic ("Sports") where it has one, else the post kind's. */
private fun pulseChipLabel(
    post: FeedPost,
    intent: PulseIntent,
): String = aroundTopicTitle(post.aroundYou) ?: intent.chipLabelFor(post.lostFoundType)

/** The first of a story's topics this build knows, by the chip's name; null when it has none. */
internal fun aroundTopicTitle(facts: AroundYouStoryFacts?): String? = facts?.topics?.firstNotNullOfOrNull { AROUND_TOPIC_TITLES[it] }

private val SUBSCRIPTION_SUFFIX = Regex("\\s*\\(subscription\\)$", RegexOption.IGNORE_CASE)

/**
 * A post Today's Around you made for an outlet's story ([facts] present), as its card draws it: the outlet's name
 * without "(subscription)" (that stays on the link that opens the story), the headline (the text's first line) and
 * the outlet's summary (the rest). Null for every other post.
 */
internal fun pulseStory(
    content: String?,
    sourceName: String?,
    facts: AroundYouStoryFacts?,
): PulseStory? {
    if (facts == null) return null
    val text = content.orEmpty()
    val cut = text.indexOf('\n')
    return PulseStory(
        outlet = sourceName?.trim()?.replace(SUBSCRIPTION_SUFFIX, "")?.takeIf { it.isNotEmpty() },
        headline = (if (cut < 0) text else text.substring(0, cut)).trim(),
        summary = if (cut < 0) "" else text.substring(cut + 1).trim(),
    )
}

/** The reply preview a card draws; null without a latest reply to show. */
internal fun pulseConversation(talk: FeedConversation?): PulseConversationPreview? {
    val latest = talk?.latest ?: return null
    val text = latest.text?.trim().orEmpty()
    if (text.isEmpty()) return null
    return PulseConversationPreview(
        faces =
            talk.people.take(3).map { person ->
                PulseConversationFace(name = person.name?.trim().orEmpty().ifEmpty { "Someone" }, avatarUrl = person.avatarUrl)
            },
        latestName = latest.name?.trim().orEmpty().ifEmpty { "Someone" },
        latestText = text,
    )
}

private fun metaString(
    post: FeedPost,
    topic: PulseTopic?,
): String =
    listOfNotNull(
        pulseRelativeTime(post.createdAt),
        // Ahead of the place so a long place name never truncates it; web draws the badge beside the time.
        // A post the author's own photo placed says so instead of Visitor.
        photoProvenanceLabel(post) ?: "Visitor".takeIf { post.isVisitorPost },
        // The topic too, before the place, as on iOS ("2h · Gardening · Camas").
        topic?.label,
        post.locationName?.takeIf { it.isNotEmpty() },
    ).joinToString(" · ")

/** A post its author's own photo placed says "Photo taken here" instead of Visitor. */
private fun showsVisitorBadge(post: FeedPost): Boolean = post.isVisitorPost && post.locationBasis != "photo"

/**
 * "Photo taken here" for a post its author's own photo or video placed, with the day it was taken once that's more
 * than a week ago (mirrors iOS `FeedPostDTO.photoProvenanceLabel`). Null for every other post.
 */
internal fun photoProvenanceLabel(
    post: FeedPost,
    now: Instant = Instant.now(),
): String? {
    if (post.locationBasis != "photo") return null
    val taken = post.photoTakenAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
    if (taken == null || java.time.Duration.between(taken, now).toDays() < 7) return "Photo taken here"
    val zone = java.time.ZoneId.systemDefault()
    val sameYear = taken.atZone(zone).year == now.atZone(zone).year
    val pattern = if (sameYear) "MMM d" else "MMM yyyy"
    val day = java.time.format.DateTimeFormatter.ofPattern(pattern, java.util.Locale.getDefault()).format(taken.atZone(zone))
    return "Photo taken here ${if (sameYear) "on" else "in"} $day"
}

/** A card's time: "Just now", "5m", "3h", "2d", "4w" (the ISO text itself when it can't be read). */
internal fun pulseRelativeTime(iso: String): String =
    runCatching {
        val instant = Instant.parse(iso)
        val seconds = Duration.between(instant, Instant.now()).seconds
        when {
            seconds < 60 -> "Just now"
            seconds < 3_600 -> "${seconds / 60}m"
            seconds < 86_400 -> "${seconds / 3_600}h"
            seconds < 604_800 -> "${seconds / 86_400}d"
            else -> "${seconds / 604_800}w"
        }
    }.getOrDefault(iso)

/** Up to two initials for an avatar without a photo ("Maria L." is "ML"). */
internal fun pulseInitials(name: String): String {
    val parts = name.split(" ").take(2)
    return parts.mapNotNull { it.firstOrNull()?.toString() }.joinToString("").uppercase()
}
