package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanQuoteDto
import app.pantopus.android.data.api.models.plans.PlanQuoteGroupDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanRequestStatus
import app.pantopus.android.data.plans.PlanViewerStanding
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.data.plans.standing
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanChoice
import app.pantopus.android.ui.screens.plans.components.PlanChoiceGroup
import app.pantopus.android.ui.screens.plans.components.PlanDealTag
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.PlanTile
import app.pantopus.android.ui.screens.plans.map.planH3
import app.pantopus.android.ui.screens.settings.payments.StripePaymentSheets
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import com.stripe.android.paymentsheet.rememberPaymentSheet

/*
 * Plans for the holidays, the business track, B2 and B4: P1, paying for a spot (07-screens P1, picture 11), and "Paid"
 * with the receipt on the plan afterwards. Every amount and line is the server's: the quote's `spots_text`, `each_text`,
 * `total_text`, `group.text` and `refund_text`, and the card's `paid.text`. On Android one "Pay {amount}" button opens
 * the shipped payment sheet, which holds Google Pay and the card.
 */

/** Joining this plan takes a payment (a business's priced plan with room): "Join" opens P1, not the request sheet. */
internal val PlanDto.paysToJoin: Boolean
    get() =
        business != null && price?.cents != null && !isFull &&
            standing != PlanViewerStanding.IN && standing != PlanViewerStanding.HOSTING

/** A paid spot's 10-minute hold ran out (business track B2): the person may join again (a new hold, a new payment). */
internal val PlanDto.holdRanOut: Boolean
    get() = myRequest?.status == PlanRequestStatus.EXPIRED.wire && price?.cents != null && viewer?.canAsk == true

/** P1 over the plan, with the shipped payment sheet behind its button; [onDone] when the guest is in (or can't be). */
@Composable
internal fun PlanPayHost(
    plan: PlanDto,
    onClose: () -> Unit,
    onDone: (reveal: Boolean, notice: String?) -> Unit,
    viewModel: PlanPayViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val paymentSheet = rememberPaymentSheet { result -> viewModel.onCheckoutOutcome(StripePaymentSheets.checkoutOutcome(result)) }
    LaunchedEffect(plan.id) { viewModel.start(plan) }
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is PlanPayEvent.PresentCheckout ->
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
                is PlanPayEvent.Done -> onDone(event.reveal, event.notice)
            }
        }
    }
    PlanPaySheet(plan, ui, onParty = viewModel::setParty, onPay = { viewModel.pay(plan) }, onClose = onClose)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlanPaySheet(
    plan: PlanDto,
    ui: PlanPayUi,
    onParty: (Int) -> Unit,
    onPay: () -> Unit,
    onClose: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = { if (!ui.paying) onClose() },
        sheetState = sheet,
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.testTag("planPaySheet"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.s4)
                    .padding(bottom = Spacing.s6)
                    .navigationBarsPadding()
                    .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s4),
        ) {
            PayHeader(plan)
            PayPartyField(plan, ui.partySize, enabled = !ui.paying, onParty = onParty)
            val quote = ui.quote
            if (quote != null) {
                PayLines(plan, quote)
                quote.group?.let { PayGroupCard(it) }
                quote.refundText?.let { PlanScopeLine(text = it, icon = PantopusIcon.ShieldCheck) }
            } else {
                Text(
                    text = ui.quoteError ?: "Checking the price…",
                    style = PantopusTextStyle.small,
                    color = if (ui.quoteError != null) PantopusColors.error else PantopusColors.appTextSecondary,
                )
            }
            ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            PrimaryButton(
                title = quote?.totalText?.let { "Pay $it" } ?: "Pay",
                onClick = onPay,
                isLoading = ui.paying,
                isEnabled = quote != null && !ui.quoteLoading && !ui.paying,
                modifier = Modifier.height(50.dp).testTag("planPayButton"),
            )
        }
    }
}

