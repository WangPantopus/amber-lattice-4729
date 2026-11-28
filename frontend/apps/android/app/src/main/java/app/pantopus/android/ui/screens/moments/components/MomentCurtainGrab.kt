package app.pantopus.android.ui.screens.moments.components

/**
 * "Pulse, reinvented": before and after's curtain ([MomentBeforeAfterView]) holds a finger now. The viewer's own gestures
 * (next, back, the page turn) read every touch on the picture, so while this is set they leave that finger to the curtain
 * and only hold the Moment still. Nothing sets it outside a switch-on reader's before and after.
 */
object MomentCurtainGrab {
    @Volatile
    var held: Boolean = false
        internal set
}
