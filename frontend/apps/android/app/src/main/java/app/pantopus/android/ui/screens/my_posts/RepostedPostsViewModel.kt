@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.my_posts

import app.pantopus.android.data.api.models.posts.MyPostDto
import app.pantopus.android.data.api.models.posts.SavedPostsResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.posts.PostsRepository
import app.pantopus.android.data.posts.PulsePostsRefreshNotifier
import app.pantopus.android.data.store.Stored
import app.pantopus.android.ui.screens.shared.list_of_rows.ListOfRowsUiState
import app.pantopus.android.ui.screens.shared.list_of_rows.RowEngagementCta
import app.pantopus.android.ui.theme.PantopusIcon
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * My posts' Reposts tab (contract 2026-11-14 §4): the posts the viewer reposted and can still open
 * (`GET /api/posts/reposts`, which mirrors `GET /api/posts/saved`), newest repost first, each with Undo repost
 * (`POST /api/posts/:id/share` `{ shareType: "repost", reposted: false }`). Built as the Saved tab is
 * ([OffsetPostsTabViewModel]): the same rows, paging, empty and error states. A server without the route answers 404:
 * the tab shows its error with Retry.
 */
@HiltViewModel
class RepostedPostsViewModel
    @Inject
    constructor(
        private val postsRepo: PostsRepository,
        postsRefresh: PulsePostsRefreshNotifier,
        authRepo: AuthRepository,
    ) : OffsetPostsTabViewModel(
            postsRefresh = postsRefresh,
            postsRepository = postsRepo,
            viewerId = { (authRepo.state.value as? AuthRepository.State.SignedIn)?.user?.id },
            keptBy = OffsetPostsTabViewModel.KeptBy.Repost,
        ) {
        override val tabId: String = MyPostsTab.REPOSTS
        override val loadFailedMessage: String = "Couldn't load your reposts."
        override val loadMoreFailedMessage: String = "Couldn't load more reposts."
        override val removeFailedMessage: String = "Couldn't undo the repost. Try again."

        override fun emptyState(): ListOfRowsUiState.Empty =
            ListOfRowsUiState.Empty(
                icon = PantopusIcon.ArrowsRepeat,
                headline = "No reposts yet",
                subcopy = "Posts you repost show up here and on your profile.",
            )

        override suspend fun readPage(
            limit: Int,
            offset: Int,
            force: Boolean,
        ): NetworkResult<SavedPostsResponse> = postsRepo.repostedPosts(limit = limit, offset = offset, force = force)

        override fun storedPage(limit: Int): Stored<SavedPostsResponse> = postsRepo.repostedPostsCopy(limit)

        override fun listedAt(dto: MyPostDto): String? = dto.repostedAt

        /** Undo repost: the request asks for "not reposted" (a re-send can't repost it again). */
        override suspend fun takeOff(postId: String): NetworkResult<Boolean> =
            when (val result = postsRepo.share(postId, shareType = "repost", reposted = false)) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.reposted ?: false)
                is NetworkResult.Failure -> result
            }

        override fun rowAction(dto: MyPostDto): RowEngagementCta =
            RowEngagementCta(
                label = "Undo repost",
                icon = PantopusIcon.ArrowsRepeat,
                accessibilityLabel = "Undo repost",
                onClick = { remove(dto.id) },
                testTag = "myPostsUndoRepost_${dto.id}",
            )
    }
