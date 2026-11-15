package app.pantopus.android.ui.screens.place.today

import app.pantopus.android.ui.theme.PantopusIcon

/** Which half of Today shows (founder decision 2026-11-14): Today as it was, or the local headlines around the place. */
enum class TodayHalf(val key: String, val label: String, val icon: PantopusIcon) {
    Home("home", "At home", PantopusIcon.Home),
    Around("around", "Around you", PantopusIcon.Megaphone),
}
