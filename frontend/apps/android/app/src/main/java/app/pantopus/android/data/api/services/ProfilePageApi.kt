package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.profile.ProfileMarksResponse
import app.pantopus.android.data.api.models.profile.ProfilePageDto
import app.pantopus.android.data.api.models.profile.ProfilePageMonthDto
import app.pantopus.android.data.api.models.profile.ProfileShareDto
import app.pantopus.android.data.api.models.profile.ProfileShareUpdateBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The profile with sources (`~/pantopus-profile-sources/CONTRACT.md`, frozen v1; `backend/routes/profilePage.js`, owned
 * by the server session). Every route answers 404 `PROFILE_SOURCES_OFF` while the backend's `PROFILE_SOURCES` switch is
 * off, and the app then keeps today's profile. `as` is the owner's Preview as: `link`, `member` or `connection`.
 */
interface ProfilePageApi {
    /** `GET /api/profile-page/:username`: the page as this viewer gets it (signed in or not). */
    @GET("api/profile-page/{username}")
    suspend fun page(
        @Path("username") username: String,
        @Query("as") audience: String? = null,
    ): ProfilePageDto

    /** `GET /api/profile-page/id/:id`: the same page, opened by user id (most of the app opens people by id). */
    @GET("api/profile-page/id/{id}")
    suspend fun pageById(
        @Path("id") id: String,
        @Query("as") audience: String? = null,
    ): ProfilePageDto

    /** `GET /api/profile-page/id/:id/month/:month` (`YYYY-MM`): one month of the rings, opened (board 13). */
    @GET("api/profile-page/id/{id}/month/{month}")
    suspend fun month(
        @Path("id") id: String,
        @Path("month") month: String,
        @Query("as") audience: String? = null,
    ): ProfilePageMonthDto

    /** `GET /api/profile-page/me/share`: the main link's parts, the link, and the page a visitor would see. */
    @GET("api/profile-page/me/share")
    suspend fun share(): ProfileShareDto

    /** `PUT /api/profile-page/me/share`: save the main link's parts. */
    @PUT("api/profile-page/me/share")
    suspend fun saveShare(
        @Body body: ProfileShareUpdateBody,
    ): ProfileShareDto

    /** `GET /api/profile-page/marks?ids=…`: the outer ring for up to 100 avatars at once (board 6). */
    @GET("api/profile-page/marks")
    suspend fun marks(
        @Query("ids") ids: String,
    ): ProfileMarksResponse
}
