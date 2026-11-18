@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.my_posts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.posts.MyPostDto
import app.pantopus.android.data.api.models.posts.SavedPostsResponse
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.posts.PostsRepository
import app.pantopus.android.data.posts.PulsePostsRefreshNotifier
import app.pantopus.android.data.store.StoreKind
import app.pantopus.android.data.store.Stored
import app.pantopus.android.ui.components.RefreshNotice
import app.pantopus.android.ui.screens.feed.pulse.PulseIntent
import app.pantopus.android.ui.screens.profile.ProfilePostCards
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsUiState
import app.pantopus.android.ui.screens.shared.list_of_rows.RowBodyEmphasis
import app.pantopus.android.ui.screens.shared.list_of_rows.RowEngagement
import app.pantopus.android.ui.screens.shared.list_of_rows.RowEngagementCta
import app.pantopus.android.ui.screens.shared.list_of_rows.RowLeading
import app.pantopus.android.ui.screens.shared.list_of_rows.RowModel
import app.pantopus.android.ui.screens.shared.list_of_rows.RowSection
import app.pantopus.android.ui.screens.shared.list_of_rows.RowTemplate
import app.pantopus.android.ui.screens.shared.list_of_rows.RowTrailing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * A My posts tab listing other people's posts the viewer kept, paged by an offset over the viewer's own actions: Saved
 * (`GET /api/posts/saved`, [SavedPostsViewModel]) and Reposts (`GET /api/posts/reposts`, [RepostedPostsViewModel]).
 * Both tabs read, page, recheck and draw their rows the same way; each row has one action that takes it off the list
 * (Remove, Undo repost). The rows reuse [MyPostsViewModel]'s row helpers. Each post is drawn as its Pulse card
 * ([cards]), with the card's own controls: unsaving a post on Saved, or undoing a repost on Reposts, takes it off the
 * list once the server agrees.
 */
