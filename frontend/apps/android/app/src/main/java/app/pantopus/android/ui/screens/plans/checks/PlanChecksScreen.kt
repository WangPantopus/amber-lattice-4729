package app.pantopus.android.ui.screens.plans.checks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.plans.PlanChecksDto
import app.pantopus.android.data.api.models.plans.PlanChecksRowDto
import app.pantopus.android.ui.components.ErrorState
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.sheetKeyboardRules
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanSegmented
import app.pantopus.android.ui.screens.plans.components.PlanStatusChip
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.screens.plans.host.amountTyped
import app.pantopus.android.ui.screens.plans.map.PlanRowsSkeleton
import app.pantopus.android.ui.screens.plans.map.planH3
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the business track, B5: C3, the business's guest list with money (07-screens C3, picture 14),
 * for staff with plans.manage. The three totals take the top, a filter, a row a guest ("Dana L.", "Pantopus" or "Yours",
 * and by state "Send a check", "Check sent · $52.00" / "Waiting", or "$38.40 · tip $8.64" / "Paid"), the server's note,
 * and "Send a check". Tapping a paid guest offers a refund, all or a part.
 */

@Composable
fun PlanChecksScreen(
    onBack: () -> Unit,
    viewModel: PlanChecksViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        viewModel.startPolling()
        onPauseOrDispose { viewModel.stopPolling() }
    }
    val list = ui.list
    PlanPlainScaffold(
        onBack = onBack,
        title = ui.plan?.title,
        modifier = Modifier.testTag("planChecks"),
        footer =
            list?.let {
                {
                    PrimaryButton(
                        title = "Send a check",
                        onClick = { viewModel.openSend(null) },
                        modifier = Modifier.height(50.dp).testTag("planSendCheck"),
                    )
                }
            },
    ) {
        when {
            list != null -> ChecksBody(ui, list, viewModel)
            ui.failed != null ->
                ErrorState(headline = "Couldn't load the guest list", message = ui.failed.orEmpty(), onRetry = viewModel::startPolling)
            else -> PlanRowsSkeleton(rows = 4)
        }
    }
    ui.sendingTo?.let { row -> SendCheckSheet(row, list?.dealOnBill == true, ui, viewModel) }
    ui.refunding?.let { row -> RefundSheet(row, ui, viewModel) }
    LaunchedEffect(ui.notice) { if (ui.notice != null) viewModel.noticeShown() }
}

@Composable
private fun ChecksBody(
    ui: PlanChecksUi,
    list: PlanChecksDto,
    viewModel: PlanChecksViewModel,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        listOf(list.totals.inText, list.totals.paidText, list.totals.tipsText).forEach { text ->
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 64.dp)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(PantopusColors.appSurfaceSunken)
                        .padding(Spacing.s3)
                        .semantics(mergeDescendants = true) {},
            ) {
                Text(
                    text = text.orEmpty(),
                    style = PantopusTextStyle.small.copy(fontWeight = FontWeight.Bold),
                    color = PantopusColors.appText,
                )
            }
        }
    }
    PlanSegmented(
        options = PlanChecksFilter.entries.map { it.wire to it.label },
        selected = ui.filter.wire,
        onSelect = { wire -> PlanChecksFilter.entries.firstOrNull { it.wire == wire }?.let(viewModel::setFilter) },
        modifier = Modifier.testTag("planChecksFilter"),
        optionTags = PlanChecksFilter.entries.map { "planChecksFilter.${it.wire}" },
    )
    if (ui.rows.isNotEmpty()) {
        Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = Spacing.s4)) {
            ui.rows.forEachIndexed { index, row ->
                if (index > 0) PlanDivider()
                CheckRow(row, onSend = { viewModel.openSend(row) }, onRefund = { viewModel.openRefund(row) })
            }
        }
    } else {
        Text(text = "Nobody here yet.", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
    }
    list.noteText?.let { PlanScopeLine(text = it, icon = PantopusIcon.Info) }
}

