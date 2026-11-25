package app.pantopus.android.data.api.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * `X-Pantopus-Profile-Parts` on every request under `/api/profile-page` (CONTRACT, "On by default, and what a phone can't
 * show yet"): the parts of the profile this build draws. For anything waiting for a person in a part not named here
 * (an ask to sign a piece, a role ask, a line or a card), the server puts a `notice` row on their own page that opens
 * it on pantopus.com. Name a part here in the pull request that builds it, never before.
 */
class ProfilePartsInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.url.encodedPath.startsWith(PATH)) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header(HEADER, PARTS.joinToString(",")).build())
    }

    companion object {
        const val HEADER = "X-Pantopus-Profile-Parts"
        private const val PATH = "/api/profile-page"

        /** What this build draws. Later: credits, roles, circle, known_for, doors, shelf, each with its screens. */
        val PARTS = listOf("pieces")
    }
}
