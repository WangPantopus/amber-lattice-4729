package app.pantopus.android.ui.screens.plans.bring

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.ErrorState
import app.pantopus.android.ui.components.ToastController
import app.pantopus.android.ui.components.ToastHost
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.screens.plans.map.PlanRowsSkeleton
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A posted plan's bring list as its host edits it (A9 from the plan's page). */
data class PlanBringUi(
    val draft: BringDraft? = null,
    val loading: Boolean = true,
    val failed: String? = null,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** Saved: the screen closes. */
    val done: Boolean = false,
)

/**
 * The bring list for a posted plan (Plans for the holidays, A9, pushed from the host's page): reads the plan's
 * `bring`, and Done replaces the list with `PUT /api/plans/:id/bring`. When someone changed it meanwhile
 * (`409 bring_changed`) it reads the list again and says so.
 */
@HiltViewModel
class PlanBringViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanBringUi())
        val ui: StateFlow<PlanBringUi> = _ui.asStateFlow()

        init {
            load()
        }

        fun load(notice: String? = null) {
            viewModelScope.launch {
                when (val result = repository.plan(planId)) {
                    is NetworkResult.Success ->
                        _ui.update {
                            it.copy(loading = false, failed = null, draft = BringDraft.from(result.data.bring), notice = notice)
                        }
                    is NetworkResult.Failure ->
                        _ui.update { it.copy(loading = false, failed = result.error.planMessage.takeIf { _ -> it.draft == null }) }
                }
            }
        }

        fun edit(draft: BringDraft) {
            _ui.update { it.copy(draft = draft, error = null) }
        }

        fun save() {
            val draft = _ui.value.draft ?: return
            if (_ui.value.saving) return
            _ui.update { it.copy(saving = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.putBring(planId, draft.toInput())) {
                    is NetworkResult.Success -> {
                        repository.changed(planId)
                        _ui.update { it.copy(saving = false, done = true) }
                    }
                    is NetworkResult.Failure ->
                        if (result.error.planCode == BRING_CHANGED) {
                            _ui.update { it.copy(saving = false) }
                            load(notice = "Someone just changed the list. Here's the latest.")
                        } else {
                            _ui.update { it.copy(saving = false, error = result.error.planMessage) }
                        }
                }
            }
        }

        fun noticeShown() {
            _ui.update { it.copy(notice = null) }
        }

        private companion object {
            const val BRING_CHANGED = "bring_changed"
        }
    }

/** The route's screen: the editor over the plan's list, with the loading and error states. */
@Composable
fun PlanBringScreen(
    onDone: () -> Unit,
    viewModel: PlanBringViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val toast = remember { ToastController() }
    LaunchedEffect(ui.done) { if (ui.done) onDone() }
    LaunchedEffect(ui.notice) {
        ui.notice?.let {
            toast.info(it)
            viewModel.noticeShown()
        }
    }
    Box(modifier = Modifier.fillMaxSize()) {
        val draft = ui.draft
        when {
            draft != null ->
                PlanBringEditor(
                    draft = draft,
                    onChange = viewModel::edit,
                    onDone = viewModel::save,
                    onBack = onDone,
                    saving = ui.saving,
                    error = ui.error,
                )
            ui.failed != null ->
                PlanPlainScaffold(onBack = onDone, title = "Bring list") {
                    ErrorState(headline = "Couldn't load the bring list", message = ui.failed.orEmpty(), onRetry = { viewModel.load() })
                }
            else -> PlanPlainScaffold(onBack = onDone, title = "Bring list") { PlanRowsSkeleton(rows = 4) }
        }
        ToastHost(controller = toast, modifier = Modifier.align(Alignment.TopCenter))
    }
}
