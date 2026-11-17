package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.data.api.models.plans.FeatureFlagResponse
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Path

/**
 * Faster home verification (FASTVERIFY SPEC section 4). Every route answers 404 `FAST_CHECK_OFF` while
 * `home_fast_verify` is off, and the apps then keep today's screens.
 */
interface HomeFastVerifyApi {
    /** `GET /api/homes/:id/verify-options`: the person's level here and the ways to verify they have now. */
    @Headers("Cache-Control: no-cache, no-store")
    @GET("api/homes/{id}/verify-options")
    suspend fun verifyOptions(
        @Path("id") homeId: String,
    ): HomeVerifyOptions

    /**
     * `GET /api/feature-flags/home_short_add` (`backend/routes/featureFlags.js:30`): Add Home in two steps. Read before
     * any Home exists, so it can't come from [verifyOptions].
     */
    @Headers("Cache-Control: no-cache, no-store")
    @GET("api/feature-flags/home_short_add")
    suspend fun shortAddHomeFlag(): FeatureFlagResponse
}
