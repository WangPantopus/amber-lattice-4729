@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.my_posts

import app.pantopus.android.data.api.models.posts.MyPostDto
import app.pantopus.android.data.api.models.posts.SavedPostsResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.posts.PostsRepository
import app.pantopus.android.data.posts.PulsePostsRefreshNotifier
import app.pantopus.android.data.store.Stored
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsUiState
import app.pantopus.android.ui.screens.shared.list_of_rows.RowEngagementCta
import app.pantopus.android.ui.theme.PantopusIcon
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * My posts' Saved tab: the posts the viewer saved and can still open
 * (`GET /api/posts/saved`), newest save first, each with Remove. Kept apart
 * from [MyPostsViewModel] because it reads a different list — other people's
 * posts, paged by save offset — with a different row action; the reading,
 * paging and rows are [OffsetPostsTabViewModel]'s, shared with the Reposts tab.
 */
@HiltViewModel
class SavedPostsViewModel
    @Inject
    constructor(
        private val postsRepo: PostsRepository,
        postsRefresh: PulsePostsRefreshNotifier,
    ) : OffsetPostsTabViewModel(postsRefresh) {
        override val tabId: String = MyPostsTab.SAVED
        override val loadFailedMessage: String = LOAD_FAILED
        override val loadMoreFailedMessage: String = LOAD_MORE_FAILED
        override val removeFailedMessage: String = "Couldn't remove it. Try again."

        override fun emptyState(): ListOfRowsUiState.Empty =
            ListOfRowsUiState.Empty(
                icon = PantopusIcon.Bookmark,
                headline = "Nothing saved yet",
                subcopy = "Tap Save on a post to keep it here.",
            )

        override suspend fun readPage(
            limit: Int,
            offset: Int,
            force: Boolean,
        ): NetworkResult<SavedPostsResponse> = postsRepo.savedPosts(limit = limit, offset = offset, force = force)

        override fun storedPage(limit: Int): Stored<SavedPostsResponse> = postsRepo.savedPostsCopy(limit)

        override fun listedAt(dto: MyPostDto): String? = dto.savedAt

        /** Remove from Saved: the request asks for "not saved" (a re-send can't re-save it). */
        override suspend fun takeOff(postId: String): NetworkResult<Boolean> =
            when (val result = postsRepo.toggleSave(postId, saved = false)) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.saved)
                is NetworkResult.Failure -> result
            }

        override fun rowAction(dto: MyPostDto): RowEngagementCta =
            RowEngagementCta(
                label = "Remove",
                icon = PantopusIcon.Bookmark,
                accessibilityLabel = "Remove from Saved",
                onClick = { remove(dto.id) },
            )

        companion object {
            const val LOAD_FAILED = "Couldn't load your saved posts."
            const val LOAD_MORE_FAILED = "Couldn't load more saved posts."
        }
    }
