package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.saved_places.AreaAroundListBody
import app.pantopus.android.data.api.models.saved_places.AreaTodayBody
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.models.saved_places.AroundYouListPageDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Around you, Today's second half: one read per kind of place Today shows (`backend/services/aroundYouService.js`). */
interface AroundYouApi {
    /**
     * `GET /api/saved-places/:id/around` — route `backend/routes/savedPlaces.js:115`: Around you (Today's second
     * half) for a saved address. [etag] (the store's copy) makes an unchanged answer a 304.
     */
    @GET("api/saved-places/{id}/around")
    suspend fun savedPlaceAround(
        @Path("id") id: String,
        @Header("If-None-Match") etag: String?,
    ): Response<AroundYouDto>

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
     * who can read its Today (a claimant included). [etag] (the store's copy) makes an unchanged answer a 304.
     */
    @GET("api/homes/{id}/around")
    suspend fun homeAround(
        @Path("id") id: String,
        @Header("If-None-Match") etag: String?,
    ): Response<AroundYouDto>

    /**
     * The same three routes with `list` (and `before`, where the list continues): a page of one of Around you's lists
     * behind the first page (a topic's, "Talked about", or under `all` the earlier stories).
     */
    @GET("api/homes/{id}/around")
    suspend fun homeAroundList(
        @Path("id") id: String,
        @Query("list") list: String,
        @Query("before") before: String?,
    ): AroundYouListPageDto

    @GET("api/saved-places/{id}/around")
    suspend fun savedPlaceAroundList(
        @Path("id") id: String,
        @Query("list") list: String,
        @Query("before") before: String?,
    ): AroundYouListPageDto

    @POST("api/saved-places/area/around")
    suspend fun areaAroundList(
        @Body body: AreaAroundListBody,
    ): AroundYouListPageDto
}
