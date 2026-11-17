package app.pantopus.android.ui.screens.plans.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanChipInDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.LARGE_TEXT_SCALE
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * The holidays' chip in on the plan's page (08-extras section 3, board 27), for the host and people who are in (the
 * server sends `chip_in` to nobody else). Every word with money in it is the server's. No money moves through Pantopus:
 * "Pay {Host} on {Venmo}" opens the host's own link outside the app, and "I've paid" only tells the host.
 */

/** The card's state after a mark: the server's answer until the plan is read again. */
data class PlanChipInUi(
    val chipIn: PlanChipInDto? = null,
    val busy: Boolean = false,
    val error: String? = null,
)

/** "I've paid" and "Undo" (`POST`/`DELETE …/chip-in/paid`); no notice is sent. */
@HiltViewModel
class PlanChipInViewModel
    @Inject
    constructor(
        private val repository: PlanExtrasRepository,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(PlanChipInUi())
        val ui: StateFlow<PlanChipInUi> = _ui.asStateFlow()

        /** The plan was read again: its own card wins. */
        fun reset() {
            _ui.value = PlanChipInUi()
        }

        fun mark(
            planId: String,
            paid: Boolean,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.markChipIn(planId, who = null, paid = paid)) {
                    is NetworkResult.Success -> _ui.update { PlanChipInUi(chipIn = result.data.chipIn) }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, error = result.error.planMessage) }
                }
            }
        }
    }

/** Board 27's card: "Chip in $12", what for, "7 of 12 paid"; for a guest "I've paid" and "Pay Maya on Venmo". */
@Composable
internal fun PlanChipInCard(
    plan: PlanDto,
    vm: PlanChipInViewModel = hiltViewModel(key = "planChipIn-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.chipIn) { vm.reset() }
    val chip = ui.chipIn ?: plan.chipIn ?: return
    val context = LocalContext.current
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planChipIn"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            PlanIconTile(
                PantopusIcon.DollarSign,
                PantopusColors.appSurfaceSunken,
                PantopusColors.appTextStrong,
                size = 40.dp,
                glyph = 20.dp,
                corner = 12.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = chip.text,
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                chip.note?.takeIf(String::isNotBlank)?.let {
                    Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
                }
            }
            chip.paidText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
        val mine = chip.mine
        if (mine != null) {
            val pay: @Composable (Modifier) -> Unit = { modifier ->
                val link = chip.link?.takeIf { it.startsWith("https://") }
                if (link != null) {
                    PrimaryButton(
                        title = chip.payText ?: "Pay",
                        onClick = { openOutside(context, link) },
                        modifier = modifier.testTag("planChipInPay"),
                    )
                }
            }
            if (mine.paid) {
                ChippedInRow(busy = ui.busy, onUndo = { vm.mark(plan.id, paid = false) })
                pay(Modifier.fillMaxWidth())
            } else {
                val paidButton: @Composable (Modifier) -> Unit = { modifier ->
                    GhostButton(
                        title = "I've paid",
                        onClick = { vm.mark(plan.id, paid = true) },
                        isLoading = ui.busy,
                        isEnabled = !ui.busy,
                        modifier = modifier.testTag("planChipInPaid"),
                    )
                }
                if (LocalDensity.current.fontScale >= LARGE_TEXT_SCALE) {
                    paidButton(Modifier.fillMaxWidth())
                    pay(Modifier.fillMaxWidth())
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                        paidButton(Modifier.weight(1f))
                        pay(Modifier.weight(1f))
                    }
                }
            }
        }
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
        chip.straightText?.let { Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary) }
    }
}

/** The card, while the plan carries chip in (the host and people who are in). */
@Composable
internal fun PlanChipInIfAny(plan: PlanDto) {
    if (plan.chipIn != null) PlanChipInCard(plan)
}

/** "You chipped in" with "Undo", in place of "I've paid". */
@Composable
private fun ChippedInRow(
    busy: Boolean,
    onUndo: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 18.dp, tint = PantopusColors.success)
        Text(
            text = "You chipped in",
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
            modifier = Modifier.weight(1f).testTag("planChipInDone"),
        )
        if (!busy) ChipInTextButton(title = "Undo", spoken = "Undo, you chipped in", onClick = onUndo, tag = "planChipInUndo")
    }
}

/** A small text button that takes only its own width (beside a name or a line), at least 48 dp tall. */
@Composable
internal fun ChipInTextButton(
    title: String,
    spoken: String,
    onClick: () -> Unit,
    tag: String,
) {
    Text(
        text = title,
        style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
        color = PantopusColors.primary700,
        modifier =
            Modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(Radii.md))
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s2, vertical = 14.dp)
                .clearAndSetSemantics {
                    contentDescription = spoken
                    role = Role.Button
                }.testTag(tag),
    )
}

/** The host's own payment link, in the browser or the payment app; never inside Pantopus. */
private fun openOutside(
    context: android.content.Context,
    link: String,
) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
