package app.pantopus.android.ui.screens.moments.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.pulse.StudioRepository
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/*
 * The five signals ("Pulse, reinvented", founder 2026-11-26; CONTRACT section 4), as on iPhone (`MomentSignals.swift`):
 * Learned, Want to go, Smile, Same, Helpful. They take the seven emoji's place in the viewer while `pulse_reinvented`
 * is on for the person; one per person, stored where the emoji are, so a signal replaces an emoji and the other way
 * round. Today's screens and older apps keep reading emoji (the server shows a signal there as its nearest emoji).
 */

/** The five, in the order the apps offer them; [wire] is the server's name. */
enum class MomentSignal(
    val wire: String,
    val title: String,
    val icon: PantopusIcon,
) {
    Learned("learned", "Learned", PantopusIcon.Lightbulb),
    WantToGo("want_to_go", "Want to go", PantopusIcon.MapPin),
    Smile("smile", "Smile", PantopusIcon.Smile),
    Same("same", "Same", PantopusIcon.RefreshCw),
    Helpful("helpful", "Helpful", PantopusIcon.CheckCircle),
    ;

    companion object {
        fun of(wire: String?): MomentSignal? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * The signals given in this run of the app, by Moment, over what each Moment answered (`my_signal`), so a signal shows
 * at once and stays when the viewer comes back to that Moment.
 */
@Singleton
class MomentSignalStore
    @Inject
    constructor() {
        private val _given = MutableStateFlow<Map<String, String>>(emptyMap())

        /** The signal given to a Moment in this run; "" when it was taken back. */
        val given: StateFlow<Map<String, String>> = _given.asStateFlow()

        fun set(
            momentId: String,
            signal: String?,
        ) = _given.update { it + (momentId to (signal ?: "")) }

        fun forget(momentId: String) = _given.update { it - momentId }
    }

/** Gives a signal to a Moment, or takes it back; it shows at once and goes back if the server refuses it. */
@HiltViewModel
class MomentSignalsViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
        private val store: MomentSignalStore,
    ) : ViewModel() {
        val given: StateFlow<Map<String, String>> = store.given

        /** The signal you gave [momentId]: one given in this run, else what the Moment says. */
        fun chosen(
            given: Map<String, String>,
            momentId: String,
            answered: String?,
        ): String? = given[momentId]?.let { it.ifEmpty { null } } ?: answered.takeIf { momentId !in given }

        /**
         * [signal] on the Moment; the one already given takes it back. It replaces any emoji you gave (CONTRACT 4). A
         * refusal puts back what was there and says why through [onFailed].
         */
        fun give(
            momentId: String,
            answered: String?,
            signal: MomentSignal,
            onFailed: (String) -> Unit,
        ) {
            val before = store.given.value[momentId]
            val choice = signal.wire.takeIf { chosen(store.given.value, momentId, answered) != signal.wire }
            store.set(momentId, choice)
            viewModelScope.launch {
                when (val result = studio.signal(momentId, choice)) {
                    is NetworkResult.Success -> store.set(momentId, result.data)
                    is NetworkResult.Failure -> {
                        if (before != null) store.set(momentId, before.ifEmpty { null }) else store.forget(momentId)
                        onFailed(result.error.signalMessage())
                    }
                }
            }
        }
    }

private fun NetworkError.signalMessage(): String =
    when (serverCode) {
        "MOMENT_ENDED" -> "This Moment has ended."
        "MOMENT_OWN" -> "That's your own Moment."
        else -> if (this is NetworkError.Transport) message else "Couldn't send that. Try again."
    }

/** The viewer's quick reactions while the switch is on: the five signals, each its icon over its word (board B3). */
@Composable
fun MomentQuickSignals(
    chosen: String?,
    onPick: (MomentSignal) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().testTag("moments.viewer.signals"), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = "Quick reactions", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4)) {
            MomentSignal.entries.forEach { signal ->
                val on = chosen == signal.wire
                Column(
                    modifier =
                        Modifier
                            .weight(1f)
                            .heightIn(min = 60.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (on) Color.White.copy(alpha = 0.22f) else Color.Transparent)
                            .clickable(role = Role.Button) { onPick(signal) }
                            .padding(vertical = Spacing.s2)
                            .testTag("moments.viewer.signal.${signal.wire}")
                            .clearAndSetSemantics {
                                contentDescription = signal.title
                                role = Role.Button
                                selected = on
                            },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.s1),
                ) {
                    PantopusIconImage(icon = signal.icon, contentDescription = null, size = 24.dp, strokeWidth = 2f, tint = Color.White)
                    Text(
                        text = signal.title,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** A watcher's signal in "Seen by", in the emoji's place: its icon in a soft round. */
@Composable
fun MomentSignalBadge(signal: MomentSignal) {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(PantopusColors.primary100)
                .padding(horizontal = 10.dp, vertical = Spacing.s1)
                .semantics(mergeDescendants = true) { contentDescription = signal.title },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        PantopusIconImage(icon = signal.icon, contentDescription = null, size = 16.dp, strokeWidth = 2f, tint = PantopusColors.primary600)
        Text(text = signal.title, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.primary600)
    }
}

/**
 * The quick reactions in today's viewer while the switch is on: the five signals for [moment]. A pick that changes your
 * signal taps lightly; [onMessage] says why one didn't go.
 */
@Composable
fun MomentViewerSignals(
    moment: MomentDto,
    onPicked: () -> Unit,
    onMessage: (String) -> Unit,
    signals: MomentSignalsViewModel = hiltViewModel(),
) {
    val given by signals.given.collectAsStateWithLifecycle()
    val view = LocalView.current
    val chosen = signals.chosen(given, moment.id, moment.mySignal)
    MomentQuickSignals(chosen = chosen) { signal ->
        if (chosen != signal.wire) MomentHaptics.light(view)
        signals.give(moment.id, moment.mySignal, signal, onMessage)
        onPicked()
    }
}
