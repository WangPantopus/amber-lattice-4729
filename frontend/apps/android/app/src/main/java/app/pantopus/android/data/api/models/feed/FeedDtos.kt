package app.pantopus.android.data.api.models.feed

import app.pantopus.android.core.identity.MadeUpUsername
import app.pantopus.android.data.api.models.posts.PostReactionCountDto
import app.pantopus.android.data.api.models.posts.PostReactionSummary
import app.pantopus.android.data.api.models.posts.PostSource
import app.pantopus.android.data.api.models.posts.permitsExternalPostShare
import app.pantopus.android.data.api.models.pulse.PostLifecycleMetadata
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * One row in `GET /api/posts/feed` (route `backend/routes/posts.js:1449`).
 * The backend serializer projects every `Post` column the feed needs; we
 * keep the fields the Pulse UI actually reads.
 */
@JsonClass(generateAdapter = true)
data class FeedPost(
    val id: String,
    @Json(name = "user_id") val userId: String? = null,
    val title: String? = null,
    val content: String? = null,
    @Json(name = "post_type") val postType: String? = null,
    /** One of the 12 Pulse topics (`around_here` … `volunteering`), or null; a value this build doesn't know reads as none. */
    val topic: String? = null,
    @Json(name = "created_at") val createdAt: String,
    @Json(name = "like_count") val likeCount: Int = 0,
    @Json(name = "comment_count") val commentCount: Int = 0,
    @Json(name = "share_count") val shareCount: Int = 0,
    @Json(name = "userHasLiked") val userHasLiked: Boolean = false,
    /** Each emoji's count, the most used first; empty before anyone reacted, missing from older servers. */
    @Json(name = "reactions") val reactions: List<PostReactionCountDto>? = null,
    /** The viewer's own emoji ("❤️"), or null; older servers leave it out ([reactionSummary] reads a like as 👍). */
    @Json(name = "userReaction") val userReaction: String? = null,
    @Json(name = "userHasSaved") val userHasSaved: Boolean = false,
    @Json(name = "userHasReposted") val userHasReposted: Boolean = false,
    /**
     * Who reposted the post: the viewer ("You") and their connections. Connections, Nearby, profile and Reposts rows;
     * older servers send it on Connections rows only, without the viewer.
     */
    @Json(name = "reposted_by") val repostedBy: FeedRepostedBy? = null,
    /** On a profile's Posts and on My posts' Reposts: when that person reposted it (ISO 8601). */
    @Json(name = "reposted_at") val repostedAt: String? = null,
    /** "Repost with your words": the post this one quotes, or why it can't be shown; null on an ordinary post. */
    @Json(name = "quoted_post") val quotedPost: FeedQuotedPost? = null,
    /** Lifecycle state — `open` / `solved` (`backend/services/feedService.js:234`). */
    val state: String? = null,
    /**
     * How the post ended (S7): `answered`, `closed`, `closed_unanswered`, `claimed`, `expired`, `happened`, `reunited`;
     * null while open. A value this build doesn't know shows no status.
     */
    val resolution: String? = null,
    /** When the post ends (S7): a heads-up's named time, or its type's window. */
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "post_metadata") val lifecycleMetadata: PostLifecycleMetadata? = null,
    /** Offers: `choose` or `first` (S7; meaningful only on an offer). */
    @Json(name = "claim_mode") val claimMode: String? = null,
    /** Server-derived authorship: `user`, `curator` or `system`. */
    @Json(name = "origin") val origin: String? = null,
    /**
     * True for cold-start neighborhood facts injected by the feed handler
     * (`backend/routes/posts.js:84`). Those rows are dismissable, never
     * reportable.
     */
    @Json(name = "is_seeded") val isSeeded: Boolean = false,
    /** The poster's homes are all far from where they posted; the card says Visitor. */
    @Json(name = "is_visitor_post") val isVisitorPost: Boolean = false,
    /** `photo` when the author's own photo or video placed the post (`feedService.js:244`). */
    @Json(name = "location_basis") val locationBasis: String? = null,
    /** When that photo or video was taken (ISO 8601), when its metadata said. */
    @Json(name = "photo_taken_at") val photoTakenAt: String? = null,
    /** Set when the post was authored as a business (`feedService.js:115`). */
    @Json(name = "business_author_id") val businessAuthorId: String? = null,
    @Json(name = "location_name") val locationName: String? = null,
    @Json(name = "event_date") val eventDate: String? = null,
    /** When an Event ends, when the poster named an end time. */
    @Json(name = "event_end_date") val eventEndDate: String? = null,
    @Json(name = "event_venue") val eventVenue: String? = null,
    @Json(name = "lost_found_type") val lostFoundType: String? = null,
    @Json(name = "media_urls") val mediaUrls: List<String> = emptyList(),
    @Json(name = "media_thumbnails") val mediaThumbnails: List<String> = emptyList(),
    @Json(name = "media_types") val mediaTypes: List<String> = emptyList(),
    @Json(name = "media_live_urls") val mediaLiveUrls: List<String> = emptyList(),
    /** PRF SRV-3: on your own posts only, whether the post is pinned to your profile; missing when unknown. */
    @Json(name = "profile_pinned") val profilePinned: Boolean? = null,
    val creator: FeedPostCreator? = null,
    val visibility: String? = null,
    @Json(name = "read_scope") val readScope: String? = null,
    @Json(name = "allow_external_share") val allowExternalShare: Boolean? = null,
    @Json(name = "moderation_state") val moderationState: String? = null,
    val audience: String? = null,
    /**
     * Who replied and the latest reply, for a card that shows the conversation before it is opened. Only Today's
     * Around you sends it, and only on a post with replies (`backend/services/aroundYou/lists.js`).
     */
    val conversation: FeedConversation? = null,
    /**
     * The identity projection of the author (made-up names read it: [FeedPostCreator.madeUp], its badges and
     * [FeedPostCreator.isYou]). Older servers and most rows send [creator] only.
     */
    val author: FeedPostCreator? = null,
    /** Written under a made-up name (contract "What the server sends"); older servers leave it out. */
    @Json(name = "made_up_name") val madeUpName: Boolean? = null,
    /** True only for the person who wrote it under their made-up name: the card says "(you)". */
    @Json(name = "viewer_is_author") val viewerIsAuthor: Boolean? = null,
    /** The reply box may offer "Post as" (a made-up name) on this post; an older server leaves it out (no). */
    @Json(name = "takes_made_up_name_reply") val takesMadeUpNameReply: Boolean? = null,
) {
    /** A made-up name's post: the card shows the name, its marks and no profile. */
    val isMadeUp: Boolean
        get() = madeUpName == true || author?.type == PEN_NAME_TYPE || creator?.type == PEN_NAME_TYPE

    /** The made-up name's id (Mute and Block act on it); null on every other post. */
    val penNameId: String?
        get() = if (isMadeUp) (author?.id ?: creator?.id)?.takeIf { it.isNotEmpty() } else null

    val canShareExternally: Boolean
        get() =
            !isSeeded && permitsExternalPostShare(readScope, visibility, audience, allowExternalShare, moderationState)

    /** A plan's own post (Plans marks it `post_metadata.plan`): its event times are real moments. */
    val isPlanPost: Boolean get() = lifecycleMetadata?.plan == true

    /** Where the post's story was published (an Around you headline's outlet); null on most posts. */
    val source: PostSource? get() = lifecycleMetadata?.source

    /** A story Today's Around you posted for an outlet, with its topics; null for every other post. */
    val aroundYou: AroundYouStoryFacts? get() = lifecycleMetadata?.aroundYou

    /** Its emoji reactions as the card shows them (an event's are its Going, counted in [likeCount]). */
    val reactionSummary: PostReactionSummary
        get() = PostReactionSummary.of(reactions, likeCount, userReaction, userHasLiked)
}

