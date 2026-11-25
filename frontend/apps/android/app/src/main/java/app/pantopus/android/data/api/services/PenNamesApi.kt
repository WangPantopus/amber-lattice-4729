package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.pennames.PenNameCardResponse
import app.pantopus.android.data.api.models.pennames.PenNameCheckResponse
import app.pantopus.android.data.api.models.pennames.PenNameMeResponse
import app.pantopus.android.data.api.models.pennames.PenNameSuggestionsResponse
import app.pantopus.android.data.api.models.pennames.TakePenNameRequest
import app.pantopus.android.data.api.models.pennames.TakePenNameResponse
import app.pantopus.android.data.api.models.posts.PenNamePostsResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Made-up names (`backend/routes/penNames.js`; contract `docs/product/made-up-names/README.md`). Posting and replying
 * under one go through the ordinary post routes with `postAs: "pen_name"`. Every refusal is `{ error, code }`.
 */
interface PenNamesApi {
    /** `GET /api/pen-names/me`: the person's made-up name, whether they may use one, the promise and suggestions. */
    @GET("api/pen-names/me")
    suspend fun me(): PenNameMeResponse

    /** `POST /api/pen-names`: take the typed name, or one Pantopus gives (empty `name`); `replace` changes it. */
    @POST("api/pen-names")
    suspend fun take(
        @Body body: TakePenNameRequest,
    ): TakePenNameResponse

    /** `GET /api/pen-names/suggestions`: four more names Pantopus could give (Shuffle). */
    @GET("api/pen-names/suggestions")
    suspend fun suggestions(): PenNameSuggestionsResponse

    /** `GET /api/pen-names/check`: whether a post made here may carry a made-up name, and the "few homes" warning. */
    @GET("api/pen-names/check")
    suspend fun check(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double,
    ): PenNameCheckResponse

    /** `GET /api/pen-names/me/posts`: the person's own made-up-name posts, newest first. Only they can read it. */
    @GET("api/pen-names/me/posts")
    suspend fun myPosts(
        @Query("before") before: String? = null,
        @Query("limit") limit: Int = 20,
    ): PenNamePostsResponse

    /** `GET /api/pen-names/:id`: the small card a made-up name opens. */
    @GET("api/pen-names/{id}")
    suspend fun card(
        @Path("id") id: String,
    ): PenNameCardResponse

    /** `POST /api/pen-names/:id/mute`: hide everything that account writes under any made-up name. */
    @POST("api/pen-names/{id}/mute")
    suspend fun mute(
        @Path("id") id: String,
    ): Unit

    @DELETE("api/pen-names/{id}/mute")
    suspend fun unmute(
        @Path("id") id: String,
    ): Unit

    /** `POST /api/pen-names/:id/block`: as mute, and that account can't reply to this person under any name. */
    @POST("api/pen-names/{id}/block")
    suspend fun block(
        @Path("id") id: String,
    ): Unit

    @DELETE("api/pen-names/{id}/block")
    suspend fun unblock(
        @Path("id") id: String,
    ): Unit
}
