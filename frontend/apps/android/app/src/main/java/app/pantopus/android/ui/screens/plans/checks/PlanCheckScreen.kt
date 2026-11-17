package app.pantopus.android.ui.screens.plans.checks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.plans.PlanCheckDto
import app.pantopus.android.data.api.models.plans.PlanCheckLineDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.closesKeyboardOnTapOrScroll
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.screens.plans.host.amountTyped
import app.pantopus.android.ui.screens.plans.map.PlanRowsSkeleton
import app.pantopus.android.ui.screens.settings.payments.StripePaymentSheets
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import com.stripe.android.paymentsheet.rememberPaymentSheet

/*
 * Plans for the holidays, the business track, B5: C1, the check (picture 12), and C2, paid (picture 13). Opened by "Pay at
 * {business}" on the plan and by the check's notice. Every line, tip and total is the server's; on Android one "Pay
 * {amount}" button opens the shipped payment sheet (Google Pay and the card are inside it).
 */

/** C1 / C2. [onMessageBusiness] opens the shipped conversation with the business ("Something's wrong with this payment"). */
@Composable
fun PlanCheckScreen(
    onBack: () -> Unit,
    onMessageBusiness: ((businessUserId: String, name: String) -> Unit)? = null,
    viewModel: PlanCheckViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val paymentSheet = rememberPaymentSheet { result -> viewModel.onCheckoutOutcome(StripePaymentSheets.checkoutOutcome(result)) }
    LifecycleResumeEffect(Unit) {
        viewModel.load()
        onPauseOrDispose {}
    }
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is PlanCheckEvent.PresentCheckout ->
                    paymentSheet.presentWithPaymentIntent(
                        paymentIntentClientSecret = event.params.clientSecret.orEmpty(),
                        configuration =
                            StripePaymentSheets.paymentConfiguration(
                                context = context,
                                customerId = event.params.customer,
                                ephemeralKey = event.params.ephemeralKey,
                                publishableKey = event.params.publishableKey,
                            ),
                    )
            }
        }
    }
    val business = ui.plan?.business
    val businessName = business?.name ?: ui.plan?.let(PlanFormat::hostName).orEmpty()
    val check = ui.check
    when {
        ui.loading -> PlanPlainScaffold(onBack = onBack, title = "Pay $businessName".trim()) { PlanRowsSkeleton(rows = 3) }
        check != null && check.state != OPEN ->
            CheckPaid(
                check = check,
                businessName = businessName,
                onDone = onBack,
                onWrong = business?.userId?.let { id -> onMessageBusiness?.let { open -> { open(id, businessName) } } },
            )
        else ->
            PlanPlainScaffold(
                onBack = onBack,
                title = "Pay $businessName".trim(),
                modifier = Modifier.testTag("planCheck"),
                footer = { CheckFooter(ui, check, viewModel::pay) },
            ) {
                when {
                    ui.failed != null ->
                        Text(text = ui.failed.orEmpty(), style = PantopusTextStyle.body, color = PantopusColors.appTextSecondary)
                    check != null -> CheckOpen(check, ui, viewModel)
                    ui.canStart -> CheckStart(ui, onStart = viewModel::start)
                    // A deal on the bill: the check comes from the staff (the server's rule, K7).
                    else ->
                        Text(
                            text = "Ask your server for the check: the deal comes off when they send it.",
                            style = PantopusTextStyle.body,
                            color = PantopusColors.appTextSecondary,
                        )
                }
            }
    }
}

@Composable
private fun CheckFooter(
    ui: PlanCheckUi,
    check: PlanCheckDto?,
    onPay: () -> Unit,
) {
    if (check == null) return
    ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
    // None chosen at the start: the pay button waits for a tip choice (No tip counts).
    val needsTip = check.tipsOn && ui.tip == PlanTip.Unchosen
    PrimaryButton(
        title = check.totalText?.takeIf { !needsTip }?.let { "Pay $it" } ?: "Pay",
        onClick = onPay,
        isLoading = ui.paying,
        isEnabled = !needsTip && !ui.quoting && !ui.paying,
        modifier = Modifier.height(50.dp).testTag("planCheckPay"),
    )
}

