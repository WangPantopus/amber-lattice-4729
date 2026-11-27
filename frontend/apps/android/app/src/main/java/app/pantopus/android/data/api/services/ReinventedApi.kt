package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.reinvented.ReinventedExploreResponse
import app.pantopus.android.data.api.models.reinvented.ReinventedListResponse
import app.pantopus.android.data.api.models.reinvented.ReinventedMapResponse
import app.pantopus.android.data.api.models.reinvented.ReinventedStripResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * "Pulse, reinvented" phase 1 (CONTRACT 6): the routes only the new Pulse tab reads, under `/api/reinvented/`, and only
 * while `pulse_reinvented` is on for the person. Today's screens never send them. Sent while the switch is off for the
 * caller, each answers `403 PULSE_REINVENTED_OFF`; a server from before them answers 404. A point, where one is sent, is
 * the phone's own place, rounded to five places, as the web and iPhone send it.
 */
interface ReinventedApi {
    /**
     * `GET /api/reinvented/list` (CONTRACT 6a): the Moments that fade and the posts that stay a reader may see, by reach
     * (`close`, `around`), miles, chip and cursor, with the distance bands. Route `backend/routes/reinvented.js` (list).
     */
    @Suppress("LongParameterList") // The route's own query, one parameter each.
    @GET("api/reinvented/list")
    suspend fun list(
        @Query("reach") reach: String,
        @Query("miles") miles: Int?,
        @Query("chip") chip: String,
        @Query("latitude") latitude: String?,
        @Query("longitude") longitude: String?,
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int = PAGE,
    ): ReinventedListResponse

    /**
     * `GET /api/reinvented/map` (CONTRACT 6b): rings, marks, tickets and kept Moments for a box and a time (`live`,
     * `today`, `week`, `all`, `tonight`, `weekend`). Route `backend/routes/reinvented.js` (map).
     */
    @Suppress("LongParameterList") // The box's four sides and the time.
    @GET("api/reinvented/map")
    suspend fun map(
        @Query("south") south: String,
        @Query("west") west: String,
        @Query("north") north: String,
        @Query("east") east: String,
        @Query("time") time: String,
    ): ReinventedMapResponse

    /** `GET /api/reinvented/strip` (CONTRACT 6c): Alive right now. Route `backend/routes/reinvented.js` (strip). */
    @GET("api/reinvented/strip")
    suspend fun strip(
        @Query("latitude") latitude: String?,
        @Query("longitude") longitude: String?,
    ): ReinventedStripResponse

    /**
     * `GET /api/reinvented/explore` (CONTRACT 6f): "Today, elsewhere", then newest with variety. The point is the
     * reader's own, to leave their town out. Route `backend/routes/reinvented.js` (explore).
     */
    @GET("api/reinvented/explore")
    suspend fun explore(
        @Query("latitude") latitude: String?,
        @Query("longitude") longitude: String?,
        @Query("cursor") cursor: String?,
    ): ReinventedExploreResponse

    companion object {
        /** Items on a page of the list. */
        const val PAGE = 20
    }
}
