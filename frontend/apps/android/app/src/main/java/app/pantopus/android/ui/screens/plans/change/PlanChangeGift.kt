package app.pantopus.android.ui.screens.plans.change

import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGiftInput
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.ui.screens.plans.host.GIFT_INCOMPLETE
import app.pantopus.android.ui.screens.plans.host.GiftDraft
import app.pantopus.android.ui.screens.plans.host.centsOf
import java.time.ZoneId

/*
 * The holidays' gift exchange on the Change screen (08-extras section 4): the host form's card, while
 * `plans_gift_exchange` is on for the host. Before the draw both values may change; after it only "Spend up to" (the
 * draw time is hidden and not sent, server #4329). Off sends `"gift": null`, which calls it off and forgets the pairs.
 */

/** The gift exchange as the plan has it ([original]) and as changed here ([draft], null: off). */
data class PlanChangeGift(
    val shows: Boolean = false,
    val original: GiftDraft? = null,
    val draft: GiftDraft? = null,
    /** Names were drawn: only the budget changes. */
    val drawn: Boolean = false,
    val errors: Map<String, String> = emptyMap(),
) {
    val changed: Boolean get() = shows && draft != original

    /** Save calls it off (`"gift": null`). */
    val removes: Boolean get() = changed && draft == null && original != null

    /** What Save can't send: "Spend up to" isn't an amount, or (before the draw) no draw time. */
    val problem: String?
        get() {
            val gift = draft?.takeIf { changed } ?: return null
            return GIFT_INCOMPLETE.takeIf { centsOf(gift.amount) == null || (!drawn && gift.drawAt == null) }
        }

    /** The new value, only when it changed. After the draw the budget goes alone: the server keeps its draw time. */
    fun toSend(zone: ZoneId): PlanGiftInput? {
        val gift = draft?.takeIf { changed } ?: return null
        if (drawn) return PlanGiftInput(budgetCents = centsOf(gift.amount), drawAt = null)
        return gift.toInput(zone)
    }

    companion object {
        fun of(
            plan: PlanDto,
            giftOn: Boolean,
            zone: ZoneId,
        ): PlanChangeGift {
            val shows = giftOn && plan.isPrivate && plan.business == null && plan.planKind != PlanKind.PLAYDATE
            if (!shows) return PlanChangeGift()
            val gift = plan.gift?.let { GiftDraft.of(it, zone) }
            return PlanChangeGift(shows = true, original = gift, draft = gift, drawn = plan.gift?.isDrawn == true)
        }
    }
}
