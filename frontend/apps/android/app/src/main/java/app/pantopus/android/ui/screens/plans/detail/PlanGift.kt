package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGiftDto
import app.pantopus.android.data.api.models.plans.PlanGiftReceiverDto
import app.pantopus.android.data.api.models.plans.PlanGiftResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
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
 * The holidays' gift exchange on the plan's page (08-extras section 4, board 28), for the host and people who are in
 * (the server sends `gift` to nobody else). Before the draw: "Gift exchange" / "Up to $25" / "Names are drawn Friday at
 * noon · 8 joined", "Your wish, if you like" and "Join"; joined, "You're in the exchange" with "Change" and "Leave".
 * After the draw: "You're giving to", the name, their wish and the server's "Only you can see who you drew…", then
 * "Your wish" with "Change". The host sees the count and "Draw names now" (and may join). The name drawn comes only in
 * the reader's own card and lives only in this screen's memory: never logged, never on disk.
 */

/** The card after an action: the server's answer until the plan is read again. */
data class PlanGiftUi(
    val gift: PlanGiftDto? = null,
    val busy: Boolean = false,
    val editing: Boolean = false,
    val error: String? = null,
)

/** "Join", "Change", "Leave", and the host's "Draw names now" / "Draw again". */
@HiltViewModel
class PlanGiftViewModel
    @Inject
    constructor(
        private val repository: PlanExtrasRepository,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(PlanGiftUi())
        val ui: StateFlow<PlanGiftUi> = _ui.asStateFlow()

        /** The plan was read again: its own card wins. */
        fun reset() {
            _ui.value = PlanGiftUi()
        }

        fun edit(on: Boolean) {
            _ui.update { it.copy(editing = on, error = null) }
        }

        fun saveWish(
            planId: String,
            wish: String,
            joined: Boolean,
        ) = run(closesEditor = true) { repository.saveGiftWish(planId, wish.trim(), joined) }

        fun leave(planId: String) = run { repository.leaveGift(planId) }

        fun draw(planId: String) = run { repository.drawGift(planId) }

        private fun run(
            closesEditor: Boolean = false,
            work: suspend () -> NetworkResult<PlanGiftResponse>,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, error = null) }
            viewModelScope.launch {
                when (val result = work()) {
                    is NetworkResult.Success ->
                        _ui.update {
                            it.copy(gift = result.data.gift ?: it.gift, busy = false, editing = it.editing && !closesEditor)
                        }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, error = result.error.planMessage) }
                }
            }
        }
    }

/** The card, while the plan carries a gift exchange (the host and people who are in). */
@Composable
internal fun PlanGiftIfAny(
    plan: PlanDto,
    isHost: Boolean,
) {
    if (plan.gift != null) PlanGiftCard(plan, isHost)
}

/** Board 28's card, and after the draw "Your wish" under it. */
@Composable
private fun PlanGiftCard(
    plan: PlanDto,
    isHost: Boolean,
    vm: PlanGiftViewModel = hiltViewModel(key = "planGift-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.gift) { vm.reset() }
    val gift = ui.gift ?: plan.gift ?: return
    val joined = gift.mine?.joined == true
    var asksDrawAgain by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
        Column(
            modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planGiftCard"),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            GiftHeader(gift)
            val receiver = gift.mine?.givingTo
            if (gift.isDrawn && receiver != null) {
                GiftReceiver(gift, receiver)
            } else {
                Text(
                    text = listOf(gift.drawText, gift.joinedText).filter(String::isNotBlank).joinToString(" · "),
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                    modifier = Modifier.testTag("planGiftStatus"),
                )
            }
            if (!gift.isDrawn) {
                if (joined && !ui.editing) {
                    JoinedRow(gift, busy = ui.busy, onChange = { vm.edit(true) }, onLeave = { vm.leave(plan.id) })
                } else if (joined || gift.canJoin) {
                    WishForm(gift, joined, ui.busy) { wish -> vm.saveWish(plan.id, wish, joined) }
                }
            }
            if (isHost) {
                if (gift.isDrawn) {
                    ChipInTextButton(
                        title = "Draw again",
                        spoken = "Draw names again",
                        onClick = { asksDrawAgain = true },
                        tag = "planGiftDraw",
                    )
                } else {
                    GhostButton(
                        title = "Draw names now",
                        onClick = { vm.draw(plan.id) },
                        isLoading = ui.busy && !ui.editing,
                        isEnabled = !ui.busy,
                        modifier = Modifier.fillMaxWidth().testTag("planGiftDraw"),
                    )
                }
            }
            ui.error?.let {
                Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error, modifier = Modifier.testTag("planGiftError"))
            }
        }
        if (gift.isDrawn && joined) YourWish(gift, ui, onChange = { vm.edit(true) }) { wish -> vm.saveWish(plan.id, wish, true) }
    }
    if (asksDrawAgain) {
        AlertDialog(
            onDismissRequest = { asksDrawAgain = false },
            title = { Text("Draw names again?") },
            text = { Text("Everyone in the exchange gets a new name.") },
            confirmButton = {
                TextButton(onClick = {
                    asksDrawAgain = false
                    vm.draw(plan.id)
                }) { Text("Draw again") }
            },
            dismissButton = { TextButton(onClick = { asksDrawAgain = false }) { Text("Cancel") } },
        )
    }
}

