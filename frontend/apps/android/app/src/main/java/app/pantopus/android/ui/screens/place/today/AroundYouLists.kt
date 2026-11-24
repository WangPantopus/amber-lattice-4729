package app.pantopus.android.ui.screens.place.today

import app.pantopus.android.data.api.models.feed.FeedConversation
import app.pantopus.android.data.api.models.feed.FeedConversationPerson
import app.pantopus.android.data.api.models.feed.FeedConversationReply
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.posts.PostDetailDto
import app.pantopus.android.data.api.models.saved_places.AroundYouListPageDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.saved_places.AroundYouPlace
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Around you's lists behind the first page (founder, 2026-11-24): the chip that is chosen and its list, read a page
 * at a time for as long as the server says there is more. Under [ALL] the list is every earlier story, read only once
 * the first page's end nears; any other chip's list is read when the chip is picked. Another place starts at [ALL]
 * with nothing read. [onPosts] says the list's posts changed (a page arrived, a post took what was done on its page),
 * with the revision the cards were at when the read began, so a tap made meanwhile keeps its value.
 */
internal class AroundYouLists(
    private val scope: CoroutineScope,
    private val read: suspend (AroundYouPlace, String, String?) -> NetworkResult<AroundYouListPageDto>,
    private val revision: () -> Int,
    private val onPosts: (readRevision: Int) -> Unit,
) {
    /** The chosen list, as far as it has been read. */
    data class State(
        val id: String = ALL,
        val posts: List<FeedPost> = emptyList(),
        /** Where the list continues; null at its end (or before its first page). */
        val next: String? = null,
        val loading: Boolean = false,
        /** The last read failed; what was read stays. */
        val failed: Boolean = false,
        /** How many pages arrived: 0 before the first. */
        val pages: Int = 0,
    ) {
        /** There may be more to read: nothing was read yet, or the last page named a next one. */
        val hasMore: Boolean get() = pages == 0 || next != null
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var place: AroundYouPlace? = null

    /** Told apart from an older read's answer: a new place, chip or refresh drops what is still on its way. */
    private var generation = 0

    /** The place Today shows now: another place starts over at [ALL]. */
    fun show(newPlace: AroundYouPlace?) {
        if (newPlace == place) return
        place = newPlace
        start(ALL)
    }

    /** A chip was picked. Its list is read at once, but for [ALL], whose earlier stories wait for the page's end. */
    fun select(id: String) {
        if (id == _state.value.id) return
        start(id)
        if (id != ALL) loadMore()
    }

    /** The end of what is shown nears: the next page, if there is one and none is on its way. */
    fun loadMore() {
        val at = place ?: return
        val now = _state.value
        if (now.loading || !now.hasMore) return
        val mine = generation
        val startedAt = revision()
        _state.value = now.copy(loading = true, failed = false)
        scope.launch {
            val result = read(at, now.id, now.next)
            if (mine != generation) return@launch
            val before = _state.value
            _state.value =
                when (result) {
                    is NetworkResult.Success ->
                        before.copy(
                            // A story that arrived between two reads can come back on the next page: each shows once.
                            posts = (before.posts + result.data.posts).distinctBy { it.id },
                            next = result.data.next,
                            loading = false,
                            pages = before.pages + 1,
                        )
                    is NetworkResult.Failure -> before.copy(loading = false, failed = true)
                }
            if (result is NetworkResult.Success) onPosts(startedAt)
        }
    }

    /** A pull to refresh: the list is read again from its first page; what shows stays until that page arrives. */
    fun refresh() {
        val at = place ?: return
        val now = _state.value
        // Earlier stories that were never asked for stay unasked.
        if (now.pages == 0 && now.id == ALL) return
        generation += 1
        val mine = generation
        val startedAt = revision()
        _state.value = now.copy(loading = true, failed = false)
        scope.launch {
            val result = read(at, now.id, null)
            if (mine != generation) return@launch
            _state.value =
                when (result) {
                    is NetworkResult.Success -> State(id = now.id, posts = result.data.posts, next = result.data.next, pages = 1)
                    is NetworkResult.Failure -> _state.value.copy(loading = false, failed = true)
                }
            if (result is NetworkResult.Success) onPosts(startedAt)
        }
    }

    /** Whether the list holds this post (the first page's posts are the page's own). */
    fun holds(postId: String): Boolean = _state.value.posts.any { it.id == postId }

    /** A post of the list as its own page now has it (its counts, the viewer's reaction, the latest reply). */
    fun take(detail: PostDetailDto) {
        val now = _state.value
        if (now.posts.none { it.id == detail.id }) return
        _state.value = now.copy(posts = now.posts.map { if (it.id == detail.id) it.after(detail) else it })
        onPosts(revision())
    }

    private fun start(id: String) {
        generation += 1
        _state.value = State(id = id)
        onPosts(revision())
    }

    companion object {
        /** The list every Around you page opens on: its sections, then every earlier story. */
        const val ALL = "all"
        const val TALKED = "talked"
        const val EVENTS = "events"
    }
}

private const val PREVIEW_PEOPLE = 3
private const val PREVIEW_LENGTH = 140

private val SPACES = Regex("\\s+")

/** A reply as a card's one line: its spaces folded, cut short with "…". */
private fun previewOf(reply: String): String {
    val plain = reply.replace(SPACES, " ").trim()
    return if (plain.length > PREVIEW_LENGTH) plain.take(PREVIEW_LENGTH - 1).trimEnd() + "…" else plain
}

/** A list's row after what was done on its post page: the page's counts and reactions, and its latest reply. */
private fun FeedPost.after(detail: PostDetailDto): FeedPost {
    val replies = detail.comments.filter { !it.isDeleted && it.comment.isNotBlank() }.sortedByDescending { it.createdAt }
    val latest = replies.firstOrNull()
    return copy(
        likeCount = detail.likeCount,
        commentCount = detail.commentCount,
        userHasLiked = detail.userHasLiked,
        reactions = detail.reactions ?: reactions,
        userReaction = detail.userReaction,
        userHasSaved = detail.userHasSaved,
        userHasReposted = detail.userHasReposted,
        conversation =
            if (latest == null) {
                conversation.takeIf { detail.commentCount > 0 }
            } else {
                FeedConversation(
                    people =
                        replies.distinctBy { it.userId ?: it.id }.take(PREVIEW_PEOPLE).map {
                            FeedConversationPerson(id = it.userId, name = it.author?.displayName, avatarUrl = it.author?.avatarUrl)
                        },
                    latest =
                        FeedConversationReply(
                            id = latest.id,
                            userId = latest.userId,
                            name = latest.author?.displayName,
                            text = previewOf(latest.comment),
                            createdAt = latest.createdAt,
                        ),
                )
            },
    )
}