/** The kind's tile and the title; the time and the place in one line. */
@Composable
private fun PayHeader(plan: PlanDto) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        plan.planKind?.let { PlanTile(it) }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = plan.title,
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = listOfNotNull(PlanFormat.rowWhen(plan), PlanFormat.hostName(plan)).joinToString(" · "),
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
            )
        }
    }
}

/** The shipped party choice ("Just me", "Me + 1", …); each change asks the server for a new quote. */
@Composable
private fun PayPartyField(
    plan: PlanDto,
    partySize: Int,
    enabled: Boolean,
    onParty: (Int) -> Unit,
) {
    val room = plan.spotsLeft.coerceAtLeast(1)
    val choices =
        (1..MAX_PAY_PARTY).map { size ->
            PlanChoice(id = size.toString(), label = if (size == 1) "Just me" else "Me + ${size - 1}", enabled = enabled && size <= room)
        }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        PlanOverline("Who's coming")
        PlanChoiceGroup(
            choices = choices,
            isSelected = { it.id == partySize.toString() },
            onSelect = { choice -> onParty(choice.id.toInt()) },
            tagPrefix = "planPayParty",
        )
    }
}

/** "{1 spot}" and the price (struck price beside a deal's), then "You pay today" and the total, from the quote. */
@Composable
private fun PayLines(
    plan: PlanDto,
    quote: PlanQuoteDto,
) {
    Column(modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = quote.spotsText.orEmpty(),
                style = PantopusTextStyle.body,
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f),
            )
            plan.price?.wasText?.let { was ->
                Text(
                    text = was,
                    style = PantopusTextStyle.body.copy(textDecoration = TextDecoration.LineThrough),
                    color = PantopusColors.appTextSecondary,
                    modifier = Modifier.padding(end = Spacing.s2),
                )
            }
            Text(text = quote.eachText.orEmpty(), style = PantopusTextStyle.body, color = PantopusColors.appText)
        }
        PlanDivider()
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "You pay today",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f),
            )
            Text(text = quote.totalText.orEmpty(), style = planH3.copy(fontWeight = FontWeight.Bold), color = PantopusColors.appText)
        }
    }
}

/** P1's group price card (B4): "Group price", "{7} of {10} in", the server's sentence and a bar. */
@Composable
private fun PayGroupCard(group: PlanQuoteGroupDto) {
    val unlocked = group.state == "unlocked"
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.xl))
                .background(PantopusColors.appSurfaceSunken)
                .padding(Spacing.s3)
                .testTag("planPayGroup")
                .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlanDealTag(text = "Group price")
            Spacer(modifier = Modifier.weight(1f))
            if (!unlocked && group.size > 0) {
                Text(text = "${group.isIn} of ${group.size} in", style = PantopusTextStyle.small, color = PantopusColors.appTextStrong)
            }
        }
        group.text?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appText) }
        if (!unlocked && group.size > 0) {
            val fraction = group.isIn.coerceIn(0, group.size).toFloat() / group.size
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(PantopusColors.appBorder)
                        .clearAndSetSemantics {},
            ) {
                if (fraction > 0f) {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth(fraction)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(Radii.pill))
                                .background(PantopusColors.primary600),
                    )
                }
            }
        }
    }
}

/** After paying (P1 → D2): "Paid $18.00" under the title, with "Receipt" (the receipt in Mail, under Receipts). */
@Composable
internal fun PlanPaidRow(plan: PlanDto) {
    val paid = plan.paid ?: return
    val receipt = paid.receipt?.link?.takeIf(DeepLinkRouter::canRoute)
    Row(
        modifier = Modifier.fillMaxWidth().testTag("planPaid"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            text = paid.text.orEmpty(),
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
            modifier = Modifier.weight(1f),
        )
        if (receipt != null) {
            PlanTextButton(
                title = "Receipt",
                onClick = { DeepLinkRouter.handle(receipt) },
                modifier = Modifier.fillMaxWidth(RECEIPT_WIDTH).testTag("planReceipt"),
            )
        }
    }
}

private const val MAX_PAY_PARTY = 4
private const val RECEIPT_WIDTH = 0.35f
