package app.pantopus.android.ui.screens.plans.host

import app.pantopus.android.data.api.models.plans.HostAsBusinessDto
import app.pantopus.android.data.api.models.plans.PlanDealFormDto
import app.pantopus.android.data.api.models.plans.PlanDealIfShortDto
import app.pantopus.android.data.api.models.plans.PlanDealInput
import app.pantopus.android.data.api.models.plans.PlanDealPreviewBody
import app.pantopus.android.data.api.models.plans.PlanDealPreviewResponse
import app.pantopus.android.data.plans.PlanFormat
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId

/*
 * Plans for the holidays, the business track, B1 (07-screens D3, contract 9): the deal a business is choosing for its
 * plan. Shared by the host flow's deal step and the change page. The words a guest will read are never put together
 * here: they come from `POST /api/plans/deal-preview` (the sentence, the condition, what happens if it falls short and
 * how it's claimed), and any field the server refuses comes back with its own sentence.
 */

/** "Something free" (B1's one kind); the money kinds come with B4 and B5. */
const val DEAL_FREE_ITEM = "free_item"

/** The most a "What is it?" may hold (the server's limit). */
const val DEAL_ITEM_MAX = 40

/** D3's "Deal": "No deal", "For everyone who joins" or "A group deal". */
enum class DealScope(
    val wire: String,
) {
    NONE("none"),
    EVERYONE("everyone"),
    GROUP("group"),
}

/** D3's form as the business fills it in. Every guest-facing word comes from deal-preview, not from this. */
data class DealDraft(
    val scope: DealScope = DealScope.NONE,
    val kind: String = DEAL_FREE_ITEM,
    /** "What is it?" for something free: "appetizer for the table" ("A free" is the server's). */
    val item: String = "",
    /** A group deal: how many people must be in. */
    val groupSize: Int = 2,
    /** A group deal: by when (in the plan's zone). */
    val groupBy: LocalDateTime? = null,
    /** "If it doesn't unlock": false = "The plan still happens", true = "Give a smaller deal anyway". */
    val smaller: Boolean = false,
    val smallerKind: String = DEAL_FREE_ITEM,
    val smallerItem: String = "",
) {
    /** The deal as the server takes it, or null for "No deal". */
    fun toInput(zone: ZoneId): PlanDealInput? =
        when (scope) {
            DealScope.NONE -> null
            DealScope.EVERYONE -> PlanDealInput(scope = scope.wire, kind = kind, item = item.trim())
            DealScope.GROUP ->
                PlanDealInput(
                    scope = scope.wire,
                    kind = kind,
                    item = item.trim(),
                    groupSize = groupSize,
                    groupBy = groupBy?.atZone(zone)?.toInstant()?.toString(),
                    ifShort = if (smaller) PlanDealIfShortDto(kind = smallerKind, item = smallerItem.trim()) else null,
                )
        }

    companion object {
        /**
         * A new deal's starting values for a plan of [spots] starting at [start]: half the spots (at least 2), closing
         * two hours before the start (or halfway there when the start is sooner).
         */
        fun startingFor(
            spots: Int,
            start: LocalDateTime?,
            now: LocalDateTime,
        ): DealDraft {
            val size = ((spots + 1) / 2).coerceAtLeast(MIN_GROUP).coerceAtMost(spots.coerceAtLeast(MIN_GROUP))
            return DealDraft(groupSize = size, groupBy = start?.let { defaultBy(it, now) })
        }

        /** The staff's form as the card sends it back (D3 opened from "Change"). */
        fun from(
            form: PlanDealFormDto?,
            zone: ZoneId,
        ): DealDraft {
            form ?: return DealDraft()
            val scope = DealScope.entries.firstOrNull { it.wire == form.scope } ?: DealScope.NONE
            val smaller = form.ifShort
            return DealDraft(
                scope = scope,
                kind = form.kind ?: DEAL_FREE_ITEM,
                item = form.item.orEmpty(),
                groupSize = form.groupSize ?: MIN_GROUP,
                groupBy = PlanFormat.instant(form.groupBy)?.atZone(zone)?.toLocalDateTime(),
                smaller = smaller != null,
                smallerKind = smaller?.kind ?: DEAL_FREE_ITEM,
                smallerItem = smaller?.item.orEmpty(),
            )
        }

        private fun defaultBy(
            start: LocalDateTime,
            now: LocalDateTime,
        ): LocalDateTime {
            val twoHoursBefore = start.minusHours(2)
            if (twoHoursBefore.isAfter(now.plusMinutes(SOONEST_MINUTES))) return twoHoursBefore
            val half = Duration.between(now, start).dividedBy(2)
            return if (half.isNegative) start else now.plus(half).withSecond(0).withNano(0)
        }

        const val MIN_GROUP = 2
        private const val SOONEST_MINUTES = 30L
    }
}

/** The plan the deal is for, in one line (D3 item 2): its title, then the business and the time. */
data class DealPlanLine(
    val title: String,
    val detail: String,
    val avatarUrl: String?,
)

/** What "Guests will read" shows: the server's last answer (kept while the next one loads) and its field errors. */
data class DealPreviewState(
    val answer: PlanDealPreviewResponse? = null,
    val loading: Boolean = false,
    /** The server's sentence for each refused field (`item`, `group_size`, `group_by`, `if_short`, …). */
    val errors: Map<String, String> = emptyMap(),
    /** Why the preview couldn't be read (no connection); the form still works. */
    val failed: String? = null,
    /** "Preview" (or "Done") asked: every error shows, a blank "What is it?" too. */
    val checked: Boolean = false,
)

/** Whether the business can add a deal to its plan (host-as `can.deals`, contract 9.2). */
val HostAsBusinessDto.takesDeals: Boolean get() = can?.deals == true

/** deal-preview's body for [draft] on a plan of [spots] starting at [start] (in [zone]); null for "No deal". */
internal fun dealPreviewBody(
    business: HostAsBusinessDto,
    draft: DealDraft,
    spots: Int,
    start: LocalDateTime?,
    zone: ZoneId,
): PlanDealPreviewBody? {
    val deal = draft.toInput(zone) ?: return null
    val startsAt = start?.atZone(zone)?.toInstant()?.toString() ?: return null
    return PlanDealPreviewBody(businessUserId = business.userId, deal = deal, spots = spots, startsAt = startsAt)
}

/** How long the form waits after the last edit before asking the server again. */
const val DEAL_PREVIEW_DEBOUNCE_MS = 400L

/** The host flow's step count with a business's deal step ("3 of 4"), and without it ("of 3"). */
const val DEAL_STEPS = 4
const val PLAIN_STEPS = 3

/** The fields a refused deal names: they belong under the deal step's controls. */
val DEAL_FIELDS = setOf("deal", "scope", "kind", "item", "group_size", "group_by", "if_short")
