package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.moments.MomentStampsPreviewBody
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewResponse
import retrofit2.http.Body
import retrofit2.http.POST

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
}
