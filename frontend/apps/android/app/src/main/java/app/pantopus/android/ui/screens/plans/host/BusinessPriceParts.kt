package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.ui.screens.plans.components.PLAN_FREE
import app.pantopus.android.ui.screens.plans.components.PlanSwitchRow
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the business track, B2: "Price a spot" on the business's form (07-screens P1, the business's
 * form). Off at the start; on, an amount from $1 to $500. A business that can't charge yet sees the row with "Set up
 * payouts to charge for spots" and its shipped payout setup (the owner view's payments, as a payment notice opens it).
 */

/** "Price a spot", or the payout setup for a business that can't charge yet. */
@Composable
internal fun ColumnScope.BusinessPriceField(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val business = ui.business ?: return
    val draft = ui.draft
    if (!business.payoutsReady) {
        Column(modifier = Modifier.testTag("planPriceSpot"), verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Text(
                text = "Price a spot",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(text = "Set up payouts to charge for spots", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            PlanTextButton(
                title = "Set up payouts",
                onClick = { DeepLinkRouter.handle("/businesses/${business.userId}?tab=payments") },
                modifier = Modifier.testTag("planPayoutSetup"),
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        PlanSwitchRow(
            title = "Price a spot",
            caption = if (draft.priceOn) "Guests pay when they join. Full refund until a day before." else null,
            checked = draft.priceOn,
            onChecked = { on -> vm.edit { it.copy(priceOn = on) } },
            modifier = Modifier.testTag("planPriceSpot"),
        )
        if (draft.priceOn) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                Box(modifier = Modifier.width(PRICE_FIELD_WIDTH).testTag("planPriceAmount")) {
                    PlanTextArea(
                        value = draft.priceDollars,
                        onValue = { text -> vm.edit { it.copy(priceDollars = amountTyped(text, PRICE_MAX)) } },
                        placeholder = "18",
                        label = "Price a spot, in dollars",
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                }
                Text(text = "a spot", style = PantopusTextStyle.body, color = PantopusColors.appTextSecondary)
            }
        }
    }
}

/** What may be typed in an amount field: digits and a point, up to [max] characters. */
internal fun amountTyped(
    text: String,
    max: Int,
): String = text.filter { it.isDigit() || it == '.' }.take(max)

/**
 * The preview card's chip (board B2 preview) for the price the business typed: "$18", "$18.50"; "Free" without one. The
 * business's own amount, shown back to it before posting; the posted card's words are the server's.
 */
internal fun previewPriceText(cents: Int?): String =
    when {
        cents == null -> PLAN_FREE
        cents % CENTS == 0 -> "$${cents / CENTS}"
        else -> "$%d.%02d".format(cents / CENTS, cents % CENTS)
    }

private const val CENTS = 100
private const val PRICE_MAX = 7
private val PRICE_FIELD_WIDTH = 120.dp
