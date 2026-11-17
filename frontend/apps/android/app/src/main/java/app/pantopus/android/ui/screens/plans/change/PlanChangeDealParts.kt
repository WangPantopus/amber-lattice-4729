package app.pantopus.android.ui.screens.plans.change

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanSwitchRow
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.screens.plans.host.BusinessDealForm
import app.pantopus.android.ui.screens.plans.host.BusinessWhereField
import app.pantopus.android.ui.screens.plans.host.DealPlanLine
import app.pantopus.android.ui.screens.plans.host.TIPS_START_KINDS
import app.pantopus.android.ui.screens.plans.host.amountTyped
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the business track, B1: the deal on the change page (07-screens D3). The row opens D3's form
 * while nobody is in; after that it offers "Remove the deal" with its question ("Remove the deal? Everyone who is in is
 * told.").
 */

/**
 * A business's plan on the change page: one of its own locations (board B2), never a place picked here, and its deal
 * (business track B1: D3 while nobody is in, else "Remove the deal").
 */
@Composable
internal fun ColumnScope.ChangeBusinessFields(
    ui: PlanChangeUi,
    viewModel: PlanChangeViewModel,
) {
    ui.business?.takeIf { ui.canChangeLocation }?.let { business ->
        BusinessWhereField(business, ui.newLocationId ?: ui.currentLocationId, onPick = viewModel::pickLocation)
    }
    // Business track B2 and B5: what the server lets change (a price while nobody is in; the bill here at any time).
    ChangeMoneyRows(ui, viewModel)
    if (ui.showsDeal) ChangeDealRow(ui, viewModel)
}

/** "Price a spot" (while the business's switch is on) and "Guests can pay their bill here" with "Take tips". */
@Composable
private fun ColumnScope.ChangeMoneyRows(
    ui: PlanChangeUi,
    viewModel: PlanChangeViewModel,
) {
    val business = ui.business ?: return
    val money = ui.money
    if (business.can?.price == true && business.payoutsReady) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PlanSwitchRow(
                title = "Price a spot",
                caption = if (money.priceOn) "Guests pay when they join. Full refund until a day before." else null,
                checked = money.priceOn,
                onChecked = { on -> viewModel.editMoney { it.copy(priceOn = on) } },
                modifier = Modifier.testTag("planChangePrice"),
            )
            if (money.priceOn) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                    Box(modifier = Modifier.weight(1f)) {
                        PlanTextArea(
                            value = money.priceDollars,
                            onValue = { text -> viewModel.editMoney { it.copy(priceDollars = amountTyped(text, PRICE_MAX)) } },
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
    if (business.can?.payHere == true && business.payoutsReady) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            PlanSwitchRow(
                title = "Guests can pay their bill here",
                caption = null,
                checked = money.payHere,
                // Turned on here for the first time, "Take tips" starts as the form starts it (on for a watch party and a
                // walk or coffee).
                onChecked = { on ->
                    val start = ui.plan?.kind in TIPS_START_KINDS
                    viewModel.editMoney { it.copy(payHere = on, tipsOn = if (on && !it.originalPayHere) start else it.tipsOn) }
                },
                modifier = Modifier.testTag("planChangePayHere"),
            )
            if (money.payHere) {
                PlanSwitchRow(
                    title = "Take tips",
                    caption = null,
                    checked = money.tipsOn,
                    onChecked = { on -> viewModel.editMoney { it.copy(tipsOn = on) } },
                    modifier = Modifier.testTag("planChangeTips"),
                )
            }
        }
    }
}

private const val PRICE_MAX = 7

/** "Deal": the deal's sentence (or "No deal"), opening D3 while it can change, else "Remove the deal". */
@Composable
internal fun ColumnScope.ChangeDealRow(
    ui: PlanChangeUi,
    viewModel: PlanChangeViewModel,
) {
    var removing by remember { mutableStateOf(false) }
    val locked = ui.dealLocked
    val text = ui.dealRowText
    PlanField(label = "Deal") {
        PlanFormCard {
            PlanOptionRow(
                first = true,
                onClick = if (locked) null else viewModel::openDeal,
                modifier =
                    Modifier.testTag("planChangeDeal").clearAndSetSemantics {
                        contentDescription = "Deal: $text"
                        if (!locked) role = Role.Button
                    },
            ) {
                Text(
                    text = text,
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                if (!locked) {
                    PantopusIconImage(
                        icon = PantopusIcon.ChevronRight,
                        contentDescription = null,
                        size = 16.dp,
                        tint = PantopusColors.appTextMuted,
                    )
                }
            }
        }
        if (locked) {
            PlanScopeLine(text = "The deal can't change once someone is in.", icon = PantopusIcon.Info)
            if (ui.plan?.deal != null) {
                PlanTextButton(
                    title = "Remove the deal",
                    onClick = { removing = true },
                    danger = true,
                    enabled = !ui.deal.removing,
                    modifier = Modifier.testTag("planDealRemove"),
                )
            }
        }
    }
    if (removing) {
        AlertDialog(
            onDismissRequest = { removing = false },
            title = { Text("Remove the deal?") },
            text = { Text("Everyone who is in is told.") },
            confirmButton = {
                TextButton(onClick = {
                    removing = false
                    viewModel.removeDeal()
                }) { Text("Remove", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { removing = false }) { Text("Not now") } },
        )
    }
}

/** D3 over the change page: "A deal for this plan", Back keeps nothing, "Done" keeps the deal for Save. */
@Composable
internal fun ChangeDealForm(
    ui: PlanChangeUi,
    viewModel: PlanChangeViewModel,
) {
    val plan = ui.plan ?: return
    val business = ui.business ?: return
    BackHandler(onBack = viewModel::closeDeal)
    PlanPlainScaffold(
        onBack = viewModel::closeDeal,
        title = "A deal for this plan",
        modifier = Modifier.testTag("planDealStep"),
        footer = {
            ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            PrimaryButton(
                title = "Done",
                onClick = viewModel::dealDone,
                isLoading = ui.deal.checking,
                modifier = Modifier.height(50.dp),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s6)) {
            BusinessDealForm(
                draft = ui.deal.draft,
                spots = plan.spots,
                planLine =
                    DealPlanLine(
                        title = plan.title,
                        detail = "${PlanFormat.hostName(plan)} · ${PlanFormat.whenLine(plan)}",
                        avatarUrl = business.avatarUrl,
                    ),
                preview = ui.deal.preview,
                onEdit = viewModel::editDeal,
                priced = ui.priced,
                bill = ui.bill,
            )
        }
    }
}
