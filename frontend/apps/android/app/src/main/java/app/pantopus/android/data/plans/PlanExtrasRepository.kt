package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.PlanFromPlanBody
import app.pantopus.android.data.api.models.plans.PlanFromPlanResponse
import app.pantopus.android.data.api.models.plans.PlanPastPeopleDto
import app.pantopus.android.data.api.models.plans.PlanPastPlansResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PlanExtrasApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Plans for the holidays, the six extras (08-extras.md). Each is behind its own switch, read for the plan's host; the
 * server answers 404 while it is off. Kept apart from [PlansRepository], which holds the plans themselves.
 */
@Singleton
class PlanExtrasRepository
    @Inject
    constructor(
        private val api: PlanExtrasApi,
    ) {
        // ---- 1. The same people again ----

        suspend fun pastPlans(): NetworkResult<PlanPastPlansResponse> = safeApiCall { api.pastPlans() }

        suspend fun pastPeople(postId: String): NetworkResult<PlanPastPeopleDto> = safeApiCall { api.pastPeople(postId) }

        suspend fun inviteFromPlan(
            id: String,
            body: PlanFromPlanBody,
        ): NetworkResult<PlanFromPlanResponse> = safeApiCall { api.inviteFromPlan(id, body) }
    }
