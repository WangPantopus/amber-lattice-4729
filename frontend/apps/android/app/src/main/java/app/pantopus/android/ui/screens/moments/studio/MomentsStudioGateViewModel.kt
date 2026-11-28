package app.pantopus.android.ui.screens.moments.studio

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.pulse.PulseReinventedFeature
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Whether the Moment composer opens with the Studio (`pulse_reinvented` on for the signed-in person) or with today's
 * Post screen. Read once, when the composer opens, and kept while it stays open (turning the phone included): a
 * re-read on the way back from another app never swaps the screen under a Moment being made. Only the server's "the
 * switch is off for you" on one of the Studio's own requests takes it back to today's Post screen, keeping the Moment.
 *
 * It also remembers, per account on this phone, that the Studio has said once why a Moment made at home shows only
 * its area (the lead, 2026-11-26: the first time only).
 */
@HiltViewModel
class MomentsStudioGateViewModel
    @Inject
    constructor(
        feature: PulseReinventedFeature,
        auth: AuthRepository,
        @ApplicationContext context: Context,
    ) : ViewModel() {
        private val _studio = MutableStateFlow(feature.on.value)

        /**
         * The Studio (and the viewer's new parts) for this screen. It changes only one way: back to today's, when the
         * server refuses one of the new screens' requests because the switch is off for the person (CONTRACT 1).
         */
        val studio: StateFlow<Boolean> = _studio.asStateFlow()

        init {
            viewModelScope.launch { feature.refused.drop(1).collect { _studio.value = false } }
        }

        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        /** Who is signed in on this phone ("Your cutouts" are kept per account); null when nobody is. */
        val account: String? = (auth.state.value as? AuthRepository.State.SignedIn)?.user?.id

        /** The at-home line is still to be shown to this account: true for the whole of this composer once due. */
        val homeNoteDue: Boolean = account != null && !prefs.getBoolean(HOME_NOTE + account, false)

        /** The at-home line was on screen: later composers leave it out. */
        fun homeNoteShown() {
            account?.let { prefs.edit().putBoolean(HOME_NOTE + it, true).apply() }
        }

        private companion object {
            const val PREFS = "pantopus.studio"
            const val HOME_NOTE = "homeNoteShown."
        }
    }