@Suppress("TooManyFunctions") // The list's reads and paging, plus the cards' toast and the post a card's Save or Repost drops.
abstract class OffsetPostsTabViewModel(
    private val postsRefresh: PulsePostsRefreshNotifier,
    postsRepository: PostsRepository,
    viewerId: () -> String?,
    /** What keeps a post on this list: a card's Save or Repost undone takes it off. */
    keptBy: KeptBy,
) : ViewModel() {
    /** What lists a post on an [OffsetPostsTabViewModel]. */
    enum class KeptBy { Save, Repost }

    private val _cardToast = MutableStateFlow<String?>(null)

    /** A card's Save, Repost or reaction says how it went ("Saved."), as on a profile. */
    val cardToast: StateFlow<String?> = _cardToast.asStateFlow()

    /** The posts as Pulse cards and what the viewer's taps did to them. */
    val cards =
        ProfilePostCards(
            scope = viewModelScope,
            posts = postsRepository,
            viewerId = viewerId,
            onToast = { _cardToast.value = it },
            // As in Pulse: each author keeps their feed look.
            profileColors = false,
            onSaveSettled = { postId, saved -> if (keptBy == KeptBy.Save && !saved) drop(postId) },
            onRepostSettled = { postId, reposted -> if (keptBy == KeptBy.Repost && !reposted) drop(postId) },
        )

    /** Each listed post as the feed's, for its card. */
    private val feedById = mutableMapOf<String, FeedPost>()

    /** The tap count when the read that just landed started; -1 when the cards' rows come from no new read. */
    private var cardReadRevision = -1

    fun dismissCardToast() {
        _cardToast.value = null
    }

    private val _state = MutableStateFlow<ListOfRowsUiState>(ListOfRowsUiState.Loading)
    val state: StateFlow<ListOfRowsUiState> = _state.asStateFlow()

    private val _toastMessage = MutableStateFlow<String?>(null)
    val toastMessage: StateFlow<String?> = _toastMessage.asStateFlow()

    private val _refreshNotice = MutableStateFlow<RefreshNotice?>(null)
    val refreshNotice: StateFlow<RefreshNotice?> = _refreshNotice.asStateFlow()

    // What each tab says and reads.

    /** The tab's id, the list section's too. */
    protected abstract val tabId: String

    /** Shown in place of the list when the first page can't be read (with Retry). */
    protected abstract val loadFailedMessage: String

    /** Shown under the rows when a later page can't be read (with Try again). */
    protected abstract val loadMoreFailedMessage: String

    /** The toast when a row's action fails. */
    protected abstract val removeFailedMessage: String

    /** The tab with nothing in it. */
    protected abstract fun emptyState(): ListOfRowsUiState.Empty

    /** A page: the first through the screens' store ([force] reads now), a later one ([offset] > 0) straight away. */
    protected abstract suspend fun readPage(
        limit: Int,
        offset: Int,
        force: Boolean,
    ): NetworkResult<SavedPostsResponse>

    /** The stored first page of [limit] rows, without a request. */
    protected abstract fun storedPage(limit: Int): Stored<SavedPostsResponse>

    /** When the viewer saved (reposted) the row: the list's order. */
    protected abstract fun listedAt(dto: MyPostDto): String?

    /**
     * The row's action: asks for the post to leave the list (a re-send can't put it back). Success holds whether the
     * post is still listed after it (it had left elsewhere, so the toggle put it back).
     */
    protected abstract suspend fun takeOff(postId: String): NetworkResult<Boolean>

    /** The row's action button, which calls [remove]. */
    protected abstract fun rowAction(dto: MyPostDto): RowEngagementCta

    private var posts: List<MyPostDto> = emptyList()
    private var loading = false
    private var nextOffset: Int? = null
    private var loadedOnce = false
    private var loadingMore = false
    private var loadMoreFailed = false

    /** A return or mutation during a read must recheck once it settles; true preserves an explicit refresh. */
    private var pendingRead: Boolean? = null

    private val readingOrRemoving: Boolean
        get() = loading || loadingMore || removing.isNotEmpty()

    /** Bumped by every first-page load so a page that lands later can't append to its replacement. */
    private var generation = 0
    private val removing = mutableSetOf<String>()

    /** Confirmed removals here: a tail recheck that started before one would bring its row back, so it is dropped. */
    private var removals = 0
    private var openPostHandler: (MyPostDto) -> Unit = {}

    fun bindCallbacks(onOpenPost: (MyPostDto) -> Unit) {
        openPostHandler = onOpenPost
    }

    /** A return uses the shared first-page copy while it is fresh. */
    fun load() = read(force = false)

    fun refresh() = read(force = true)

    private fun read(force: Boolean) {
        if (readingOrRemoving) {
            pendingRead = force || pendingRead == true
            return
        }
        loading = true
        val gen = ++generation
        loadMoreFailed = false
        if (!loadedOnce) {
            storedPage(PAGE_SIZE).data?.let { copy ->
                posts = copy.posts
                keep(copy)
                nextOffset = nextOffsetAfter(copy)
                loadedOnce = true
                applyState()
            }
            if (!loadedOnce) _state.value = ListOfRowsUiState.Loading
        }
        val depth = (nextOffset ?: posts.size).coerceIn(PAGE_SIZE, MAX_REFRESH_DEPTH)
        val revision = cards.actionRevision
        viewModelScope.launch {
            val result = readPage(limit = depth, offset = 0, force = force)
            if (gen != generation) return@launch
            loading = false
            val copy = storedPage(depth)
            _refreshNotice.value = if (copy.showsRefreshFailure(StoreKind.POST)) RefreshNotice(copy.fetchedAt, ::refresh) else null
            when (result) {
                is NetworkResult.Success -> {
                    val retained = replaceRefreshedHead(result.data)
                    keep(result.data)
                    cardReadRevision = revision
                    loadedOnce = true
                    applyState()
                    if (retained > 0) recheckRetainedTail(result.data.posts, retained, gen)
                }
                is NetworkResult.Failure -> {
                    if (result.error is NetworkError.Forbidden ||
                        result.error == NetworkError.NotFound ||
                        result.error == NetworkError.Unauthorized
                    ) {
                        posts = emptyList()
                        nextOffset = null
                        loadedOnce = false
                        _state.value = ListOfRowsUiState.Error(loadFailedMessage)
                    } else if (loadedOnce) {
                        applyState()
                    } else {
                        _state.value = ListOfRowsUiState.Error(loadFailedMessage)
                    }
                }
            }
            readPending()
        }
    }

    private fun readPending() {
        val force = pendingRead ?: return
        if (readingOrRemoving) return
        pendingRead = null
        read(force)
    }

    /**
     * Keep later pages below the newest row returned, then resume from the server's current offset. Returns how many
     * older rows were kept; [recheckRetainedTail] reads them again.
     */
    private fun replaceRefreshedHead(response: SavedPostsResponse): Int {
        val boundary = response.posts.lastOrNull()?.let(::listedAt)?.let { MyPostsViewModel.parseInstant(it) }
        val refreshedIds = response.posts.mapTo(HashSet()) { it.id }
        val older =
            if (response.pagination?.hasMore == true && boundary != null) {
                posts.filter { row ->
                    row.id !in refreshedIds && MyPostsViewModel.parseInstant(listedAt(row))?.let { it <= boundary } == true
                }
            } else {
                emptyList()
            }
        posts = (response.posts + older).distinctBy { it.id }
        // Offsets count the raw actions, including posts hidden by the visibility check. A visible-row delta cannot
        // adjust them safely; the recheck pages on from the server's offset after the refreshed range.
        nextOffset = nextOffsetAfter(response)
        return older.size
    }

    /**
     * The rows kept below a bounded refresh are read again from the server's offset after the refreshed range, so a
     * row taken off elsewhere (the post's own menu, another device) doesn't stay. They stay on screen until the pages
     * land; a failed page, or a removal here meanwhile, keeps them for the next refresh.
     */
    private fun recheckRetainedTail(
        head: List<MyPostDto>,
        retained: Int,
        gen: Int,
    ) {
        val start = nextOffset ?: return
        val removalsBefore = removals
        loadingMore = true
        viewModelScope.launch {
            val tail = mutableListOf<MyPostDto>()
            var next: Int? = start
            var complete = true
            while (tail.size < retained) {
                val offset = next ?: break
                when (val page = readPage(limit = PAGE_SIZE, offset = offset, force = false)) {
                    is NetworkResult.Success -> {
                        tail += page.data.posts
                        keep(page.data)
                        next = nextOffsetAfter(page.data)
                    }
                    is NetworkResult.Failure -> {
                        complete = false
                        next = null
                    }
                }
            }
            if (gen != generation) return@launch
            loadingMore = false
            if (complete && removalsBefore == removals && pendingRead == null) {
                posts = (head + tail).distinctBy { it.id }
                nextOffset = next
            }
            applyState()
            readPending()
        }
    }

    /** Footer reached: append the next page. A failed page keeps the rows and offers Try again. */
    fun loadMoreIfNeeded() {
        val offset = nextOffset ?: return
        if (loading || loadingMore) return
        val gen = generation
        loadingMore = true
        loadMoreFailed = false
        viewModelScope.launch {
            val result = readPage(limit = PAGE_SIZE, offset = offset, force = false)
            if (gen != generation) return@launch
            loadingMore = false
            var addedRows = false
            when (result) {
                is NetworkResult.Success -> {
                    val seen = posts.mapTo(HashSet()) { it.id }
                    val fresh = result.data.posts.filter { it.id !in seen }
                    addedRows = fresh.isNotEmpty()
                    posts = posts + fresh
                    keep(result.data)
                    nextOffset = nextOffsetAfter(result.data)
                }
                is NetworkResult.Failure -> loadMoreFailed = true
            }
            applyState()
            if (result is NetworkResult.Success && !addedRows && nextOffset != offset) loadMoreIfNeeded()
            readPending()
        }
    }

    /** The row's action ([takeOff]); the row leaves once the server confirms. */
    fun remove(postId: String) {
        if (!removing.add(postId)) return
        viewModelScope.launch {
            val result = takeOff(postId)
            removing.remove(postId)
            when {
                result is NetworkResult.Success && !result.data -> drop(postId)
                // The toggle put it back (it had left elsewhere): re-read the list.
                result is NetworkResult.Success -> load()
                else -> _toastMessage.value = removeFailedMessage
            }
            readPending()
        }
    }

    /** The post is no longer saved (or reposted): it leaves the list. */
    private fun drop(postId: String) {
        removals++
        // A Pulse card still showing the old state would undo this on its next tap: lists refetch.
        postsRefresh.notifyPostsDidChange()
        if (posts.any { it.id == postId }) {
            posts = posts.filterNot { it.id == postId }
            // The rows after it move up one, so the next page starts one earlier or it would skip one.
            nextOffset = nextOffset?.let { maxOf(0, it - 1) }
            applyState()
        }
    }

    /** Keeps a reply's posts as the feed's, for their cards. */
    private fun keep(response: SavedPostsResponse) {
        response.feedPosts.forEach { feedById[it.id] = it }
    }

    fun dismissToast() {
        _toastMessage.value = null
    }

    private fun applyState() {
        // The cards follow the rows: the same posts in the same order.
        cards.show(posts.mapNotNull { feedById[it.id] }, cardReadRevision)
        cardReadRevision = -1
        if (posts.isEmpty() && nextOffset != null) {
            if (loadMoreFailed) {
                // Reading on failed, which isn't "nothing here": say so, with Try again.
                _state.value = ListOfRowsUiState.Error(loadFailedMessage)
            } else {
                // A page the visibility check emptied isn't the end of the list.
                _state.value = ListOfRowsUiState.Loading
                loadMoreIfNeeded()
            }
            return
        }
        if (posts.isEmpty()) {
            _state.value = emptyState()
            return
        }
        val now = Instant.now()
        _state.value =
            ListOfRowsUiState.Loaded(
                sections = listOf(RowSection(id = tabId, rows = posts.map { row(it, now) })),
                hasMore = nextOffset != null,
                loadMoreError = if (loadMoreFailed) loadMoreFailedMessage else null,
                onRetryLoadMore = if (loadMoreFailed) ({ loadMoreIfNeeded() }) else null,
            )
    }

    private fun row(
        dto: MyPostDto,
        now: Instant,
    ): RowModel {
        val intent = PulseIntent.fromPostType(dto.postType)
        val author = dto.author?.displayName?.takeIf { it.isNotBlank() }
        val time = MyPostsViewModel.timeMetaLabel(dto, now).takeIf { it.isNotEmpty() }
        return RowModel(
            id = dto.id,
            title = "",
            template = RowTemplate.StatusChip,
            leading = RowLeading.None,
            trailing = RowTrailing.None,
            onTap = { openPostHandler(dto) },
            body = MyPostsViewModel.postBody(dto),
            bodyEmphasis = RowBodyEmphasis.Primary,
            headerChips =
                listOfNotNull(
                    MyPostsViewModel.intentChip(intent, isArchived = false),
                    MyPostsViewModel.statusChipFor(dto),
                ),
            // These are other people's posts: the meta line names who wrote it.
            timeMeta = listOfNotNull(author, time).joinToString(" · "),
            engagement =
                RowEngagement(
                    items = MyPostsViewModel.engagementItems(dto, intent),
                    cta = rowAction(dto),
                ),
        )
    }

    companion object {
        /** Rows per page. */
        const val PAGE_SIZE = 50
        const val MAX_REFRESH_DEPTH = 200

        /** Where the next page starts, or null when the server read the last rows. */
        fun nextOffsetAfter(response: SavedPostsResponse): Int? = response.pagination?.takeIf { it.hasMore == true }?.nextOffset
    }
}
