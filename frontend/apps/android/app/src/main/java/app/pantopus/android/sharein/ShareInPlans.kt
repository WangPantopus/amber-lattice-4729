package app.pantopus.android.sharein

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.theme.PantopusColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/*
 * "Share with a plan": something shared from another app, sent to the chat of a plan the person hosts or is in. It
 * lists those plans, soonest first; the one picked opens its chat with the picture (or the words) waiting in the
 * composer, as a message does. A plan whose chat hasn't opened, or has closed, says so and stays in the list. Parity
 * twin of iOS `ShareInPlanFlow.swift`; the test tags are the iPhone's accessibility identifiers.
 */

data class ShareInPlansUiState(
    /** The plans to pick from; null while reading. */
    val plans: List<PlanDto>? = null,
    val failed: Boolean = false,
    /** The plan being opened. */
    val opening: String? = null,
    val note: String? = null,
)

@HiltViewModel
class ShareInPlansViewModel
    @Inject
    constructor(
        private val repository: PlansRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(ShareInPlansUiState())
        val state: StateFlow<ShareInPlansUiState> = _state.asStateFlow()

        init {
            load()
        }

        /** The plans the person hosts or is going to, and ones that just ended: the ones with a chat they're in. */
        fun load() {
            _state.update { it.copy(failed = false) }
            viewModelScope.launch {
                val mine = repository.mine().data
                if (mine == null) {
                    _state.update { it.copy(failed = true) }
                } else {
                    val plans =
                        (mine.hosting + mine.going + mine.recent)
                            .distinctBy { it.id }
                            .sortedBy { PlanFormat.instant(it.startsAt) ?: Instant.MAX }
                    _state.update { it.copy(plans = plans) }
                }
            }
        }

        /** Reads the plan picked and hands its chat to [then]; a plan with no chat to write in leaves a line saying so. */
        fun open(
            plan: PlanDto,
            then: (roomId: String, title: String) -> Unit,
        ) {
            if (_state.value.opening != null) return
            _state.update { it.copy(opening = plan.id, note = null) }
            viewModelScope.launch {
                val title = PlanFormat.shortTitle(plan)
                when (val read = repository.plan(plan.id)) {
                    is NetworkResult.Success -> {
                        val room = read.data.chatRoomId
                        when {
                            room.isNullOrBlank() ->
                                _state.update { it.copy(opening = null, note = "$title has no chat yet. It opens once someone joins.") }
                            read.data.chatOpen == false ->
                                _state.update { it.copy(opening = null, note = "$title's chat has closed.") }
                            else -> {
                                _state.update { it.copy(opening = null) }
                                then(room, title)
                            }
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(opening = null, note = "Couldn't open that plan. Try again.") }
                }
            }
        }
    }

@Composable
fun ShareInPlansScreen(
    onCancel: () -> Unit,
    /** The plan's chat room and the name its chat goes by. */
    onPick: (roomId: String, title: String) -> Unit,
) {
    val viewModel: ShareInPlansViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(modifier = Modifier.fillMaxSize().background(PantopusColors.appBg).safeDrawingPadding().testTag("shareIn.plans")) {
        Box(modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text(
                text = "Cancel",
                fontSize = 16.sp,
                color = PantopusColors.primary600,
                modifier =
                    Modifier
                        .align(Alignment.CenterStart)
                        .clickable(role = Role.Button, onClick = onCancel)
                        .padding(vertical = 12.dp)
                        .testTag("shareIn.plans.cancel"),
            )
            Text("Share with a plan", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
        }
        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorder))
        val plans = state.plans
        when {
            plans != null && plans.isNotEmpty() ->
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    state.note?.let { note ->
                        item(key = "note") {
                            Text(
                                text = note,
                                fontSize = 14.sp,
                                color = PantopusColors.appTextSecondary,
                                modifier = Modifier.fillMaxWidth().padding(16.dp).testTag("shareIn.plans.note"),
                            )
                        }
                    }
                    items(plans, key = { it.id }) { plan ->
                        PlanRow(plan, opening = state.opening == plan.id, enabled = state.opening == null) {
                            viewModel.open(plan, onPick)
                        }
                        Box(modifier = Modifier.fillMaxWidth().padding(start = 16.dp).height(1.dp).background(PantopusColors.appBorder))
                    }
                }
            plans != null ->
                Notice("No plans yet", "Plans you host or join show here, and what you share goes to the plan's chat.")
            state.failed ->
                Notice("Couldn't read your plans", "Check your connection and try again.") {
                    GhostButton(title = "Try again", onClick = viewModel::load, modifier = Modifier.width(200.dp))
                }
            else ->
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = PantopusColors.primary600)
                }
        }
    }
}

@Composable
private fun PlanRow(
    plan: PlanDto,
    opening: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable(
                    enabled = enabled,
                    role = Role.Button,
                    onClickLabel = "Open the plan's chat with what you shared",
                    onClick = onClick,
                )
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .testTag("shareIn.plans.row"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(PlanFormat.shortTitle(plan), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            Text(PlanFormat.whenLine(plan), fontSize = 14.sp, color = PantopusColors.appTextSecondary)
        }
        if (opening) CircularProgressIndicator(color = PantopusColors.primary600, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun Notice(
    title: String,
    detail: String,
    action: @Composable () -> Unit = {},
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
        Text(detail, fontSize = 15.sp, color = PantopusColors.appTextSecondary, textAlign = TextAlign.Center)
        action()
    }
}
