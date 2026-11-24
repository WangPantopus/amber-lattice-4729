package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.homerecord.HomeRecordWire
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The home record page (contract v1, `~/pantopus-home-record/SPEC.md` section 3): the server draws the page as a
 * list of blocks. Routes `backend/routes/public.js` (`GET /home-record`) and `backend/routes/homes` (`GET /:id/record`).
 */
interface HomeRecordApi {
    /**
     * A looked-up address: the same address parameter, daily limits and privacy rules as `GET /api/public/place`
     * (the auth interceptor sends the token when signed in, so the limit is per account). Always the `lookup` state.
     */
    @GET("api/public/home-record")
    suspend fun lookup(
        @Query("address") address: String,
    ): HomeRecordWire

    /** A Home the person has: the viewer's standing on it decides the state (`member` or `owner`). */
    @GET("api/homes/{id}/record")
    suspend fun forHome(
        @Path("id") homeId: String,
    ): HomeRecordWire
}
