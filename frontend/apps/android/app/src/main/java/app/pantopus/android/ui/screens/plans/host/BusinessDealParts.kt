package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.FutureDateTimePickerDialogs
import app.pantopus.android.ui.screens.plans.components.PlanBusinessShape
import app.pantopus.android.ui.screens.plans.components.PlanChoice
import app.pantopus.android.ui.screens.plans.components.PlanChoiceGroup
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanRadio
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanStepperControl
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.PlanWell
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Plans for the holidays, the business track, B1: D3, "A deal for this plan" (07-screens D3, picture 09). The form is
 * stateless: the host flow's deal step and the change page each hold a [DealDraft] and the server's answer. In B1 the
 * only kind offered is "Something free"; a kind not offered yet isn't drawn. Every sentence under "Guests will read"
 * and every field error is the server's.
 */

/** The whole D3 form under its bar: the plan, Deal, What they get, How much, Unlocks when, If it doesn't unlock, Guests will read. */
@Composable
internal fun ColumnScope.BusinessDealForm(
    draft: DealDraft,
    spots: Int,
    planLine: DealPlanLine,
    preview: DealPreviewState,
    onEdit: ((DealDraft) -> DealDraft) -> Unit,
    /** B4: the plan has a price the business can charge, so money off "The spot" is offered. */
    priced: Boolean = false,
) {
    // Live answers don't flag a field nobody has filled in yet; "Preview" (or "Done") shows every error.
    val errors =
        if (preview.checked) {
            preview.errors
        } else {
            preview.errors.filterKeys { key ->
                !(key in PART_FIELDS && draft.main.isBlank()) && !(key == "if_short" && draft.smaller && draft.fallback.isBlank())
            }
        }
    DealPlanHeader(planLine)
    DealScopeField(draft, errors["scope"], onEdit)
    if (draft.scope == DealScope.NONE) return
    DealWhatField(
        label = "What they get",
        part = draft.main,
        kinds = dealKinds(priced),
        smaller = false,
        errors = errors,
        onPart = { change -> onEdit { it.copy(main = change(it.main)) } },
    )
    if (draft.scope == DealScope.GROUP) {
        DealUnlocksField(draft, spots, errors, onEdit)
        DealIfShortField(draft, errors["if_short"], onEdit)
    }
    DealGuestsWillRead(preview)
}

@Composable
private fun DealPlanHeader(line: DealPlanLine) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanBusinessShape(size = 36.dp, avatarUrl = line.avatarUrl)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = line.title, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            Text(text = line.detail, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
}

/** "Deal": No deal, For everyone who joins, A group deal (one picked). */
@Composable
private fun DealScopeField(
    draft: DealDraft,
    error: String?,
    onEdit: ((DealDraft) -> DealDraft) -> Unit,
) {
    // Something free is claimed at the place; money off is taken when they pay (B4, B5).
    val everyoneCaption = if (draft.main.kind == DEAL_FREE_ITEM) "Each guest gets it there" else "Each guest gets it when they pay"
    PlanField(label = "Deal") {
        PlanFormCard(modifier = Modifier.selectableGroup()) {
            DealRadioRow(
                first = true,
                selected = draft.scope == DealScope.NONE,
                title = "No deal",
                caption = null,
                tag = "planDealScope.none",
                onClick = { onEdit { it.copy(scope = DealScope.NONE) } },
            )
            DealRadioRow(
                first = false,
                selected = draft.scope == DealScope.EVERYONE,
                title = "For everyone who joins",
                caption = everyoneCaption,
                tag = "planDealScope.everyone",
                onClick = { onEdit { it.copy(scope = DealScope.EVERYONE) } },
            )
            DealRadioRow(
                first = false,
                selected = draft.scope == DealScope.GROUP,
                title = "A group deal",
                caption = "Unlocks for all when enough people join in time",
                tag = "planDealScope.group",
                onClick = { onEdit { it.copy(scope = DealScope.GROUP) } },
            )
        }
        DealFieldError(error)
    }
}

/**
 * "What they get" and "How much": "Something free" with "What is it?", or (B4, on a priced plan) "Percent off" (5 to 50)
 * or "Dollars off" (an amount) on "The spot". Used for the smaller deal too ([smaller]). [errors] are the server's, by
 * field.
 */