/** A guest: name, who brought them, and by state "Send a check", "Check sent · $52.00" + "Waiting", or paid. */
@Composable
private fun CheckRow(
    row: PlanChecksRowDto,
    onSend: () -> Unit,
    onRefund: () -> Unit,
) {
    val name = row.name ?: "Guest"
    val paid = row.state == STATE_PAID
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .then(if (paid) Modifier.clickable(role = Role.Button, onClickLabel = "Refund", onClick = onRefund) else Modifier)
                .padding(vertical = Spacing.s3)
                .testTag("planChecksRow.${row.requestId}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanAvatar(name = name, seed = row.requestId, avatarUrl = null)
        Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Text(text = name, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
                row.broughtByText?.let { PlanStatusChip(text = it) }
            }
            row.check?.text?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
        when (row.state) {
            STATE_NONE -> RowSendButton(onClick = onSend)
            STATE_PAID ->
                PlanStatusChip(text = row.check?.stateText ?: "Paid", icon = PantopusIcon.Check, iconTint = PantopusColors.success)
            else -> row.check?.stateText?.let { PlanStatusChip(text = it) }
        }
    }
}

/** The row's own "Send a check" (outlined, as picture 14 draws it). */
@Composable
private fun RowSendButton(onClick: () -> Unit) {
    val shape = RoundedCornerShape(Radii.lg)
    Box(
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(shape)
                .border(1.dp, PantopusColors.primary600, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s3)
                .testTag("planSendCheckRow"),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Send a check",
            style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.primary700,
            maxLines = 1,
        )
    }
}

/** "Send a check": the guest's name, "Amount on the bill" and, with a deal on the bill, the part it doesn't cover. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SendCheckSheet(
    row: PlanChecksRowDto,
    dealOnBill: Boolean,
    ui: PlanChecksUi,
    viewModel: PlanChecksViewModel,
) {
    var amount by remember { mutableStateOf("") }
    var noDeal by remember { mutableStateOf("") }
    ModalBottomSheet(
        onDismissRequest = viewModel::closeSend,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.sheetKeyboardRules().testTag("planSendCheckSheet"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.s4)
                    .padding(bottom = Spacing.s6)
                    .navigationBarsPadding()
                    .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s4),
        ) {
            Text(text = "Send a check", style = planH3, color = PantopusColors.appText)
            Text(
                text = row.name ?: "Guest",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            DollarsField(label = "Amount on the bill", value = amount, tag = "planCheckAmount", onValue = { amount = it })
            if (dealOnBill) {
                DollarsField(
                    label = "Part the deal doesn't cover (alcohol)",
                    value = noDeal,
                    tag = "planCheckNoDeal",
                    onValue = { noDeal = it },
                )
            }
            ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            PrimaryButton(
                title = "Send",
                onClick = { viewModel.send(amount, noDeal) },
                isLoading = ui.busy,
                isEnabled = amount.isNotBlank() && !ui.busy,
                modifier = Modifier.height(50.dp).testTag("planCheckSend"),
            )
        }
    }
}

/** A paid guest: the payment's line and "Refund", all of it or a part. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RefundSheet(
    row: PlanChecksRowDto,
    ui: PlanChecksUi,
    viewModel: PlanChecksViewModel,
) {
    var part by remember { mutableStateOf(false) }
    var dollars by remember { mutableStateOf("") }
    ModalBottomSheet(
        onDismissRequest = viewModel::closeRefund,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.sheetKeyboardRules().testTag("planCheckRefund"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.s4)
                    .padding(bottom = Spacing.s6)
                    .navigationBarsPadding()
                    .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            Text(text = row.name ?: "Guest", style = planH3, color = PantopusColors.appText)
            row.check?.text?.let { Text(text = it, style = PantopusTextStyle.body, color = PantopusColors.appText) }
            if (part) {
                DollarsField(label = "Refund a part", value = dollars, tag = "planCheckRefundAmount", onValue = { dollars = it })
            }
            ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            if (part) {
                PrimaryButton(
                    title = "Refund",
                    onClick = { viewModel.refund(dollars) },
                    isLoading = ui.busy,
                    isEnabled = dollars.isNotBlank() && !ui.busy,
                    modifier = Modifier.height(50.dp),
                )
            } else {
                PrimaryButton(
                    title = "Refund all",
                    onClick = { viewModel.refund(null) },
                    isLoading = ui.busy,
                    isEnabled = !ui.busy,
                    modifier = Modifier.height(50.dp).testTag("planCheckRefundAll"),
                )
                PlanTextButton(title = "Refund a part", onClick = { part = true })
            }
        }
    }
}

@Composable
private fun DollarsField(
    label: String,
    value: String,
    tag: String,
    onValue: (String) -> Unit,
) {
    PlanField(label = label, modifier = Modifier.testTag(tag)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
            PlanTextArea(
                value = value,
                onValue = { onValue(amountTyped(it, DOLLARS_MAX)) },
                placeholder = "0.00",
                label = label,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
        }
    }
}

private const val DOLLARS_MAX = 8
