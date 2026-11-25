package app.pantopus.android.ui.screens.pennames

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.pennames.PenNameDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pennames.PenNameRefusal
import app.pantopus.android.data.pennames.PenNamesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The name screen: what was typed, the name Pantopus would give, the promise, and how "Use this name" went. */
data class PenNameSetupUi(
    val typed: String = "",
    /** The name Pantopus gives when the field is left empty; Shuffle draws another. */
    val suggestion: String? = null,
    /** The three sentences of the promise, as the server sends them. */
    val promise: List<String> = emptyList(),
    val maxLength: Int = DEFAULT_MAX,
    /** The name in use, when changing it (Settings). */
    val current: PenNameDto? = null,
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    /** The server's sentence when the name can't be taken, as it is. */
    val error: String? = null,
    /** The name was kept: the screen closes with it. */
    val taken: PenNameDto? = null,
) {
    /** The name "Use this name" sends: the typed one, else the suggestion. */
    val chosenName: String? get() = typed.trim().ifEmpty { suggestion }

    val canUse: Boolean get() = !isLoading && !isSaving && chosenName != null && typed.trim().length <= maxLength

    companion object {
        const val DEFAULT_MAX = 24
    }
}

/**
 * The first-time name screen (contract "What each app builds", 2), and Settings' change of name (`replace: true`):
 * a typed name, or one Pantopus gives (with Shuffle); the promise; "Use this name".
 */
@HiltViewModel
class PenNameSetupViewModel
    @Inject
    constructor(
        private val repo: PenNamesRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(PenNameSetupUi())
        val state: StateFlow<PenNameSetupUi> = _state.asStateFlow()

        private val pool = ArrayDeque<String>()
        private var started = false
        private var replace = false

        /** Reads the promise, the rules and the names Pantopus could give. [replacing] changes a name in use. */
        fun start(replacing: Boolean) {
            if (started) return
            started = true
            replace = replacing
            viewModelScope.launch {
                when (val result = repo.loadMe()) {
                    is NetworkResult.Success -> {
                        val me = result.data
                        pool.addAll(me.suggestions)
                        _state.value =
                            _state.value.copy(
                                promise = me.promise,
                                maxLength = me.nameRules?.max ?: PenNameSetupUi.DEFAULT_MAX,
                                current = me.penName,
                                suggestion = pool.removeFirstOrNull(),
                                isLoading = false,
                                error = me.refusal?.message?.takeIf { !me.allowed },
                            )
                        if (_state.value.suggestion == null) shuffle()
                    }
                    is NetworkResult.Failure ->
                        _state.value = _state.value.copy(isLoading = false, error = result.error.message)
                }
            }
        }

        fun setTyped(text: String) {
            _state.value = _state.value.copy(typed = text, error = null)
        }

        /** Shuffle: another name Pantopus could give. */
        fun shuffle() {
            pool.removeFirstOrNull()?.let {
                _state.value = _state.value.copy(suggestion = it)
                return
            }
            viewModelScope.launch {
                val names = (repo.suggestions() as? NetworkResult.Success)?.data.orEmpty()
                pool.addAll(names.filter { it != _state.value.suggestion })
                pool.removeFirstOrNull()?.let { _state.value = _state.value.copy(suggestion = it) }
            }
        }

        /** "Use this name". */
        fun use() {
            val current = _state.value
            val name = current.chosenName ?: return
            if (!current.canUse) return
            _state.value = current.copy(isSaving = true, error = null)
            viewModelScope.launch {
                when (val result = repo.take(name, replace = replace)) {
                    is NetworkResult.Success -> _state.value = _state.value.copy(isSaving = false, taken = result.data)
                    is NetworkResult.Failure ->
                        _state.value =
                            _state.value.copy(
                                isSaving = false,
                                error = PenNameRefusal.from(result.error)?.message ?: result.error.message,
                            )
                }
            }
        }

        /** The screen handed the name on and closes; opening it again starts over. */
        fun consumeTaken() {
            started = false
            pool.clear()
            _state.value = PenNameSetupUi()
        }
    }
