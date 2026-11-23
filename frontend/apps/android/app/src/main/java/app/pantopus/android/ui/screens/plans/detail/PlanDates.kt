package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDatesMineBody
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.isPicking
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.data.plans.takesKids
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanStepperRow
import app.pantopus.android.ui.screens.plans.components.PlanSwitchRow
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.map.planH3
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
 * The holidays' find a date (08-extras section 2): board 24 for an invited person (tick the times that work, the
 * numbers, "Save my times") and board 25 for the host ("Pick a date"). Every word with a date or a count in it is the
 * server's: each time's `text` and `can_text`, `answered_text`, `pick_text` and `pick_note`. While the host is picking,
 * the ordinary answer buttons are not offered (the server refuses them, `409 picking`).
 */

/** An invited person's ticks and numbers as they change them. */
data class PlanDatesUi(
    val planId: String? = null,
    val ticks: Set<String> = emptySet(),
    val adults: Int = 1,
    val kids: Int = 0,
    val changingNumbers: Boolean = false,
    val saving: Boolean = false,
    val picking: Boolean = false,
    val error: String? = null,
    /** Something changed since the plan was read: "Save my times" is on. */
    val dirty: Boolean = false,
)

/** `PUT …/dates/mine` and the host's `POST …/dates/pick`. */
@HiltViewModel
class PlanDatesViewModel
    @Inject
    constructor(
        private val repository: PlanExtrasRepository,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(PlanDatesUi())
        val ui: StateFlow<PlanDatesUi> = _ui.asStateFlow()

        /** The plan as read: its own ticks and numbers, unless the person changed them here. */
        fun start(plan: PlanDto) {
            val dates = plan.dates ?: return
            if (_ui.value.planId == plan.id && _ui.value.dirty) return
            val mine = dates.mine
            _ui.value =
                PlanDatesUi(
                    planId = plan.id,
                    ticks = dates.options.filter { it.mine }.map { it.id }.toSet(),
                    adults = (mine?.partySize ?: 1).coerceAtLeast(1),
                    kids = (mine?.kidsCount ?: 0).coerceAtLeast(0),
                )
        }

        fun tick(
            optionId: String,
            on: Boolean,
        ) {
            _ui.update { it.copy(ticks = if (on) it.ticks + optionId else it.ticks - optionId, dirty = true, error = null) }
        }

        fun changeNumbers() {
            _ui.update { it.copy(changingNumbers = true) }
        }

        fun setAdults(value: Int) {
            _ui.update { it.copy(adults = value, dirty = true, error = null) }
        }

        fun setKids(value: Int) {
            _ui.update { it.copy(kids = value, dirty = true, error = null) }
        }

        /** "Save my times": an empty list is "none of these". */
        fun save(
            plan: PlanDto,
            onSaved: () -> Unit,
        ) {
            val ui = _ui.value
            if (ui.saving) return
            _ui.update { it.copy(saving = true, error = null) }
            viewModelScope.launch {
                val kids = if (plan.takesKids) ui.kids else 0
                val ticked = plan.dates?.options.orEmpty().map { it.id }.filter { it in ui.ticks }
                val body = PlanDatesMineBody(options = ticked, partySize = ui.adults, kidsCount = kids)
                when (val result = repository.saveDates(plan.id, body)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(saving = false, dirty = false, changingNumbers = false) }
                        onSaved()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(saving = false, error = result.error.planMessage) }
                }
            }
        }

        /** The host picks [optionId]: everyone is settled by the server, once. */
        fun pick(
            planId: String,
            optionId: String,
            onPicked: () -> Unit,
        ) {
            if (_ui.value.picking) return
            _ui.update { it.copy(picking = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.pickDate(planId, optionId)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(picking = false) }
                        onPicked()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(picking = false, error = result.error.planMessage) }
                }
            }
        }
    }

/** Board 24 under the title: the banner, "Which times work?" and "Who's coming". */
@Composable
internal fun PlanDatesGuest(
    plan: PlanDto,
    vm: PlanDatesViewModel = hiltViewModel(key = "planDates-${plan.id}"),
) {
    val dates = plan.dates ?: return
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan) { vm.start(plan) }
    val host = PlanFormat.hostName(plan)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4), modifier = Modifier.testTag("planDatesGuest")) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Radii.xl))
                    .background(PantopusColors.primary100)
                    .padding(14.dp)
                    .semantics(mergeDescendants = true) {},
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            PantopusIconImage(icon = PantopusIcon.Calendar, contentDescription = null, size = 22.dp, tint = PantopusColors.primary700)
            Column {
                Text(
                    text = "$host is picking a date",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(
                    text = "Tick every time that works for you. $host chooses one, and you'll hear.",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            }
        }
        Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp, vertical = Spacing.s3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Which times work?",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                dates.answeredText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
            }
            dates.options.forEach { option ->
                PlanSwitchRow(
                    title = option.text,
                    caption = option.canText,
                    checked = option.id in ui.ticks,
                    onChecked = { on -> vm.tick(option.id, on) },
                    modifier = Modifier.padding(top = Spacing.s3).testTag("planDateOption"),
                )
            }
        }
        DatesNumbers(plan, ui, vm)
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
    }
}

/** "Who's coming" with the numbers and "Change" (A7's steppers). */
@Composable
private fun DatesNumbers(
    plan: PlanDto,
    ui: PlanDatesUi,
    vm: PlanDatesViewModel,
) {
    val kids = plan.takesKids
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                Text(
                    text = "Who's coming",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(
                    text = PlanFormat.headcount(ui.adults, if (kids) ui.kids else 0) ?: "",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            }
            if (!ui.changingNumbers) {
                ChipInTextButton(title = "Change", spoken = "Change who's coming", onClick = vm::changeNumbers, tag = "planDatesChange")
            }
        }
        if (ui.changingNumbers) {
            PlanStepperRow(title = "Adults", caption = null, value = ui.adults, range = 1..MAX_PARTY, onChange = vm::setAdults)
            if (kids) PlanStepperRow(title = "Kids", caption = null, value = ui.kids, range = 0..MAX_PARTY, onChange = vm::setKids)
        }
    }
}

