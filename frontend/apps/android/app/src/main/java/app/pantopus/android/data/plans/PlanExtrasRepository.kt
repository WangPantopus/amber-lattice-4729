package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.PlanChipInResponse
import app.pantopus.android.data.api.models.plans.PlanChipInWhoBody
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

        // ---- 2. Chip in ----

        /** "I've paid" ([who] null), "Undo" ([paid] false), or the host's "Mark paid" for [who]. */
        suspend fun markChipIn(
            id: String,
            who: String?,
            paid: Boolean,
        ): NetworkResult<PlanChipInResponse> =
            safeApiCall { if (paid) api.markChipIn(id, PlanChipInWhoBody(who)) else api.unmarkChipIn(id, who) }

        // ---- 3. Find a date ----

        suspend fun saveDates(
            id: String,
            body: PlanDatesMineBody,
        ): NetworkResult<PlanDto> = safeApiCall { api.saveDates(id, body) }

        suspend fun pickDate(
            id: String,
            optionId: String,
        ): NetworkResult<PlanDto> = safeApiCall { api.pickDate(id, PlanDatePickBody(optionId)) }

        // ---- 4. Gift exchange (the name drawn is never logged or kept: the answer goes back to the card only) ----

        /** "Join" (or "Save" once joined, [joined]) with [wish]. */
        suspend fun saveGiftWish(
            id: String,
            wish: String,
            joined: Boolean,
        ): NetworkResult<PlanGiftResponse> =
            safeApiCall {
                if (joined) api.changeGiftWish(id, PlanGiftWishBody(wish)) else api.joinGift(id, PlanGiftWishBody(wish))
            }

        suspend fun leaveGift(id: String): NetworkResult<PlanGiftResponse> = safeApiCall { api.leaveGift(id) }

        suspend fun drawGift(id: String): NetworkResult<PlanGiftResponse> = safeApiCall { api.drawGift(id) }

        // ---- 5. Photos afterwards (adding is PlanPhotoUploads) ----

        suspend fun photos(id: String): NetworkResult<PlanPhotosResponse> = safeApiCall { api.photos(id) }

        suspend fun removePhoto(
            id: String,
            photoId: String,
        ): NetworkResult<PlanPhotosResponse> = safeApiCall { api.removePhoto(id, photoId) }
    }
