package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.profile.ProfileMarksResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * The profile with sources (`~/pantopus-profile-sources/CONTRACT.md`; `backend/routes/profilePage.js`, owned by the
 * server session). Every route answers 404 while the backend's `PROFILE_SOURCES` switch is off, and the app then
 * keeps today's screens.
 */
interface ProfilePageApi {
    /** `GET /api/profile-page/marks?ids=…`: the outer ring for up to 100 avatars at once (board 6, contract §7). */
    @GET("api/profile-page/marks")
    suspend fun marks(
        @Query("ids") ids: String,
    ): ProfileMarksResponse
}
