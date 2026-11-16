package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.payments.PaymentIntentSheetParamsDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanTipLaterDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanChecksRepository
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.checks.AmountDialog
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.host.centsOf
import app.pantopus.android.ui.screens.plans.host.previewPriceText
import app.pantopus.android.ui.screens.settings.payments.CheckoutOutcome
import app.pantopus.android.ui.screens.settings.payments.StripePaymentSheets
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import com.stripe.android.paymentsheet.rememberPaymentSheet
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * Plans for the holidays, the business track, B6: C4, a tip after a paid plan (07-screens C4; no board). On the page of a
 * paid plan that is over, for a guest who paid, for 7 days and once: "Leave a tip for {business}?" with the server's three
 * choices (percents of what they paid), "Another amount", and the pay button into the shipped payment sheet. The card
 * shows only while the server sends `tip_later`; the server's "You tipped $5.00" replaces it once paid.
 */

/** C4's state: the chosen tip in cents, paying, the server's words once paid. */
data class PlanTipUi(
    val tipCents: Int? = null,
    /** Which of the server's choices is picked; null for "Another amount". */
    val choice: Int? = null,
    val paying: Boolean = false,
    val error: String? = null,
    /** "You tipped $5.00". */
    val done: String? = null,
)

/** C4's view-model: `POST …/tip { amount_cents }` → the shipped sheet → `POST …/tip/confirm`. */
@HiltViewModel
class PlanTipViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlanChecksRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanTipUi())
        val ui: StateFlow<PlanTipUi> = _ui.asStateFlow()
        private val _checkout = MutableSharedFlow<PaymentIntentSheetParamsDto>(extraBufferCapacity = 1)
        val checkout: SharedFlow<PaymentIntentSheetParamsDto> = _checkout.asSharedFlow()

        fun choose(
            index: Int,
            cents: Int,
        ) = _ui.update { it.copy(choice = index, tipCents = cents, error = null) }

        fun chooseOther(dollars: String) {
            val cents = centsOf(dollars)
            if (cents == null || cents <= 0) {
                _ui.update { it.copy(error = "Type the tip in dollars.") }
                return
            }
            _ui.update { it.copy(choice = null, tipCents = cents, error = null) }
        }

        fun pay() {
            val cents = _ui.value.tipCents ?: return
            if (_ui.value.paying) return
            _ui.update { it.copy(paying = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.tipLater(planId, cents)) {
                    is NetworkResult.Success -> {
                        val payment = result.data.payment
                        if (payment?.clientSecret == null) {
                            _ui.update { it.copy(paying = false, error = "This tip can't be paid right now.") }
                            return@launch
                        }
                        _checkout.tryEmit(
                            PaymentIntentSheetParamsDto(
                                clientSecret = payment.clientSecret,
                                paymentIntentId = payment.paymentId,
                                customer = payment.customerId,
                                ephemeralKey = payment.ephemeralKey,
                                publishableKey = payment.publishableKey,
                            ),
                        )
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(paying = false, error = result.error.planMessage) }
                }
            }
        }

        fun onCheckoutOutcome(outcome: CheckoutOutcome) {
            when (outcome) {
                CheckoutOutcome.Paid ->
                    viewModelScope.launch {
                        when (val result = repository.confirmTip(planId)) {
                            is NetworkResult.Success -> _ui.update { it.copy(paying = false, done = result.data.text) }
                            is NetworkResult.Failure -> _ui.update { it.copy(paying = false, error = result.error.planMessage) }
                        }
                    }
                CheckoutOutcome.Canceled -> _ui.update { it.copy(paying = false) }
                is CheckoutOutcome.Declined -> _ui.update { it.copy(paying = false, error = outcome.message ?: "Your card was declined.") }
            }
        }
    }

/** C4 on an ended paid plan, with the shipped payment sheet behind its button. */
@Composable
internal fun PlanTipLaterHost(
    plan: PlanDto,
    tipLater: PlanTipLaterDto,
    viewModel: PlanTipViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val sheet = rememberPaymentSheet { result -> viewModel.onCheckoutOutcome(StripePaymentSheets.checkoutOutcome(result)) }
    LaunchedEffect(Unit) {
        viewModel.checkout.collect { params ->
            sheet.presentWithPaymentIntent(
                paymentIntentClientSecret = params.clientSecret.orEmpty(),
                configuration =
                    StripePaymentSheets.paymentConfiguration(
                        context = context,
                        customerId = params.customer,
                        ephemeralKey = params.ephemeralKey,
                        publishableKey = params.publishableKey,
                    ),
            )
        }
    }
    PlanTipLaterCard(plan, tipLater, ui, viewModel)
}

@Composable
private fun PlanTipLaterCard(
    plan: PlanDto,
    tipLater: PlanTipLaterDto,
    ui: PlanTipUi,
    viewModel: PlanTipViewModel,
) {
    var other by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(Spacing.s4).testTag("planTipAfter"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        val done = ui.done
        if (done != null) {
            Text(text = done, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            return@Column
        }
        Text(
            text = "Leave a tip for ${PlanFormat.hostName(plan)}?",
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            tipLater.choices.forEachIndexed { index, choice ->
                TipLaterTile(
                    title = choice.label.orEmpty(),
                    caption = choice.tipText,
                    chosen = ui.choice == index,
                    modifier = Modifier.weight(1f).testTag("planTipAfter.$index"),
                    onClick = { viewModel.choose(index, choice.tipCents) },
                )
            }
        }
        TipLaterTile(
            title = "Another amount",
            caption = ui.tipCents?.takeIf { ui.choice == null }?.let(::previewPriceText),
            chosen = ui.choice == null && ui.tipCents != null,
            modifier = Modifier.fillMaxWidth().testTag("planTipAfter.other"),
            onClick = { other = true },
        )
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
        PrimaryButton(
            title = ui.tipCents?.let { "Tip ${previewPriceText(it)}" } ?: "Tip",
            onClick = viewModel::pay,
            isLoading = ui.paying,
            isEnabled = ui.tipCents != null && !ui.paying,
            modifier = Modifier.height(50.dp).testTag("planTipAfterPay"),
        )
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
private fun TipLaterTile(
    title: String,
    caption: String?,
    chosen: Boolean,
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
