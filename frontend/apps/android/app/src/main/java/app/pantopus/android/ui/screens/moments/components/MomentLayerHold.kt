package app.pantopus.android.ui.screens.moments.components

import androidx.compose.runtime.mutableStateMapOf

/**
 * "Pulse, reinvented": what on a switch-on reader's Moment holds the viewer still now, as on iPhone (a dot's card open;
 * later, an item waiting for the reader's answer). Each layer sets its own reason with the Moment's id and clears it; the
 * viewer holds while any reason names the Moment on screen. Nothing sets it outside this build's layers, which the
 * viewer draws only while the switch is on.
 */
object MomentLayerHold {
    private val reasons = mutableStateMapOf<String, String>()

    /** [reason] holds [momentId] still, or lets go when it is null. */
    fun hold(
        reason: String,
        momentId: String?,
    ) {
        if (momentId == null) reasons.remove(reason) else reasons[reason] = momentId
    }

    /** [reason] lets go, if it still holds [momentId]. */
    fun release(
        reason: String,
        momentId: String,
    ) {
        if (reasons[reason] == momentId) reasons.remove(reason)
    }

    fun holds(momentId: String?): Boolean = momentId != null && reasons.containsValue(momentId)
}