/** C1: the heading and amount, the server's lines, the tip choices and the quiet line. */
@Composable
private fun ColumnScope.CheckOpen(
    check: PlanCheckDto,
    ui: PlanCheckUi,
    viewModel: PlanCheckViewModel,
) {
    Column(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        check.heading?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        Text(
            text = check.amountText.orEmpty(),
            style = PantopusTextStyle.h1.copy(fontSize = BIG_AMOUNT, lineHeight = BIG_AMOUNT),
            color = PantopusColors.appText,
        )
    }
    CheckLines(check.lines)
    if (check.tipsOn) CheckTips(check, ui, viewModel)
    check.noteText?.let { PlanScopeLine(text = it, icon = PantopusIcon.Info) }
}

/** The lines card: "Food and drinks", the deal in the ok color, "Tip, 18%", and the last line in bold. */
@Composable
internal fun CheckLines(
    lines: List<PlanCheckLineDto>,
    lastLabel: String? = null,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.xl))
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(Radii.xl))
                .padding(horizontal = Spacing.s4)
                .testTag("planCheckLines"),
    ) {
        lines.forEachIndexed { index, line ->
            if (index > 0) PlanDivider()
            val total = line.key == TOTAL
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .padding(vertical = Spacing.s3)
                        .semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = (if (total) lastLabel else null) ?: line.label.orEmpty(),
                    style = PantopusTextStyle.body.copy(fontWeight = if (total) FontWeight.Bold else FontWeight.Normal),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = line.text.orEmpty(),
                    style = PantopusTextStyle.body.copy(fontWeight = if (total || line.tone == OK) FontWeight.Bold else FontWeight.Normal),
                    color = if (line.tone == OK) PantopusColors.success else PantopusColors.appText,
                )
            }
        }
    }
}

/** "Add a tip": "Percent of $48.00, before the deal", the server's three choices, "Another amount" and "No tip". */
@Composable
private fun CheckTips(
    check: PlanCheckDto,
    ui: PlanCheckUi,
    viewModel: PlanCheckViewModel,
) {
    var other by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlanOverline("Add a tip", modifier = Modifier.weight(1f))
            check.tipBaseText?.let { Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            check.tipChoices.orEmpty().forEachIndexed { index, choice ->
                val chosen = (ui.tip as? PlanTip.Percent)?.index == index
                TipTile(
                    title = choice.label.orEmpty(),
                    caption = choice.tipText,
                    chosen = chosen,
                    tag = "planCheckTip.$index",
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.chooseTip(PlanTip.Percent(index, choice.tipCents)) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            TipTile(
                title = "Another amount",
                caption = null,
                chosen = ui.tip is PlanTip.Other,
                tag = "planCheckTip.other",
                modifier = Modifier.weight(1f),
                onClick = { other = true },
            )
            TipTile(
                title = "No tip",
                caption = null,
                chosen = ui.tip == PlanTip.NoTip,
                tag = "planCheckTip.none",
                modifier = Modifier.weight(1f),
                onClick = { viewModel.chooseTip(PlanTip.NoTip) },
            )
        }
    }
    if (other) {
        AmountDialog(
            title = "Another amount",
            label = "Tip in dollars",
            onDone = { dollars ->
                other = false
                viewModel.chooseOther(dollars)
            },
            onDismiss = { other = false },
        )
    }
}

@Composable
private fun TipTile(
    title: String,
    caption: String?,
    chosen: Boolean,
    tag: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            modifier
                .heightIn(min = 52.dp)
                .clip(shape)
                .background(if (chosen) PantopusColors.primary50 else PantopusColors.appSurface)
                .border(if (chosen) 2.dp else 1.dp, if (chosen) PantopusColors.primary600 else PantopusColors.appBorderStrong, shape)
                .clickable(role = Role.RadioButton, onClick = onClick)
                .padding(vertical = Spacing.s2, horizontal = Spacing.s1)
                .testTag(tag)
                .clearAndSetSemantics {
                    contentDescription = listOfNotNull(title, caption).joinToString(", ")
                    role = Role.RadioButton
                    selected = chosen
                },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = if (chosen) PantopusColors.primary700 else PantopusColors.appText,
            textAlign = TextAlign.Center,
        )
        caption?.let { Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary) }
    }
}

