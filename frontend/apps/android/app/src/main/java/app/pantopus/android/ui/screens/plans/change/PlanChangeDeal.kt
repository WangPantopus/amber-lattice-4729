package app.pantopus.android.ui.screens.plans.change

import app.pantopus.android.ui.screens.plans.host.DealDraft
import app.pantopus.android.ui.screens.plans.host.DealPreviewState
import app.pantopus.android.ui.screens.plans.host.DealScope
import app.pantopus.android.ui.screens.plans.host.takesDeals

/*
 * Plans for the holidays, the business track, B1: a business's deal on the change page (07-screens D3, "also opened
 * from the plan's Change while nobody is in"). While nobody is in, the Deal row opens D3's form over this page and
 * Save sends the deal with the other changes; once anyone is in only "Remove the deal" is offered (the server answers
 * `409 deal_locked` to anything else).
 */

/** The deal part of the change page's state. */
data class PlanChangeDeal(
    /** D3's form is open over the change page. */
    val open: Boolean = false,
    /** The deal as the plan has it (from the card's `deal.form`). */
    val original: DealDraft = DealDraft(),
    /** The form as it is being filled in. */
    val draft: DealDraft = DealDraft(),
    /** The deal accepted with "Done", sent on Save; null while unchanged. */
    val chosen: DealDraft? = null,
    /** The server's sentence for [chosen] ("A free appetizer for the table"), for the row. */
    val chosenText: String? = null,
    val preview: DealPreviewState = DealPreviewState(),
    /** "Done" is asking the server about the deal. */
    val checking: Boolean = false,
    /** "Remove the deal" is being sent. */
    val removing: Boolean = false,
)

/** The Deal row shows for a business's plan the viewer may post for, when the business takes deals or has one. */
val PlanChangeUi.showsDeal: Boolean get() = business != null && (business.takesDeals || plan?.deal != null)

/** B4: a spot's full price in cents on a priced plan (the struck price under a deal for everyone), for deal-preview. */
val PlanChangeUi.spotPriceCents: Int? get() = plan?.price?.let { it.wasCents ?: it.cents }

/** B4: money off "The spot" is offered on a priced plan the business can charge for. */
val PlanChangeUi.priced: Boolean get() = spotPriceCents != null && business?.can?.price == true

/** B5: money off the bill is offered on a plan that takes the bill here. */
val PlanChangeUi.bill: Boolean get() = plan?.payHere != null && business?.can?.payHere == true

/** Anyone is in: the deal can't change (only be removed). */
val PlanChangeUi.dealLocked: Boolean get() = plan?.deal?.let { !it.canChange } ?: (peopleIn > 0)

/** Save sends a changed deal (or takes it off). */
val PlanChangeUi.dealChanged: Boolean get() = deal.chosen != null && deal.chosen != deal.original

/** Save sends a PATCH body with something in it (anything but taking the deal or the price off, which are raw PATCHes). */
val PlanChangeUi.patchesFields: Boolean
    get() = changedBesidesRepeat || repeatChanged || money.sendsFields || room.changed || times.changed || chipIn.changed

/** The fields Save sends as `null`: "Doesn't repeat", and chip in taken away. */
val PlanChangeUi.clears: List<String>
    get() = listOfNotNull("repeat".takeIf { stopsRepeating }, "chip_in".takeIf { chipIn.removes })

/** Save takes the deal off ("No deal" chosen for a plan that has one). */
val PlanChangeUi.removesDeal: Boolean get() = dealChanged && deal.chosen?.scope == DealScope.NONE && plan?.deal != null

/** The Deal row's words: the deal chosen here, else the plan's own sentence, else "No deal". */
val PlanChangeUi.dealRowText: String
    get() =
        when {
            deal.chosen?.scope == DealScope.NONE -> "No deal"
            deal.chosen != null -> deal.chosenText ?: plan?.deal?.text ?: "A deal"
            else -> plan?.deal?.text?.takeIf(String::isNotBlank) ?: "No deal"
        }
