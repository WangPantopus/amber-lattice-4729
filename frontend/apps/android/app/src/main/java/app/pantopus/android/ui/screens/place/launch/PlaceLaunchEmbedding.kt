package app.pantopus.android.ui.screens.place.launch

import androidx.compose.ui.focus.FocusRequester

/**
 * The launch screen as the Place tab's first-run root (signed in, so `onSavePreview` is set too): the tab's bell and
 * menu replace the brand row and Cancel. Mirrors iOS `PlaceLaunchEmbedding`.
 */
class PlaceLaunchEmbedding(
    val unreadCount: Int,
    val onOpenNotifications: () -> Unit,
    val onOpenMenu: () -> Unit,
    /** Focuses the address box (guidance card 24's “Add my address”). */
    val addressFocus: FocusRequester? = null,
)