@Composable
private fun DealWhatField(
    label: String,
    part: DealPart,
    kinds: List<PlanChoice>,
    smaller: Boolean,
    errors: Map<String, String>,
    onPart: ((DealPart) -> DealPart) -> Unit,
) {
    val prefix = if (smaller) "planDealSmaller" else "planDeal"
    PlanField(label = label) {
        PlanChoiceGroup(
            choices = kinds,
            isSelected = { it.id == part.kind },
            onSelect = { choice -> onPart { it.copy(kind = choice.id) } },
            tagPrefix = "${prefix}Kind",
        )
        if (!smaller) DealFieldError(errors["kind"])
    }
    // The smaller deal's errors all come back under `if_short`.
    val itemError = if (smaller) errors["if_short"] else errors["item"]
    val valueError = if (smaller) errors["if_short"] else errors["value"] ?: errors["applies_to"]
    if (part.kind == DEAL_FREE_ITEM) {
        PlanField(label = "What is it?", modifier = Modifier.testTag("${prefix}Item")) {
            PlanTextArea(
                value = part.item,
                onValue = { text -> onPart { it.copy(item = text.take(DEAL_ITEM_MAX)) } },
                placeholder = "appetizer for the table",
                label = "What is it?",
                singleLine = true,
            )
            DealFieldError(itemError)
        }
    } else {
        DealHowMuch(part, prefix, valueError, onPart)
    }
}

