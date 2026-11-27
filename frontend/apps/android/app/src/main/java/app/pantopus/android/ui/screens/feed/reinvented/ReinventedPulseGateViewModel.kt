package app.pantopus.android.ui.screens.feed.reinvented

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.pulse.PulseReinventedFeature
import app.pantopus.android.data.pulse.ReinventedServer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Lets the tab bar ask whether the new Pulse tab shows (PHASE-1 §2.1): `pulse_reinvented` is on for the signed-in
 * person and the server knows its routes. While it does, every Moment is in Pulse and the Moments tab is not drawn;
 * otherwise the bar, Pulse and the Moments tab are today's.
 */
@HiltViewModel
class ReinventedPulseGateViewModel
    @Inject
    constructor(
        feature: PulseReinventedFeature,
        private val server: ReinventedServer,
    ) : ViewModel() {
        /** The new Pulse shows in place of today's. */
        val shows: StateFlow<Boolean> =
            combine(feature.on, server.behind) { on, behind -> on && !behind }
                .stateIn(viewModelScope, SharingStarted.Eagerly, feature.on.value && !server.behind.value)

        /** A tab opened or the app came back: an older server is asked again once its minute has passed. */
        fun retryIfDue() = server.retryIfDue()
    }
