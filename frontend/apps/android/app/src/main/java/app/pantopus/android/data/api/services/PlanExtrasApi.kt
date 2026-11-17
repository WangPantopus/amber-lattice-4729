package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.plans.PlanFromPlanBody
import app.pantopus.android.data.api.models.plans.PlanFromPlanResponse
import app.pantopus.android.data.api.models.plans.PlanPastPeopleDto
import app.pantopus.android.data.api.models.plans.PlanPastPlansResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Plans for the holidays, the six extras (08-extras.md): routes under `/api/plans`, so PlansBizInterceptor adds the
 * markers, `extras=1` among them. Kept apart from [PlansApi]. Routes: `backend/routes/plans.js`.
 */
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
}
