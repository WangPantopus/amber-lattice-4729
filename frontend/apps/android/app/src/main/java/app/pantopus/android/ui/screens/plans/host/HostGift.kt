package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanGiftDto
import app.pantopus.android.data.api.models.plans.PlanGiftInput
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.ui.components.FutureDateTimePickerDialogs
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * The holidays' gift exchange on the host form and the Change screen (08-extras section 4, board 26): "Spend up to",
 * "Draw names" (between now and the plan's start) and "Nobody sees who drew whom, not even you." After the draw the
 * Change screen changes "Spend up to" only. The server checks both and says why in words (`field` names which).
 */

/** The field names a gift refusal carries. */
internal const val GIFT_BUDGET = "budget_cents"
internal const val GIFT_DRAW_AT = "draw_at"
internal val GIFT_FIELDS = setOf(GIFT_BUDGET, GIFT_DRAW_AT)

/** Why the form can't go on while "Spend up to" isn't an amount (iPhone's words). */
internal const val GIFT_INCOMPLETE = "Add how much each person spends, or switch Gift exchange off."

/** "Gift exchange" as set: dollars each person spends, as typed, and when names are drawn. */
data class GiftDraft(
    val amount: String = "",
    val drawAt: LocalDateTime? = null,
) {
    /** As the server takes it (null cents while "Spend up to" isn't an amount: the form says so first). */
    fun toInput(zone: ZoneId): PlanGiftInput? {
        val at = drawAt ?: return null
        return PlanGiftInput(budgetCents = centsOf(amount), drawAt = at.atZone(zone).toInstant().toString())
    }

    companion object {
        /** Names are drawn the day before the plan at noon (board 26), or halfway to a start closer than that. */
        fun startingFor(
            start: LocalDateTime?,
            now: LocalDateTime,
        ): GiftDraft {
            start ?: return GiftDraft()
            val noon = LocalDateTime.of(start.toLocalDate().minusDays(1), LocalTime.NOON)
            val at = if (noon.isAfter(now)) noon else now.plus(Duration.between(now, start).dividedBy(2))
            return GiftDraft(drawAt = at.withSecond(0).withNano(0))
        }

        /** As the plan has it: the dollars as the host would type them ("25", "25.50") and the draw time. */
        fun of(
            gift: PlanGiftDto,
            zone: ZoneId,
        ): GiftDraft {
            val cents = gift.budgetCents
            val dollars = if (cents % CENTS == 0) "${cents / CENTS}" else "%d.%02d".format(cents / CENTS, cents % CENTS)
            return GiftDraft(amount = dollars, drawAt = PlanFormat.instant(gift.drawAt)?.atZone(zone)?.toLocalDateTime())
        }
    }
}

/** "Spend up to", "Draw names" (not after the draw: [drawn]) and the line under them. */
@Composable
internal fun GiftFields(
    gift: GiftDraft,
    errors: Map<String, String>,
    drawn: Boolean,
    onEdit: (String, (GiftDraft) -> GiftDraft) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3), modifier = Modifier.testTag("planGiftFields")) {
        PlanField(label = "Spend up to") {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                Box(modifier = Modifier.width(AMOUNT_WIDTH).testTag("planGiftAmount")) {
                    PlanTextArea(
                        value = gift.amount,
                        onValue = { text -> onEdit(GIFT_BUDGET) { it.copy(amount = amountTyped(text, AMOUNT_MAX)) } },
                        placeholder = "25",
                        label = "Spend up to, in dollars",
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                }
            }
            GiftError(errors[GIFT_BUDGET])
        }
        if (!drawn) {
            PlanField(label = "Draw names") {
                PlanFormCard {
                    PlanOptionRow(first = true, onClick = { picking = true }, modifier = Modifier.testTag("planGiftDrawAt")) {
                        Text(
                            text = gift.drawAt?.format(DRAW_FORMAT) ?: "Pick a time",
                            style = PantopusTextStyle.body,
                            color = PantopusColors.appText,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                GiftError(errors[GIFT_DRAW_AT])
            }
        }
        PlanScopeLine("Nobody sees who drew whom, not even you.")
    }
    if (picking) {
        FutureDateTimePickerDialogs(
            initial = gift.drawAt,
            onPicked = { at ->
                picking = false
                onEdit(GIFT_DRAW_AT) { it.copy(drawAt = at) }
            },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun GiftError(message: String?) {
    message ?: return
    Text(text = message, style = PantopusTextStyle.small, color = PantopusColors.error)
}

private val AMOUNT_WIDTH = 120.dp
private const val AMOUNT_MAX = 8
private const val CENTS = 100
private val DRAW_FORMAT = DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.US)
