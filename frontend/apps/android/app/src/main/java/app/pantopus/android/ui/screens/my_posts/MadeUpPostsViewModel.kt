@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.my_posts

import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.posts.MyPostDto
import app.pantopus.android.data.api.models.posts.SavedPostsPagination
import app.pantopus.android.data.api.models.posts.SavedPostsResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.pennames.PenNamesRepository
import app.pantopus.android.data.posts.PostsRepository
import app.pantopus.android.data.posts.PulsePostsRefreshNotifier
import app.pantopus.android.data.store.Stored
import app.pantopus.android.ui.screens.pennames.PenNameCopy
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsUiState
import app.pantopus.android.ui.screens.shared.list_of_rows.RowEngagementCta
import app.pantopus.android.ui.theme.PantopusIcon
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * My posts' Made-up name tab (contract "What each app builds", 6): the person's own posts under their made-up name
 * (`GET /api/pen-names/me/posts`), newest first, which only they can open. The tab shows only for a person who has a
 * made-up name ([hasPenName]). Built as Saved and Reposts are ([OffsetPostsTabViewModel]); the route pages by the last
 * row's time, which this keeps per offset. Edit and Delete are on each post's page, as for any post of one's own.
 */
@HiltViewModel
class MadeUpPostsViewModel
    @Inject
    constructor(
        private val penNames: PenNamesRepository,
        postsRepo: PostsRepository,
        postsRefresh: PulsePostsRefreshNotifier,
        authRepo: AuthRepository,
    ) : OffsetPostsTabViewModel(
            postsRefresh = postsRefresh,
            postsRepository = postsRepo,
            viewerId = { (authRepo.state.value as? AuthRepository.State.SignedIn)?.user?.id },
            keptBy = OffsetPostsTabViewModel.KeptBy.Save,
        ) {
        override val tabId: String = MyPostsTab.MADE_UP
        override val loadFailedMessage: String = "Couldn't load your posts under your made-up name."
        override val loadMoreFailedMessage: String = "Couldn't load more posts."
        override val removeFailedMessage: String = "Couldn't open the post. Try again."

        private val _hasPenName = MutableStateFlow(false)

        /** The person has a made-up name: My posts shows this tab. */
        val hasPenName: StateFlow<Boolean> = _hasPenName.asStateFlow()

        /** Where each later page starts: the `before` the page ending at that offset handed back. */
        private val cursors = mutableMapOf<Int, String>()

        /** Asks once whether the person has a made-up name. */
        fun checkPenName() {
            viewModelScope.launch {
                (penNames.loadMe() as? NetworkResult.Success)?.data?.let { _hasPenName.value = it.penName != null }
            }
        }

        override fun emptyState(): ListOfRowsUiState.Empty =
            ListOfRowsUiState.Empty(
                icon = PantopusIcon.EyeOff,
                headline = "Nothing under your made-up name yet",
                subcopy = "${PenNameCopy.ONLY_YOU}. Posts you write under your made-up name show up here.",
            )

        override suspend fun readPage(
            limit: Int,
            offset: Int,
            force: Boolean,
        ): NetworkResult<SavedPostsResponse> {
            val before = if (offset == 0) null else cursors[offset] ?: return NetworkResult.Success(SavedPostsResponse())
            return when (val result = penNames.myPosts(before, limit.coerceAtMost(PAGE_LIMIT))) {
                is NetworkResult.Success -> {
                    val page = result.data
                    val next = offset + page.posts.size
                    page.nextBefore?.let { cursors[next] = it }
                    NetworkResult.Success(
                        SavedPostsResponse(
                            posts = page.posts,
                            feedPosts = page.feedPosts,
                            pagination = SavedPostsPagination(nextOffset = next, hasMore = page.nextBefore != null),
                        ),
                    )
                }
                is NetworkResult.Failure -> result
            }
        }

        /** Only its owner reads this list, and never from a stored copy. */
        override fun storedPage(limit: Int): Stored<SavedPostsResponse> = Stored()

        override fun listedAt(dto: MyPostDto): String? = dto.createdAt

        /** Nothing takes a post off this list but deleting it, on its page. */
        override suspend fun takeOff(postId: String): NetworkResult<Boolean> = NetworkResult.Success(true)

        override fun rowAction(dto: MyPostDto): RowEngagementCta =
            RowEngagementCta(
                label = "Open",
                icon = PantopusIcon.ChevronRight,
                accessibilityLabel = "Open the post",
                onClick = { openPost(dto) },
                testTag = "myPostsMadeUpOpen_${dto.id}",
            )

        private companion object {
            /** `GET /api/pen-names/me/posts` reads at most 50 at a time. */
            const val PAGE_LIMIT = 50
        }
    }
