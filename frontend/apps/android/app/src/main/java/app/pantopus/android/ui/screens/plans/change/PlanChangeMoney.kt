package app.pantopus.android.ui.screens.plans.change

import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.ui.screens.plans.host.centsOf

/*
 * Plans for the holidays, the business track, B2 and B5 on the change page (07-screens, settled: "The Change screen shows
 * what the server lets change", contract 10.2): a business's price while nobody is in or paying (the server answers
 * `409 price_locked` after that), and "Guests can pay their bill here" with "Take tips" at any time.
 */

/** The money rows' state on the change page. */
data class PlanChangeMoney(
    /** The spot's full price in cents as the plan has it; null when free. */
    val originalPriceCents: Int? = null,
    val originalPayHere: Boolean = false,
    val originalTipsOn: Boolean = false,
    val priceOn: Boolean = false,
    val priceDollars: String = "",
    val payHere: Boolean = false,
    val tipsOn: Boolean = false,
) {
    /** The price the rows describe now (null when off or unreadable). */
    val priceCents: Int? get() = if (priceOn) centsOf(priceDollars) else null

    /** Save sends a new price. */
    val priceChanged: Boolean get() = priceOn && priceCents != null && priceCents != originalPriceCents

    /** Save takes the price off. */
    val removesPrice: Boolean get() = !priceOn && originalPriceCents != null

    val payChanged: Boolean get() = payHere != originalPayHere || (payHere && tipsOn != originalTipsOn)

    val changed: Boolean get() = priceChanged || removesPrice || payChanged

    /** A new price or the bill rows go in the PATCH body. */
    val sendsFields: Boolean get() = priceChanged || payChanged

    companion object {
        /** The rows as the plan has them (the full price under a deal's: `was_cents`). */
        fun of(plan: PlanDto): PlanChangeMoney {
            val price = plan.price?.let { it.wasCents ?: it.cents }
            val payHere = plan.payHere != null
            val tips = plan.payHere?.tipsOn == true
            return PlanChangeMoney(
                originalPriceCents = price,
                originalPayHere = payHere,
                originalTipsOn = tips,
                priceOn = price != null,
                priceDollars = price?.let(::dollarsText).orEmpty(),
                payHere = payHere,
                tipsOn = tips,
            )
        }

        private fun dollarsText(cents: Int): String =
            if (cents % CENTS == 0) "${cents / CENTS}" else "%d.%02d".format(cents / CENTS, cents % CENTS)

        private const val CENTS = 100
    }
}
