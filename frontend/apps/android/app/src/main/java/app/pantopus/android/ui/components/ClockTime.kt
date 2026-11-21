package app.pantopus.android.ui.components

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A stored "HH:mm" wall-clock time (a briefing time, quiet hours) the way the phone shows times: "7:30 AM" on a phone
 * set to 12-hour, "07:30" on one set to 24-hour, in the phone's language. The pattern is picked the way Android's own
 * `DateFormat.getTimeFormat` picks it. Only what is shown changes: the value sent to and read from the server stays
 * "HH:mm". A value that isn't a time is shown as it is.
 */
object ClockTime {
    fun label(
        hhmm: String,
        is24Hour: Boolean,
        locale: Locale = Locale.getDefault(),
    ): String {
        val time = runCatching { LocalTime.parse(hhmm) }.getOrNull() ?: return hhmm
        val pattern = DateFormat.getBestDateTimePattern(locale, if (is24Hour) "Hm" else "hm")
        return time.format(DateTimeFormatter.ofPattern(pattern, locale))
    }
}

/** Whether the phone is set to show 24-hour times (its "Use 24-hour format" setting, else its language's habit). */
@Composable
fun phoneUses24HourClock(): Boolean = DateFormat.is24HourFormat(LocalContext.current)
