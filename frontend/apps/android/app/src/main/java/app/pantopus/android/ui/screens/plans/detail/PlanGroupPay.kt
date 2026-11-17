package app.pantopus.android.ui.screens.plans.detail

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGroupPayDto
import app.pantopus.android.data.api.models.plans.PlanGroupPayGiveBackDto
import app.pantopus.android.data.api.models.plans.PlanSpotDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.components.LARGE_TEXT_SCALE
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * The holidays' one person pays for the group on the plan's page (08-extras section 7, board 31; a business's paid
 * plan, `plans_group_pay`). The buyer sees "Your {11} spots" with "{4} taken", "Copy link" and "Share", and "Give back
 * {n} spots" (asks first, with the server's sentence); a claimer sees "{Chris} got you a spot". Someone who opens the
 * link (`/plan-link/:id?spot=`) sees "{Chris} got you a spot" with "I'm in", which puts them in, free to them. Every
 * amount is the server's; buying is the payment sheet's "I'll send a link".
 */

/** The spot link the page was opened with, what it offers, and where claiming or giving back stands. */
data class PlanGroupPayUi(
    val offer: PlanSpotDto? = null,
    /** The card after giving spots back, until the plan is read again. */
    val card: PlanGroupPayDto? = null,
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class PlanGroupPayViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlanExtrasRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()

        /** `?spot=` from the link someone sent; claimed only on "I'm in". */
        private val token: String? = savedStateHandle.get<String>(PlansRoutes.SPOT_KEY)?.takeIf(String::isNotBlank)
        private val _ui = MutableStateFlow(PlanGroupPayUi())
        val ui: StateFlow<PlanGroupPayUi> = _ui.asStateFlow()
        private var offerRead = false

        /** Reads what the link offers, once, for someone not in yet. */
        fun readOffer() {
            val spot = token ?: return
            if (offerRead) return
            offerRead = true
            viewModelScope.launch {
                when (val result = repository.spot(planId, spot)) {
                    is NetworkResult.Success -> _ui.update { it.copy(offer = result.data.spot) }
                    is NetworkResult.Failure -> _ui.update { it.copy(error = result.error.planMessage) }
                }
            }
        }

        /** "I'm in": in, free to the reader; [then] reads the plan again. */
        fun claim(then: () -> Unit) {
            val spot = token ?: return
            run({ repository.claimSpot(planId, spot) }) {
                _ui.update { it.copy(offer = null) }
                then()
            }
        }

        /** "Give back {n} spots": the spots nobody took go back to the buyer's card and the link stops. */
        fun giveBack(then: () -> Unit) {
            run({ repository.giveBackSpots(planId) }) { plan ->
                _ui.update { it.copy(card = plan.groupPay) }
                then()
            }
        }

        fun reset() {
            _ui.update { it.copy(card = null) }
        }

        private fun run(
            work: suspend () -> NetworkResult<PlanDto>,
            done: (PlanDto) -> Unit,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, error = null) }
            viewModelScope.launch {
                when (val result = work()) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(busy = false) }
                        done(result.data)
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, error = result.error.planMessage) }
                }
            }
        }
    }

/** The buyer's or the claimer's card, while the plan carries `group_pay`. [onChanged] reads the plan again. */
@Composable
internal fun PlanGroupPayIfAny(
    plan: PlanDto,
    onChanged: () -> Unit,
    vm: PlanGroupPayViewModel = hiltViewModel(key = "planGroupPay-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.groupPay) { vm.reset() }
    val card = ui.card ?: plan.groupPay ?: return
    if (card.isBuyer) {
        BuyerCard(card, ui, onGiveBack = { vm.giveBack(onChanged) })
    } else {
        card.text?.let { text ->
            Row(
                modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planGroupPayClaimer"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                GroupPayTile(PantopusIcon.Gift)
                Text(text = text, style = SEMIBOLD, color = PantopusColors.appText, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** "Your 11 spots" / "4 taken", "Copy link" and "Share" while the link is live, the note, and "Give back {n} spots". */
@Composable
private fun BuyerCard(
    card: PlanGroupPayDto,
    ui: PlanGroupPayUi,
    onGiveBack: () -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var asks by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planGroupPayBuyer"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            GroupPayTile(PantopusIcon.Users)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = card.text.orEmpty(), style = SEMIBOLD, color = PantopusColors.appText)
                card.takenText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
            }
        }
        val url = card.url?.takeIf { card.open }
        if (url != null) {
            val copy: @Composable (Modifier) -> Unit = { modifier ->
                GhostButton(
                    title = if (copied) "Copied" else "Copy link",
                    onClick = {
                        clipboard.setText(AnnotatedString(url))
                        copied = true
                    },
                    modifier = modifier.testTag("planGroupPayCopy"),
                )
            }
            val share: @Composable (Modifier) -> Unit = { modifier ->
                PrimaryButton(
                    title = "Share",
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                        runCatching { context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    },
                    modifier = modifier.testTag("planGroupPayShare"),
                )
            }
            if (LocalDensity.current.fontScale >= LARGE_TEXT_SCALE) {
                copy(Modifier.fillMaxWidth())
                share(Modifier.fillMaxWidth())
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    copy(Modifier.weight(1f))
                    share(Modifier.weight(1f))
                }
            }
        }
        card.note?.let { Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary) }
        val giveBack = card.giveBack?.takeIf { card.open && it.left > 0 }
        if (giveBack != null) {
            GhostButton(
                title = giveBack.label ?: "Give back ${giveBack.left} spots",
                onClick = { asks = true },
                isLoading = ui.busy,
                isEnabled = !ui.busy,
                modifier = Modifier.fillMaxWidth().testTag("planGroupPayGiveBack"),
            )
        }
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
        if (asks && giveBack != null) GiveBackDialog(giveBack, onDismiss = { asks = false }, onConfirm = onGiveBack)
    }
}

/** "Give back {n} spots?" with the server's sentence ("$126.00 goes back to your card and the link stops."). */
@Composable
private fun GiveBackDialog(
    giveBack: PlanGroupPayGiveBackDto,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(giveBack.label ?: "Give back the spots?") },
        text = { giveBack.text?.let { Text(it) } },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) { Text("Give back") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Keep them") } },
    )
}

/** The card's 40 dp tile. */
@Composable
private fun GroupPayTile(icon: PantopusIcon) {
    PlanIconTile(icon, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong, size = 40.dp, glyph = 20.dp, corner = 12.dp)
}

/**
 * Opened from a spot link (`?spot=`) by someone not in: "{Chris} got you a spot" and "I'm in", or the server's reason
 * the link takes nobody now. [onClaimed] reads the plan again.
 */
@Composable
internal fun PlanSpotOffer(
    plan: PlanDto,
    onClaimed: () -> Unit,
    vm: PlanGroupPayViewModel = hiltViewModel(key = "planGroupPay-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.id) { vm.readOffer() }
    val offer = ui.offer ?: return
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planSpotOffer"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            GroupPayTile(PantopusIcon.Gift)
            Text(text = offer.text.orEmpty(), style = SEMIBOLD, color = PantopusColors.appText, modifier = Modifier.weight(1f))
        }
        if (offer.open) {
            PrimaryButton(
                title = offer.button ?: "I'm in",
                onClick = { vm.claim(onClaimed) },
                isLoading = ui.busy,
                isEnabled = !ui.busy,
                modifier = Modifier.fillMaxWidth().testTag("planSpotClaim"),
            )
        } else {
            offer.closedText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
    }
}

private val SEMIBOLD = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