/** A guest-started check (no deal on the bill): "What's your total?" and "Type the total on your bill". */
@Composable
private fun ColumnScope.CheckStart(
    ui: PlanCheckUi,
    onStart: (String) -> Unit,
) {
    var dollars by remember { mutableStateOf("") }
    Text(text = "What's your total?", style = PantopusTextStyle.h3, color = PantopusColors.appText)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
        Box(modifier = Modifier.weight(1f).testTag("planCheckTotal")) {
            PlanTextArea(
                value = dollars,
                onValue = { dollars = amountTyped(it, AMOUNT_MAX) },
                placeholder = "48.00",
                label = "What's your total?",
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
        }
    }
    Text(text = "Type the total on your bill", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
    ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
    PrimaryButton(
        title = "Next",
        onClick = { onStart(dollars) },
        isLoading = ui.quoting,
        isEnabled = dollars.isNotBlank() && !ui.quoting,
        modifier = Modifier.height(50.dp),
    )
}

/** C2: the check mark, "Paid $47.04", the business, who and when, the lines as paid, the receipt line, Done. */
@Composable
private fun CheckPaid(
    check: PlanCheckDto,
    businessName: String,
    onDone: () -> Unit,
    onWrong: (() -> Unit)?,
) {
    PlanPlainScaffold(
        onBack = onDone,
        modifier = Modifier.testTag("planCheckPaid"),
        footer = {
            GhostButton(title = "Done", onClick = onDone, modifier = Modifier.height(50.dp))
            if (onWrong != null) PlanTextButton(title = "Something's wrong with this payment", onClick = onWrong)
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            Box(
                modifier = Modifier.size(88.dp).clip(CircleShape).background(PantopusColors.success),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 40.dp, tint = PantopusColors.appTextInverse)
            }
            Text(
                text = check.paidTotalText.orEmpty(),
                style = PantopusTextStyle.h1.copy(fontSize = BIG_AMOUNT, lineHeight = BIG_AMOUNT),
                color = PantopusColors.appText,
            )
            Text(text = businessName, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            Text(
                text = listOfNotNull(check.payer, check.paidText).joinToString(" · "),
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
            )
            ShowYourServer()
            check.refundedText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextStrong) }
        }
        CheckLines(check.lines, lastLabel = check.methodText?.let { "Paid with $it" })
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s3), verticalAlignment = Alignment.Top) {
            PantopusIconImage(icon = PantopusIcon.Mail, contentDescription = null, size = 20.dp, tint = PantopusColors.appTextStrong)
            Text(
                text = "The receipt is in Mail, under Receipts. $businessName sees the payment on its guest list now.",
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.weight(1f),
            )
        }
        check.receipt?.link?.takeIf(DeepLinkRouter::canRoute)?.let { link ->
            PlanTextButton(
                title = "Open the receipt",
                onClick = { DeepLinkRouter.handle(link) },
                modifier = Modifier.testTag("planReceipt"),
            )
        }
    }
}

@Composable
private fun ShowYourServer() {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.appSurfaceSunken)
                .padding(horizontal = Spacing.s3, vertical = Spacing.s1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        PantopusIconImage(icon = PantopusIcon.Clock, contentDescription = null, size = 14.dp, tint = PantopusColors.appTextSecondary)
        Text(text = "Show this to your server", style = PantopusTextStyle.caption, color = PantopusColors.appTextStrong)
    }
}

/** An amount in dollars in a dialog ("Another amount", a part of a refund). */
@Composable
internal fun AmountDialog(
    title: String,
    label: String,
    onDone: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var dollars by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.closesKeyboardOnTapOrScroll(),
        title = { Text(title) },
        text = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Text(text = "$", style = PantopusTextStyle.body, color = PantopusColors.appText)
                PlanTextArea(
                    value = dollars,
                    onValue = { dollars = amountTyped(it, AMOUNT_MAX) },
                    placeholder = "8.00",
                    label = label,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onDone(dollars) }, enabled = dollars.isNotBlank()) { Text("Done") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private const val OPEN = "open"
private const val TOTAL = "total"
private const val OK = "ok"
private const val AMOUNT_MAX = 8
private val BIG_AMOUNT = 40.sp