/**
 * Board 24's footer: "Save my times" and the server's `mine_text` under it ("You're in when {Host} picks a time you
 * ticked.", or "… {Host} lets you in." for someone who waits for the host's yes); today's words while it is absent.
 */
@Composable
internal fun ColumnScope.PlanDatesFooter(
    plan: PlanDto,
    onSaved: () -> Unit,
    vm: PlanDatesViewModel = hiltViewModel(key = "planDates-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val answered = plan.dates?.mine?.answered == true
    PrimaryButton(
        title = "Save my times",
        onClick = { vm.save(plan, onSaved) },
        isLoading = ui.saving,
        isEnabled = !ui.saving && (ui.dirty || !answered),
        modifier = Modifier.height(50.dp).testTag("planDatesSave"),
    )
    val line = plan.dates?.mineText?.takeIf(String::isNotBlank) ?: "You're in when ${PlanFormat.hostName(plan)} picks a time you ticked"
    PlanFooterCaption(line)
}

/** On the host's page while picking: the count and "Pick a date", which opens board 25. */
@Composable
internal fun PlanDatesHostCard(
    plan: PlanDto,
    onPicked: () -> Unit,
) {
    if (!plan.isPicking) return
    val dates = plan.dates ?: return
    var open by rememberSaveable { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planDatesHost"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            text = plan.timeText ?: "Picking a date",
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
        )
        dates.answeredText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        PrimaryButton(title = "Pick a date", onClick = { open = true }, modifier = Modifier.height(50.dp).testTag("planDatesPickOpen"))
    }
    if (open) PlanPickDateSheet(plan, onClose = { open = false }, onPicked = onPicked)
}

/** Board 25: the times, the favorite first with "Most", who can come, what picking does, and "Pick {time}". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlanPickDateSheet(
    plan: PlanDto,
    onClose: () -> Unit,
    onPicked: () -> Unit,
    vm: PlanDatesViewModel = hiltViewModel(key = "planDates-${plan.id}"),
) {
    val dates = plan.dates ?: return
    val ui by vm.ui.collectAsStateWithLifecycle()
    var chosen by remember(dates) { mutableStateOf(dates.options.firstOrNull { it.most }?.id ?: dates.options.firstOrNull()?.id) }
    val option = dates.options.firstOrNull { it.id == chosen }
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.testTag("planPickDate"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.s4),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            Text(text = "Pick a date", style = planH3, color = PantopusColors.appText, modifier = Modifier.semantics { heading() })
            Text(text = plan.title, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            dates.answeredText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
            Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp)) {
                dates.options.forEach { item ->
                    PickRow(
                        text = item.text,
                        line = pickLine(item.can, item.who.orEmpty(), item.canText),
                        most = item.most,
                        selected = item.id == chosen,
                        onSelect = { chosen = item.id },
                    )
                }
            }
            option?.pickNote?.let { note ->
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Radii.xl))
                            .background(PantopusColors.primary100)
                            .padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                ) {
                    PantopusIconImage(icon = PantopusIcon.Info, contentDescription = null, size = 18.dp, tint = PantopusColors.primary700)
                    Text(text = note, style = PantopusTextStyle.small, color = PantopusColors.appTextStrong)
                }
            }
            ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            PrimaryButton(
                title = option?.pickText ?: "Pick a date",
                onClick = {
                    chosen?.let { id ->
                        vm.pick(plan.id, id) {
                            onClose()
                            onPicked()
                        }
                    }
                },
                isLoading = ui.picking,
                isEnabled = chosen != null && !ui.picking,
                // At large text the date wraps rather than being cut ("Pick Sunday, Nov 22 · 4:00 PM").
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp).testTag("planDatesPick"),
            )
            PlanFooterCaption("You can still change the date afterwards")
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PickRow(
    text: String,
    line: String?,
    most: Boolean,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
                .padding(vertical = Spacing.s3)
                .testTag("planDatePickRow"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            // "Most" goes under the time when they don't fit side by side (large text).
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                verticalArrangement = Arrangement.spacedBy(Spacing.s1),
            ) {
                Text(text = text, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
                if (most) {
                    Text(
                        text = "Most",
                        style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = PantopusColors.success,
                        modifier =
                            Modifier
                                .clip(RoundedCornerShape(Radii.pill))
                                .background(PantopusColors.successLight)
                                .padding(horizontal = Spacing.s2, vertical = 2.dp),
                    )
                }
            }
            line?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
        Box(
            modifier =
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .border(2.dp, if (selected) PantopusColors.primary600 else PantopusColors.appTextMuted, CircleShape)
                    .padding(5.dp)
                    .clip(CircleShape)
                    .background(if (selected) PantopusColors.primary600 else PantopusColors.appSurface),
        )
    }
}

/** "6 can · Dana, Sam, Priya and 3 more" (board 25), from the server's count and first names. */
private fun pickLine(
    can: Int,
    who: List<String>,
    canText: String?,
): String? {
    if (who.isEmpty()) return canText
    val shown = who.take(NAMES_SHOWN).joinToString(", ")
    val more = who.size - NAMES_SHOWN
    return "$can can · " + if (more > 0) "$shown and $more more" else shown
}

private const val NAMES_SHOWN = 3
private const val MAX_PARTY = 20