/**
 * Who reposted a post (`feedService.js` repostedByLines): the viewer and their connections. A value that can't be read
 * reads as none ([app.pantopus.android.data.api.models.common.TolerantJsonAdapterFactory]), never failing the post.
 */
@JsonClass(generateAdapter = true)
data class FeedRepostedBy(
    /** The latest reposters' names, at most two; "You" first when the viewer reposted it. */
    val names: List<String> = emptyList(),
    /** Everyone counted, the viewer included. */
    val count: Int = 0,
    /** The viewer reposted it (then [names] starts with "You"); older servers leave it out. */
    val viewer: Boolean = false,
)

/**
 * A post's reply preview: the latest repliers (newest first, at most three) and the latest reply, cut short. A value
 * that can't be read reads as none, never failing the post that carries it.
 */
@JsonClass(generateAdapter = true)
data class FeedConversation(
    val people: List<FeedConversationPerson> = emptyList(),
    val latest: FeedConversationReply? = null,
)

@JsonClass(generateAdapter = true)
data class FeedConversationPerson(
    val id: String? = null,
    val name: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
)

@JsonClass(generateAdapter = true)
data class FeedConversationReply(
    val id: String? = null,
    @Json(name = "user_id") val userId: String? = null,
    val name: String? = null,
    val text: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

/**
 * What a post Today's Around you made says about itself (`post_metadata.around_you`, set only by the server): the
 * section that took it and its topics (`events`, `kids`, `sports`, `government`, `business`, `safety`). A value that
 * can't be read reads as none.
 */
@JsonClass(generateAdapter = true)
data class AroundYouStoryFacts(
    val section: String? = null,
    val topics: List<String> = emptyList(),
)

/**
 * The post a quote post quotes (contract §8). [available] false: deleted, hidden, removed, or not this viewer's to
 * read; then [post] is absent. Otherwise [post] is an ordinary feed row for this viewer (never quoting another). A value
 * that can't be read reads as none, never failing the post that carries it.
 */
@JsonClass(generateAdapter = true)
data class FeedQuotedPost(
    val available: Boolean = false,
    val post: FeedPost? = null,
)

/**
 * Author projection on a feed post. Mirrors the iOS `PostCreatorDTO`
 * shape and SAFE_CREATOR_SELECT + identity-author attachment.
 */
@JsonClass(generateAdapter = true)
data class FeedAuthorCredential(val status: String? = null)

@JsonClass(generateAdapter = true)
data class FeedPostCreator(
    val id: String? = null,
    val username: String? = null,
    val name: String? = null,
    @Json(name = "first_name") val firstName: String? = null,
    @Json(name = "last_name") val lastName: String? = null,
    @Json(name = "profile_picture_url") val profilePictureUrl: String? = null,
    @Json(name = "displayName") val authorDisplayName: String? = null,
    val handle: String? = null,
    @Json(name = "avatarUrl") val avatarUrl: String? = null,
    val type: String? = null,
    val credential: FeedAuthorCredential? = null,
    val city: String? = null,
    val state: String? = null,
    @Json(name = "account_type") val accountType: String? = null,
    /** A made-up name (`type: "pen_name"`); older servers leave it out. */
    val madeUp: Boolean? = null,
    /** `made_up_name`, `verified_home`: the card's marks under a made-up name. */
    val badges: List<String>? = null,
    /** Reaches only the person who wrote it under their made-up name. */
    val isYou: Boolean? = null,
) {
    /** Best-effort display name across legacy and identity-projection fields. */
    fun displayName(): String {
        val combined = listOfNotNull(firstName, lastName).filter { it.isNotEmpty() }.joinToString(" ")
        return authorDisplayName?.takeIf { it.isNotEmpty() }
            ?: name?.takeIf { it.isNotEmpty() }
            ?: combined.takeIf { it.isNotEmpty() }
            ?: MadeUpUsername.handle(username)
            ?: MadeUpUsername.handle(handle)
            ?: "Pantopus user"
    }

    /** The author's photo: the identity's `avatarUrl`, else a legacy row's `profile_picture_url`. */
    val photoUrl: String?
        get() = avatarUrl ?: profilePictureUrl
}

/** The identity projection's `type` for a made-up name. */
const val PEN_NAME_TYPE = "pen_name"

/** Paging envelope returned by `GET /api/posts/feed`. */
@JsonClass(generateAdapter = true)
data class FeedPagination(
    val nextCursor: FeedCursor? = null,
    val hasMore: Boolean? = null,
)

/** Keyset cursor returned by the v1.1 feed API. */
@JsonClass(generateAdapter = true)
data class FeedCursor(
    val createdAt: String,
    val id: String,
    val rankBucket: Int? = null,
)

/** `GET /api/posts/feed` response envelope. */
@JsonClass(generateAdapter = true)
data class FeedResponse(
    val posts: List<FeedPost>,
    val pagination: FeedPagination? = null,
    /** Place feed only: no area was given and the person has no home or saved place to fall back on. */
    val requiresViewingLocation: Boolean? = null,
    /** Place feed only: no area was given, so the server looked around the person's own place. */
    val fallbackArea: FeedFallbackArea? = null,
    /** A person's posts previewed as `anyone`: signed-out visitors can't read posts (PRF CONTRACT SRV-1). */
    @Json(name = "sign_in_required") val signInRequired: Boolean? = null,
)

/** Where the place feed looked when no area was given, such as "Near Camas, WA". */
@JsonClass(generateAdapter = true)
data class FeedFallbackArea(
    val label: String,
    val source: String? = null,
)

/**
 * Push-token registration request (kept from legacy ApiService).
 * [deviceId] (persistent login, CONTRACT §"Device descriptor") links the
 * `PushToken` row to the trusted-device row so a device revoke / local
 * logout can delete exactly this device's tokens; the backend also reads
 * the `X-Device-Id` header when the body omits it.
 */
@JsonClass(generateAdapter = true)
data class RegisterPushTokenRequest(
    val token: String,
    val platform: String,
    val deviceId: String? = null,
)

/** `POST` / `DELETE /api/posts/:id/profile-pin` (PRF SRV-3). */
@JsonClass(generateAdapter = true)
data class ProfilePinResponse(
    @Json(name = "post_id") val postId: String,
    @Json(name = "profile_pinned") val profilePinned: Boolean,
)