/** B4's "How much" and "On": a percent (5 to 50) or dollars off, on "The spot". */
@Composable
private fun DealHowMuch(
    part: DealPart,
    prefix: String,
    error: String?,
    onPart: ((DealPart) -> DealPart) -> Unit,
) {
    PlanField(label = "How much") {
        PlanFormCard {
            PlanOptionRow(first = true, modifier = Modifier.testTag("${prefix}Value")) {
                Text(
                    text = if (part.kind == DEAL_PERCENT) "Percent off" else "Dollars off",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                if (part.kind == DEAL_PERCENT) {
                    PlanStepperControl(
                        value = part.percent.coerceIn(DEAL_PERCENT_RANGE),
                        range = DEAL_PERCENT_RANGE,
                        label = "Percent off",
                        onChange = { value -> onPart { it.copy(percent = value) } },
                        holdStep = PERCENT_HOLD_STEP,
                    )
                    Text(text = "%", style = PantopusTextStyle.body, color = PantopusColors.appText)
                } else {
                    Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                    Box(modifier = Modifier.width(DOLLARS_FIELD_WIDTH)) {
                        PlanTextArea(
                            value = part.dollars,
                            onValue = { text -> onPart { it.copy(dollars = amountTyped(text, DOLLARS_MAX)) } },
                            placeholder = "4",
                            label = "Dollars off",
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        )
                    }
                }
            }
            PlanOptionRow {
                Text(text = "On", style = PantopusTextStyle.body, color = PantopusColors.appText, modifier = Modifier.weight(1f))
                Text(
                    text = "The spot",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
            }
        }
        DealFieldError(error)
    }
}

/** The kinds a deal may be: "Something free", and on a priced plan (B4) "Percent off" and "Dollars off". */
private fun dealKinds(priced: Boolean): List<PlanChoice> =
    buildList {
        if (priced) {
            add(PlanChoice(DEAL_PERCENT, "Percent off"))
            add(PlanChoice(DEAL_AMOUNT, "Dollars off"))
        }
        add(PlanChoice(DEAL_FREE_ITEM, "Something free"))
    }

/** A smaller deal is the same family as the deal: free after free, money after money (the server's rule). */
private fun smallerKinds(main: DealPart): List<PlanChoice> =
    if (main.kind == DEAL_FREE_ITEM) {
        listOf(PlanChoice(DEAL_FREE_ITEM, "Something free"))
    } else {
        listOf(PlanChoice(DEAL_PERCENT, "Percent off"), PlanChoice(DEAL_AMOUNT, "Dollars off"))
    }

/** Nothing typed in yet: an empty "What is it?" or "Dollars off". */
private fun DealPart.isBlank(): Boolean =
    when (kind) {
        DEAL_FREE_ITEM -> item.isBlank()
        DEAL_AMOUNT -> dollars.isBlank()
        else -> false
    }

private val PART_FIELDS = setOf("item", "value")
private const val PERCENT_HOLD_STEP = 5
private const val DOLLARS_MAX = 7
private val DOLLARS_FIELD_WIDTH = 96.dp

private val byFormat = DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.US)

/** "Unlocks when": People who join (2 to the plan's spots) and By (a date and time before the plan starts). */
@Composable
private fun DealUnlocksField(
    draft: DealDraft,
    spots: Int,
    errors: Map<String, String>,
    onEdit: ((DealDraft) -> DealDraft) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val most = spots.coerceAtLeast(DealDraft.MIN_GROUP)
    PlanField(label = "Unlocks when") {
        PlanFormCard {
            PlanOptionRow(first = true, modifier = Modifier.testTag("planDealGroupSize")) {
                Text(
                    text = "People who join",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                PlanStepperControl(
                    value = draft.groupSize.coerceIn(DealDraft.MIN_GROUP, most),
                    range = DealDraft.MIN_GROUP..most,
                    label = "People who join",
                    onChange = { value -> onEdit { it.copy(groupSize = value) } },
                )
            }
            val byText = draft.groupBy?.format(byFormat) ?: "Pick a time"
            PlanOptionRow(
                onClick = { picking = true },
                modifier =
                    Modifier.testTag("planDealBy").clearAndSetSemantics {
                        contentDescription = "By: $byText"
                        role = Role.Button
                    },
            ) {
                Text(text = "By", style = PantopusTextStyle.body, color = PantopusColors.appText, modifier = Modifier.weight(1f))
                Text(text = byText, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
                PantopusIconImage(
                    icon = PantopusIcon.ChevronRight,
                    contentDescription = null,
                    size = 16.dp,
                    tint = PantopusColors.appTextMuted,
                )
            }
        }
        DealFieldError(errors["group_size"])
        DealFieldError(errors["group_by"])
        PlanScopeLine(text = "Guests see the count and the time left, and can share the plan to get there.", icon = PantopusIcon.Info)
    }
    if (picking) {
        FutureDateTimePickerDialogs(
            initial = draft.groupBy,
            onPicked = { at ->
                picking = false
                onEdit { it.copy(groupBy = at) }
            },
            onDismiss = { picking = false },
        )
    }
}

/** "If it doesn't unlock": the plan still happens without the deal, or a smaller deal everyone gets anyway. */
@Composable
private fun DealIfShortField(
    draft: DealDraft,
    error: String?,
    onEdit: ((DealDraft) -> DealDraft) -> Unit,
) {
    PlanField(label = "If it doesn't unlock") {
        PlanFormCard(modifier = Modifier.selectableGroup()) {
            DealRadioRow(
                first = true,
                selected = !draft.smaller,
                title = "The plan still happens",
                caption = "Without the deal",
                tag = "planDealSmaller.none",
                onClick = { onEdit { it.copy(smaller = false) } },
            )
            DealRadioRow(
                first = false,
                selected = draft.smaller,
                title = "Give a smaller deal anyway",
                caption = "You choose it next",
                tag = "planDealSmaller.smaller",
                onClick = { onEdit { it.copy(smaller = true) } },
            )
        }
        if (!draft.smaller) DealFieldError(error)
    }
    if (draft.smaller) {
        DealWhatField(
            label = "The smaller deal",
            part = draft.fallback,
            kinds = smallerKinds(draft.main),
            smaller = true,
            errors = listOfNotNull(error?.let { "if_short" to it }).toMap(),
            onPart = { change -> onEdit { it.copy(fallback = change(it.fallback)) } },
        )
    }
}

/** "Guests will read": the server's sentence, its condition and what happens if it falls short, and how it's claimed. */
@Composable
private fun DealGuestsWillRead(preview: DealPreviewState) {
    val answer = preview.answer?.takeIf { it.ok }
    PlanWell(modifier = Modifier.testTag("planDealPreview")) {
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            PlanOverline("Guests will read")
            when {
                answer?.text != null -> {
                    Text(
                        text = answer.text,
                        style = PantopusTextStyle.body.copy(fontWeight = FontWeight.Bold),
                        color = PantopusColors.appText,
                    )
                    answer.conditionText?.let { Text(text = it, style = PantopusTextStyle.body, color = PantopusColors.appText) }
                    answer.ifShortText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
                    answer.claimText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
                }
                preview.failed != null ->
                    Text(text = preview.failed, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
                else ->
                    Text(
                        text = if (preview.loading) "Checking…" else "Fill in the deal to see what guests will read.",
                        style = PantopusTextStyle.small,
                        color = PantopusColors.appTextSecondary,
                    )
            }
        }
    }
}

/** A radio row in a form card (as "Who can see this"): the circle, a title and a caption. */
@Composable
private fun DealRadioRow(
    first: Boolean,
    selected: Boolean,
    title: String,
    caption: String?,
    tag: String,
    onClick: () -> Unit,
) {
    PlanOptionRow(
        first = first,
        modifier = Modifier.testTag(tag).selectable(selected = selected, role = Role.RadioButton, onClick = onClick),
    ) {
        PlanRadio(selected = selected)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            caption?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
    }
}

/** The server's sentence under the field it belongs to. */
@Composable
private fun DealFieldError(error: String?) {
    error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
}
