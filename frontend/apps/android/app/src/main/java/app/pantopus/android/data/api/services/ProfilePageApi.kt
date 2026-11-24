package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.profile.ProfileMarksResponse
import app.pantopus.android.data.api.models.profile.ProfilePageDto
import app.pantopus.android.data.api.models.profile.ProfilePageMonthDto
import app.pantopus.android.data.api.models.profile.ProfileShareDto
import app.pantopus.android.data.api.models.profile.ProfileShareLinkCreateBody
import app.pantopus.android.data.api.models.profile.ProfileShareLinkDto
import app.pantopus.android.data.api.models.profile.ProfileShareUpdateBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
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

    /** `GET /api/profile-page/:username/v/:key` (v1.3): the page a link for one purpose opens, as a visitor gets it. */
    @GET("api/profile-page/{username}/v/{key}")
    suspend fun pageByKey(
        @Path("username") username: String,
        @Path("key") key: String,
    ): ProfilePageDto

    /** `POST /api/profile-page/me/links` (v1.3): make a link for one purpose. */
    @POST("api/profile-page/me/links")
    suspend fun createLink(
        @Body body: ProfileShareLinkCreateBody,
    ): ProfileShareLinkDto

    /**
     * `PATCH /api/profile-page/me/links/:id` (v1.3): any of name, parts (merged), ends_on (null clears), switched_off.
     * The body is raw JSON so an explicit `"ends_on": null` reaches the server.
     */
    @PATCH("api/profile-page/me/links/{id}")
    suspend fun updateLink(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): ProfileShareLinkDto

    /** `DELETE /api/profile-page/me/links/:id` (v1.3). */
    @DELETE("api/profile-page/me/links/{id}")
    suspend fun deleteLink(
        @Path("id") id: String,
    ): Map<String, Any?>

    /** `GET /api/profile-page/marks?ids=…`: the outer ring for up to 100 avatars at once (board 6). */
    @GET("api/profile-page/marks")
    suspend fun marks(
        @Query("ids") ids: String,
    ): ProfileMarksResponse
}
