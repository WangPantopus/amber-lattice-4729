package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.saved_places.AreaTodayBody
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Around you, Today's second half: one read per kind of place Today shows (`backend/services/aroundYouService.js`). */
interface AroundYouApi {
    /**
     * `GET /api/saved-places/:id/around` — route `backend/routes/savedPlaces.js:115`: Around you (Today's second
     * half) for a saved address.
     */
    @GET("api/saved-places/{id}/around")
    suspend fun savedPlaceAround(
        @Path("id") id: String,
    ): AroundYouDto

    /**
     * `POST /api/saved-places/area/around` — route `backend/routes/savedPlaces.js:139`: Around you for the city around
     * a point rounded to two decimal places (in the body, never the URL). It stores nothing.
     */
    @POST("api/saved-places/area/around")
    suspend fun areaAround(
        @Body body: AreaTodayBody,
    ): AroundYouDto

    /**
     * `GET /api/homes/:id/around` — route `backend/routes/placeIntelligence.js:118`: Around you for a Home, for anyone
     * who can read its Today (a claimant included).
     */
    @GET("api/homes/{id}/around")
    suspend fun homeAround(
        @Path("id") id: String,
    ): AroundYouDto
}
