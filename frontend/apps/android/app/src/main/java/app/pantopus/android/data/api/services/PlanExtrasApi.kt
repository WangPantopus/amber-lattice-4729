package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.plans.PlanChipInResponse
import app.pantopus.android.data.api.models.plans.PlanChipInWhoBody
import app.pantopus.android.data.api.models.plans.PlanClaimSpotBody
import app.pantopus.android.data.api.models.plans.PlanDatePickBody
import app.pantopus.android.data.api.models.plans.PlanDatesMineBody
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanFromPlanBody
import app.pantopus.android.data.api.models.plans.PlanFromPlanResponse
import app.pantopus.android.data.api.models.plans.PlanGiftResponse
import app.pantopus.android.data.api.models.plans.PlanGiftWishBody
import app.pantopus.android.data.api.models.plans.PlanPastPeopleDto
import app.pantopus.android.data.api.models.plans.PlanPastPlansResponse
import app.pantopus.android.data.api.models.plans.PlanPhotosResponse
import app.pantopus.android.data.api.models.plans.PlanSpotResponse
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Plans for the holidays, the six extras (08-extras.md): routes under `/api/plans`, so PlansBizInterceptor adds the
 * markers, `extras=1` among them. Kept apart from [PlansApi]. Routes: `backend/routes/plans.js`.
 */
@Suppress("TooManyFunctions")
interface PlanExtrasApi {
    // ---- 1. The same people again (services/plans/planSamePeople.js) ----

    /** `GET /api/plans/past-people`: the host's last ten ended plans that had anyone in. */
    @GET("api/plans/past-people")
    suspend fun pastPlans(): PlanPastPlansResponse

    /** `GET /api/plans/past-people/:postId`: one past plan's people, before anything goes (404 if not the host's). */
    @GET("api/plans/past-people/{postId}")
    suspend fun pastPeople(
        @Path("postId") postId: String,
    ): PlanPastPeopleDto

    /** `POST /api/plans/:id/invites/from-plan`: invites everyone who was in there, but [PlanFromPlanBody.skip]. */
    @POST("api/plans/{id}/invites/from-plan")
    suspend fun inviteFromPlan(
        @Path("id") id: String,
        @Body body: PlanFromPlanBody,
    ): PlanFromPlanResponse

    // ---- 2. Chip in (services/plans/planChipIn.js) ----

    /** `POST /api/plans/:id/chip-in/paid`: "I've paid", or the host's "Mark paid" with `who`. No notice is sent. */
    @POST("api/plans/{id}/chip-in/paid")
    suspend fun markChipIn(
        @Path("id") id: String,
        @Body body: PlanChipInWhoBody,
    ): PlanChipInResponse

    /** `DELETE /api/plans/:id/chip-in/paid[?who=]`: "Undo", or the host taking someone's mark off. */
    @DELETE("api/plans/{id}/chip-in/paid")
    suspend fun unmarkChipIn(
        @Path("id") id: String,
        @Query("who") who: String?,
    ): PlanChipInResponse

    // ---- 3. Find a date (services/plans/planDates.js) ----

    /** `PUT /api/plans/:id/dates/mine`: an invited person's ticks and numbers; answers the plan. */
    @PUT("api/plans/{id}/dates/mine")
    suspend fun saveDates(
        @Path("id") id: String,
        @Body body: PlanDatesMineBody,
    ): PlanDto

    /** `POST /api/plans/:id/dates/pick`: the host picks a time; answers the plan, now ordinary. */
    @POST("api/plans/{id}/dates/pick")
    suspend fun pickDate(
        @Path("id") id: String,
        @Body body: PlanDatePickBody,
    ): PlanDto

    // ---- 4. Gift exchange (services/plans/planGift.js): nobody sees who drew whom ----

    /** `POST /api/plans/:id/gift/join`: "Join" with a wish (again changes it). */
    @POST("api/plans/{id}/gift/join")
    suspend fun joinGift(
        @Path("id") id: String,
        @Body body: PlanGiftWishBody,
    ): PlanGiftResponse

    /** `PATCH /api/plans/:id/gift/mine`: "Change" the wish, also after the draw. */
    @PATCH("api/plans/{id}/gift/mine")
    suspend fun changeGiftWish(
        @Path("id") id: String,
        @Body body: PlanGiftWishBody,
    ): PlanGiftResponse

    /** `DELETE /api/plans/:id/gift/mine`: "Leave", before the draw (`409 drawn` after). */
    @DELETE("api/plans/{id}/gift/mine")
    suspend fun leaveGift(
        @Path("id") id: String,
    ): PlanGiftResponse

    /** `POST /api/plans/:id/gift/draw`: the host's "Draw names now", or "Draw again" (`409 too_few` under three). */
    @POST("api/plans/{id}/gift/draw")
    suspend fun drawGift(
        @Path("id") id: String,
    ): PlanGiftResponse

    // ---- 5. Photos afterwards (services/plans/planPhotos.js): signed links for minutes ----

    /** `GET /api/plans/:id/photos`: the grid (403 `not_in`, 409 `not_over`). */
    @GET("api/plans/{id}/photos")
    suspend fun photos(
        @Path("id") id: String,
    ): PlanPhotosResponse

    /** `POST /api/plans/:id/photos`: one picture a call, field `file`; answers the grid. */
    @Multipart
    @POST("api/plans/{id}/photos")
    suspend fun addPhoto(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
    ): PlanPhotosResponse

    /** `DELETE /api/plans/:id/photos/:photoId`: whoever added it, or the host; answers the grid. */
    @DELETE("api/plans/{id}/photos/{photoId}")
    suspend fun removePhoto(
        @Path("id") id: String,
        @Path("photoId") photoId: String,
    ): PlanPhotosResponse

    // ---- 6. One person pays for the group (services/plans/planGroupPay.js); buying is the shipped join ----

    /** `GET /api/plans/:id/spot?token=`: "Chris got you a spot", or why the link takes nobody now. */
    @GET("api/plans/{id}/spot")
    suspend fun spot(
        @Path("id") id: String,
        @Query("token") token: String,
    ): PlanSpotResponse

    /** `POST /api/plans/:id/requests/claim-spot`: in, free to the reader; answers the plan. */
    @POST("api/plans/{id}/requests/claim-spot")
    suspend fun claimSpot(
        @Path("id") id: String,
        @Body body: PlanClaimSpotBody,
    ): PlanDto

    /** `POST /api/plans/:id/requests/mine/give-back-spots`: the spots nobody took go back to the buyer's card; the plan. */
    @POST("api/plans/{id}/requests/mine/give-back-spots")
    suspend fun giveBackSpots(
        @Path("id") id: String,
    ): PlanDto
}
