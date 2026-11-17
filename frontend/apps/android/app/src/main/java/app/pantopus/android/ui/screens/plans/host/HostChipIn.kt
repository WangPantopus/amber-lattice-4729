package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/*
 * The holidays' chip in on the host form (08-extras section 3, board 26): "Each person", "What for" and "Payment link"
 * under "Add to this plan" while the row is on. The server checks all three and says why in words (`field` names which);
 * no money moves through Pantopus, and only the host and people who are in read the link.
 */

/** The field names a chip-in refusal carries. */
internal const val CHIP_IN_AMOUNT = "amount_cents"
internal const val CHIP_IN_NOTE = "note"
internal const val CHIP_IN_LINK = "link"

/**
 * The three fields and the line under them, on the host form and on the Change screen: [errors] holds the server's
 * sentence under the field it refused, and [onEdit] changes one field (its refusal goes).
 */
@Composable
internal fun ChipInFields(
    chip: ChipInDraft,
    errors: Map<String, String>,
    onEdit: (String, (ChipInDraft) -> ChipInDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3), modifier = Modifier.testTag("planChipInFields")) {
        PlanField(label = "Each person") {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                Box(modifier = Modifier.width(AMOUNT_WIDTH).testTag("planChipInAmount")) {
                    PlanTextArea(
                        value = chip.amount,
                        onValue = { text -> onEdit(CHIP_IN_AMOUNT) { it.copy(amount = amountTyped(text, AMOUNT_MAX)) } },
                        placeholder = "12",
                        label = "Each person, in dollars",
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                }
            }
            FieldError(errors[CHIP_IN_AMOUNT])
        }
        PlanField(label = "What for") {
            Box(modifier = Modifier.testTag("planChipInNote")) {
                PlanTextArea(
                    value = chip.note,
                    onValue = { text -> onEdit(CHIP_IN_NOTE) { it.copy(note = text.take(NOTE_MAX)) } },
                    placeholder = "The turkey and the drinks",
                    label = "What for",
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
            }
            FieldError(errors[CHIP_IN_NOTE])
        }
        PlanField(label = "Payment link") {
            Box(modifier = Modifier.testTag("planChipInLink")) {
                PlanTextArea(
                    value = chip.link,
                    onValue = { text -> onEdit(CHIP_IN_LINK) { it.copy(link = text.trim().take(LINK_MAX)) } },
                    placeholder = "venmo.com/u/your-name",
                    label = "Payment link",
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
            }
            FieldError(errors[CHIP_IN_LINK])
        }
        PlanScopeLine("A Venmo, PayPal or Cash App link. Only people who are in see it.", icon = PantopusIcon.Info)
    }
}

@Composable
private fun FieldError(message: String?) {
    message ?: return
    Text(text = message, style = PantopusTextStyle.small, color = PantopusColors.error)
}

private val AMOUNT_WIDTH = 120.dp
private const val AMOUNT_MAX = 8
private const val NOTE_MAX = 60

/** The server takes up to 300 characters; a little more may be typed so its own sentence says so. */
private const val LINK_MAX = 320

/** "Chip in" as the plan has it: the dollars as the host would type them ("12", "12.50"), what for, and the link. */
internal fun ChipInDraft.Companion.of(amountCents: Int, note: String?, link: String?): ChipInDraft {
    val dollars = if (amountCents % CENTS == 0) "${amountCents / CENTS}" else "%d.%02d".format(amountCents / CENTS, amountCents % CENTS)
    return ChipInDraft(amount = dollars, note = note.orEmpty(), link = link.orEmpty())
}

private const val CENTS = 100
