package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.profile.ProfileMarksResponse
import app.pantopus.android.data.api.models.profile.ProfilePageDto
import app.pantopus.android.data.api.models.profile.ProfilePageMonthDto
import app.pantopus.android.data.api.models.profile.ProfilePieceDto
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
@Suppress("TooManyFunctions")
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

    /** `GET /api/profile-page/id/:id/piece/:pieceId` (§5, P2.2): one piece opened (board 8). */
    @GET("api/profile-page/id/{id}/piece/{pieceId}")
    suspend fun piece(
        @Path("id") id: String,
        @Path("pieceId") pieceId: String,
        @Query("as") audience: String? = null,
    ): ProfilePieceDto

    /** `GET /api/profile-page/me/pieces` (P2.3): the owner's pieces (drafts and hidden included), offers and counts. */
    @GET("api/profile-page/me/pieces")
    suspend fun myPieces(): Map<String, Any?>

    /** `POST /api/profile-page/me/pieces` (P2.3): make a piece. Raw JSON, so an explicit null reaches the server. */
    @POST("api/profile-page/me/pieces")
    suspend fun createPiece(
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `POST /api/profile-page/me/pieces/preview` (P2.3): "How this piece will show", nothing saved. */
    @POST("api/profile-page/me/pieces/preview")
    suspend fun previewPiece(
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `PATCH /api/profile-page/me/pieces/:id` (P2.3): change any of a piece's fields. */
    @PATCH("api/profile-page/me/pieces/{id}")
    suspend fun updatePiece(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `DELETE /api/profile-page/me/pieces/:id` (P2.3): remove a piece; its credits end. */
    @DELETE("api/profile-page/me/pieces/{id}")
    suspend fun deletePiece(
        @Path("id") id: String,
    ): Map<String, Any?>

    /** `POST …/me/pieces/:id/links/:linkId/proof` (P2.4): the line to put on the page. */
    @POST("api/profile-page/me/pieces/{id}/links/{linkId}/proof")
    suspend fun linkProof(
        @Path("id") id: String,
        @Path("linkId") linkId: String,
    ): Map<String, Any?>

    /** `POST …/me/pieces/:id/links/:linkId/check` (P2.4): the card, Seen, when the line is on the page. */
    @POST("api/profile-page/me/pieces/{id}/links/{linkId}/check")
    suspend fun checkLink(
        @Path("id") id: String,
        @Path("linkId") linkId: String,
    ): Map<String, Any?>

    /** `POST …/me/pieces/:id/credits` (P2.5): ask a person (`user_id`) or name someone (`name`), with a role and relation. */
    @POST("api/profile-page/me/pieces/{id}/credits")
    suspend fun addCredit(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `DELETE …/me/pieces/:id/credits/:creditId` (P2.5): the owner takes a credit off their piece. */
    @DELETE("api/profile-page/me/pieces/{id}/credits/{creditId}")
    suspend fun removeCredit(
        @Path("id") id: String,
        @Path("creditId") creditId: String,
    ): Map<String, Any?>

    /** `GET /me/asks` (P2.5): what others asked this person to sign. */
    @GET("api/profile-page/me/asks")
    suspend fun asks(): Map<String, Any?>

    /** `POST /me/asks/:id/sign` (P2.5) with the two choices. */
    @POST("api/profile-page/me/asks/{id}/sign")
    suspend fun signAsk(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `POST /me/asks/:id/decline` (P2.5): "Not me". */
    @POST("api/profile-page/me/asks/{id}/decline")
    suspend fun declineAsk(
        @Path("id") id: String,
    ): Map<String, Any?>

    /** `PATCH /me/ties/:id` (p2.6): the signer changes their two choices. */
    @PATCH("api/profile-page/me/ties/{id}")
    suspend fun updateTie(
        @Path("id") id: String,
        @Body body: RequestBody,
    ): Map<String, Any?>

    /** `DELETE /me/ties/:id` (P2.5): the signer takes their name off. */
    @DELETE("api/profile-page/me/ties/{id}")
    suspend fun removeTie(
        @Path("id") id: String,
    ): Map<String, Any?>

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