/** The tile, "Gift exchange" and the server's "Up to $25". */
@Composable
private fun GiftHeader(gift: PlanGiftDto) {
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(
            PantopusIcon.Gift,
            PantopusColors.appSurfaceSunken,
            PantopusColors.appTextStrong,
            size = 40.dp,
            glyph = 20.dp,
            corner = 12.dp,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = "Gift exchange", style = SEMIBOLD, color = PantopusColors.appText)
            Text(text = gift.budgetText, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
}

/** "You're in the exchange", the wish, "Change" and "Leave". */
@Composable
private fun JoinedRow(
    gift: PlanGiftDto,
    busy: Boolean,
    onChange: () -> Unit,
    onLeave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1), modifier = Modifier.testTag("planGiftJoined")) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PantopusIconImage(icon = PantopusIcon.CheckCircle, contentDescription = null, size = 18.dp, tint = PantopusColors.success)
            Text(text = "You're in the exchange", style = SEMIBOLD, color = PantopusColors.appText, modifier = Modifier.weight(1f))
        }
        gift.mine?.wish?.takeIf(String::isNotBlank)?.let {
            Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s4)) {
            ChipInTextButton(title = "Change", spoken = "Change your wish", onClick = onChange, tag = "planGiftChange")
            if (!busy) ChipInTextButton(title = "Leave", spoken = "Leave the gift exchange", onClick = onLeave, tag = "planGiftLeave")
        }
    }
}

/** "Your wish, if you like" and "Join" (or "Save" while changing it). */
@Composable
private fun WishForm(
    gift: PlanGiftDto,
    joined: Boolean,
    busy: Boolean,
    onSave: (String) -> Unit,
) {
    var wish by remember(gift.mine?.wish) { mutableStateOf(gift.mine?.wish.orEmpty()) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Box(modifier = Modifier.testTag("planGiftWish")) {
            PlanTextArea(
                value = wish,
                onValue = { wish = it.take(WISH_MAX) },
                placeholder = "Your wish, if you like",
                label = "Your wish, if you like",
                minHeight = WISH_HEIGHT,
            )
        }
        PrimaryButton(
            title = if (joined) "Save" else "Join",
            onClick = { onSave(wish) },
            isLoading = busy,
            isEnabled = !busy,
            modifier =
                Modifier.fillMaxWidth().testTag("planGiftJoin").semantics {
                    contentDescription = if (joined) "Save your wish" else "Join the gift exchange"
                },
        )
    }
}

/** Board 28: "You're giving to", the initial and name, their wish, and the line that only the reader sees it. */
@Composable
private fun GiftReceiver(
    gift: PlanGiftDto,
    receiver: PlanGiftReceiverDto,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
        Column(
            modifier =
                Modifier.fillMaxWidth().testTag("planGiftGivingTo").clearAndSetSemantics {
                    contentDescription = "You're giving to, ${receiver.name}"
                },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            Text(text = "You're giving to", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            Box(
                modifier = Modifier.size(INITIAL_SIZE).clip(CircleShape).background(PantopusColors.successBg),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = receiver.name.take(1), style = PantopusTextStyle.h2, color = PantopusColors.success)
            }
            Text(text = receiver.name, style = PantopusTextStyle.h2, color = PantopusColors.appText, textAlign = TextAlign.Center)
        }
        receiver.wish?.takeIf(String::isNotBlank)?.let { wish ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(PantopusColors.infoBg)
                        .padding(Spacing.s3)
                        .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
            ) {
                PantopusIconImage(icon = PantopusIcon.Heart, contentDescription = null, size = 14.dp, tint = PantopusColors.primary600)
                Text(
                    text =
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("${gift.mine?.wishText ?: "Their wish"}: ") }
                            append(wish)
                        },
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appText,
                )
            }
        }
        gift.mine?.secretText?.let { PlanScopeLine(it) }
    }
}

/** After the draw: "Your wish" with "Change", or the field while changing it. */
@Composable
private fun YourWish(
    gift: PlanGiftDto,
    ui: PlanGiftUi,
    onChange: () -> Unit,
    onSave: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planGiftYourWish"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        if (ui.editing) {
            Text(text = "Your wish", style = SEMIBOLD, color = PantopusColors.appText)
            WishForm(gift, joined = true, busy = ui.busy, onSave = onSave)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                    Text(text = "Your wish", style = SEMIBOLD, color = PantopusColors.appText)
                    gift.mine?.wish?.takeIf(String::isNotBlank)?.let {
                        Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
                    }
                }
                ChipInTextButton(title = "Change", spoken = "Change your wish", onClick = onChange, tag = "planGiftChange")
            }
        }
    }
}

private val SEMIBOLD = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
private val INITIAL_SIZE = 64.dp
private val WISH_HEIGHT = 56.dp
private const val WISH_MAX = 120
