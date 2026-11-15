package app.pantopus.android.data.api.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * The Plans markers, added here once to every request under `/api/plans` (reads and writes), to `GET /api/posts/map`
 * when it asks for the Plans layer, and to `GET /api/businesses/:id/plans`:
 *
 * - `biz=1` (Plans with businesses, the build contract's section 5.1): this app can draw a business's plan. Without it
 *   a business's plan does not exist for the request, for guests and for the business's own team, which is what keeps
 *   one from reaching an older app that would draw it as a neighbor's.
 * - `more=1` (Plans steps 3 and 4, contract section 0): this app can draw an online plan and the four newer kinds.
 *   Without it such a plan does not exist for the request (older apps decode `kind` and `place_kind` as closed lists),
 *   and creating or changing one is refused. Always sent, whatever the `plans_online` and `plans_kinds` switches say.
 *
 * Nothing else changes for a person without the server's switches: the server answers them exactly as before.
 */
class PlansBizInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val url = request.url
        if (!wantsBiz(url.encodedPath, url.queryParameter("layers"))) return chain.proceed(request)
        val missing = MARKERS.filter { url.queryParameter(it) == null }
        if (missing.isEmpty()) return chain.proceed(request)
        val marked = url.newBuilder()
        missing.forEach { marked.addQueryParameter(it, "1") }
        return chain.proceed(request.newBuilder().url(marked.build()).build())
    }

    companion object {
        const val PARAM = "biz"

        /** `more=1`: this app can draw an online plan and the four newer kinds (Plans steps 3 and 4). */
        const val MORE_PARAM = "more"

        private val MARKERS = listOf(PARAM, MORE_PARAM)
        private val PLANS = Regex("^/api/plans(/.*)?$")
        private val BUSINESS_PLANS = Regex("^/api/businesses/[^/]+/plans$")
        private const val MAP = "/api/posts/map"

        /** True for the routes that read the markers: Plans, the map's Plans layer and a business's plans. */
        fun wantsBiz(
            path: String,
            layers: String?,
        ): Boolean =
            PLANS.matches(path) ||
                BUSINESS_PLANS.matches(path) ||
                (path == MAP && layers?.split(',')?.contains("plans") == true)
    }
}
