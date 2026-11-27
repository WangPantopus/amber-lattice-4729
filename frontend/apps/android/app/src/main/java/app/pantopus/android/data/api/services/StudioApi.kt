package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.moments.MomentSignalResponse
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewBody
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewResponse
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * The requests only "Pulse, reinvented"'s new screens send (CONTRACT sections 2 to 4), and only while
 * `pulse_reinvented` is on for the person. Today's screens never send them. Sent while the switch is off for the
 * caller, each answers `403 PULSE_REINVENTED_OFF` (CONTRACT 1).
 */
interface StudioApi {
    /**
     * `POST /api/moments/place-preview` with `stamps: true` (CONTRACT 2a): what the tray's stamps would read for a Moment
     * posted here now. Route `backend/routes/moments.js` (place-preview, `stampsPreview`).
     */
    @POST("api/moments/place-preview")
    suspend fun stampsPreview(
        @Body body: MomentStampsPreviewBody,
    ): MomentStampsPreviewResponse

    /**
     * `PUT /api/moments/:id/reaction` with `{ "signal": "learned" }` or `{ "signal": null }` (CONTRACT 4): one of the
     * five signals, or none; it replaces the caller's emoji. The body is raw JSON, so taking a signal back sends the null.
     * Route `backend/routes/moments.js` (reaction).
     */
    @PUT("api/moments/{id}/reaction")
    suspend fun signal(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): MomentSignalResponse
}
