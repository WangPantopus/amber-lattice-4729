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

/** "Something free" (B1's one kind); the money kinds come with B4 (on a priced spot) and B5 (on the bill). */
const val DEAL_FREE_ITEM = "free_item"

/** B4: "Percent off" (5 to 50) and "Dollars off" (cents). */
const val DEAL_PERCENT = "percent"
const val DEAL_AMOUNT = "amount"

/** B4: "On" is "The spot" on a priced plan; B5 adds the bill's "Food" and "Everything but alcohol". */
const val DEAL_ON_SPOT = "spot"
const val DEAL_ON_FOOD = "food"
const val DEAL_ON_NO_ALCOHOL = "no_alcohol"

/** B5: "Take tips" starts on for these kinds when the business turns the bill on (the server's TIPS_ON_KINDS). */
val TIPS_START_KINDS = setOf("watch_party", "walk_coffee")

/** A percent off starts at 10, from 5 to 50. */
const val DEAL_PERCENT_START = 10
val DEAL_PERCENT_RANGE = 5..50

/** Cents from what was typed in dollars ("18", "18.50", "$4"); null when it isn't an amount. */
fun centsOf(dollars: String): Int? {
    val text = dollars.trim().removePrefix("$").trim()
    if (text.isEmpty()) return null
    val amount = text.toBigDecimalOrNull() ?: return null
    if (amount.signum() < 0 || amount.scale() > 2) return null
    return runCatching { amount.movePointRight(2).intValueExact() }.getOrNull()
}

/**
 * One part of a deal: the deal itself, or the smaller one everyone gets if a group deal falls short. Something free
 * names its [item]; money off the spot (B4) is a [percent] or [dollars] typed in.
 */
data class DealPart(
    val kind: String = DEAL_FREE_ITEM,
    /** "What is it?" for something free: "appetizer for the table" ("A free" is the server's). */
    val item: String = "",
    val percent: Int = DEAL_PERCENT_START,
    val dollars: String = "",
    /** What money off is on: "The spot" (B4), "Food" or "Everything but alcohol" (B5). */
    val on: String = DEAL_ON_SPOT,
) {
    /** What the server takes as `value`: the percent, or the cents typed; none for something free. */
    val value: Int?
        get() =
            when (kind) {
                DEAL_PERCENT -> percent
                DEAL_AMOUNT -> centsOf(dollars)
                else -> null
            }

    /** `applies_to` for money off: the spot (B4) or the bill (B5); none for something free. */
    val appliesTo: String? get() = if (kind == DEAL_PERCENT || kind == DEAL_AMOUNT) on else null

    /** `item` for something free; none for money off. */
    val itemOrNull: String? get() = if (kind == DEAL_FREE_ITEM) item.trim() else null

    companion object {
        /** A part as the server sends it back in the staff's form (`kind`, `item`, `value`). */
        fun of(
            kind: String?,
            item: String?,
            value: Int?,
            appliesTo: String? = null,
        ): DealPart =
            when (kind) {
                DEAL_PERCENT -> DealPart(kind = DEAL_PERCENT, percent = value ?: DEAL_PERCENT_START, on = appliesTo ?: DEAL_ON_SPOT)
                DEAL_AMOUNT -> DealPart(kind = DEAL_AMOUNT, dollars = value?.let(::dollarsOf).orEmpty(), on = appliesTo ?: DEAL_ON_SPOT)
                else -> DealPart(kind = DEAL_FREE_ITEM, item = item.orEmpty())
            }

        /** "4" or "4.50" for cents, to fill the field again. */
        private fun dollarsOf(cents: Int): String =
            if (cents % CENTS == 0) "${cents / CENTS}" else "%d.%02d".format(cents / CENTS, cents % CENTS)

        private const val CENTS = 100
    }
}

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
    /** What they get. */
    val main: DealPart = DealPart(),
    /** A group deal: how many people must be in. */
    val groupSize: Int = 2,
    /** A group deal: by when (in the plan's zone). */
    val groupBy: LocalDateTime? = null,
    /** "If it doesn't unlock": false = "The plan still happens", true = "Give a smaller deal anyway". */
    val smaller: Boolean = false,
    /** The smaller deal everyone gets anyway (the same family as [main]: free after free, money after money). */
    val fallback: DealPart = DealPart(),
) {
    /** The deal as the server takes it, or null for "No deal". */
    fun toInput(zone: ZoneId): PlanDealInput? {
        if (scope == DealScope.NONE) return null
        val group = scope == DealScope.GROUP
        return PlanDealInput(
            scope = scope.wire,
            kind = main.kind,
            item = main.itemOrNull,
            value = main.value,
            appliesTo = main.appliesTo,
            groupSize = groupSize.takeIf { group },
            groupBy = groupBy?.atZone(zone)?.toInstant()?.toString()?.takeIf { group },
            ifShort =
                if (group && smaller) {
                    PlanDealIfShortDto(
                        kind = fallback.kind,
                        item = fallback.itemOrNull,
                        value = fallback.value,
                        appliesTo = fallback.appliesTo,
                    )
                } else {
                    null
                },
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
                main = DealPart.of(form.kind, form.item, form.value, form.appliesTo),
                groupSize = form.groupSize ?: MIN_GROUP,
                groupBy = PlanFormat.instant(form.groupBy)?.atZone(zone)?.toLocalDateTime(),
                smaller = smaller != null,
                fallback = smaller?.let { DealPart.of(it.kind, it.item, it.value, it.appliesTo) } ?: DealPart(),
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

/**
 * deal-preview's body for [draft] on a plan of [spots] starting at [start] (in [zone]), with the spot's price in cents
 * when it has one (B4: money off the spot); null for "No deal".
 */
internal fun dealPreviewBody(
    business: HostAsBusinessDto,
    draft: DealDraft,
    plan: DealPlanFacts,
    zone: ZoneId,
): PlanDealPreviewBody? {
    val deal = draft.toInput(zone) ?: return null
    val startsAt = plan.start?.atZone(zone)?.toInstant()?.toString() ?: return null
    return PlanDealPreviewBody(
        businessUserId = business.userId,
        deal = deal,
        spots = plan.spots,
        startsAt = startsAt,
        priceCents = plan.priceCents,
        payHere = true.takeIf { plan.bill },
    )
}

/** What deal-preview needs to know about the plan: its spots, its start, a spot's price (B4), the bill here (B5). */
data class DealPlanFacts(
    val spots: Int,
    val start: LocalDateTime?,
    val priceCents: Int? = null,
    val bill: Boolean = false,
)

/** How long the form waits after the last edit before asking the server again. */
const val DEAL_PREVIEW_DEBOUNCE_MS = 400L

/** The host flow's step count with a business's deal step ("3 of 4"), and without it ("of 3"). */
const val DEAL_STEPS = 4
const val PLAIN_STEPS = 3

/** The fields a refused deal names: they belong under the deal step's controls. */
val DEAL_FIELDS = setOf("deal", "scope", "kind", "item", "value", "applies_to", "group_size", "group_by", "if_short")
