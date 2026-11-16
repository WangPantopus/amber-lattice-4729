package app.pantopus.android.ui.sky

import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Every word the Sky's approximate places put on screen (phase A, contract section 10): the Moment Post sheet and the
 * Pulse composer's place line. Kept in one place so a change of words is one edit. Drawn only while the server answers
 * `sky: true`.
 */
object SkyWords {
    // The place line

    /** "Around Washougal, WA". */
    fun floatingOver(area: String): String = "Around $area"

    /** "At Esther Short Park". */
    fun at(place: String): String = "At $place"

    const val AREA = "Area"
    const val EXACT = "Exact"
    const val PIN_AT_PLACE = "Pin it at a place"
    const val PIN_AT_PLACE_HINT = "Pick a park, a shop or a venue nearby"
    const val CHANGE = "Change"
    const val PIN_NOT_AT_HOME = "Not available at home"
    const val NO_PLACE_HERE = "No place to pin near here"

    // At home

    const val HOME_TITLE = "You're at home, so this shows only the area"
    const val HOME_BODY = "A Moment made at home never shows the spot. Photos can still show where you are."

    // Elevation

    /** "About 4,400 ft above sea level": a floating Moment's height, rounded to 100 ft. */
    fun aboutHeight(feet: Int): String {
        val number = NumberFormat.getIntegerInstance()
        return if (feet < 0) "About ${number.format(-feet)} ft below sea level" else "About ${number.format(feet)} ft above sea level"
    }

    /** "About 4,400 ft": a floating Moment's height where it is shown. */
    fun aboutFeet(feet: Int): String = "About ${NumberFormat.getIntegerInstance().format(feet)} ft"

    const val HEIGHT_NOT_AT_HOME = "Not shown at home"

    // Share later

    const val SHARE_LATER = "Share later"
    const val SHARE_LATER_HINT = "Hold it until a time you pick"

    /** "Shares at 6:40 pm". */
    fun sharesAt(at: Instant): String = "Shares at ${time(at)}"

    /** The Post button: "Share at 6:40 pm · shows for 24 hours". */
    fun shareAtButton(
        at: Instant,
        hours: Int,
    ): String = "Share at ${time(at)} · shows for ${if (hours == 1) "1 hour" else "$hours hours"}"

    /** After posting: "Your Moment shares at 6:40 pm." */
    fun scheduledNotice(at: Instant): String = "Your Moment shares at ${time(at)}."

    const val SHARE_TIME_PASSED = "It's past 7 pm, so Tonight at 8 isn't on offer. Pick another time."

    // The Pulse composer

    /** An address or a bare photo: the post floats. */
    const val PHOTO_FLOATS = "Your photo was taken here. The post shows only the area."

    // Your row on the Moments map

    /** The row's title when it holds only your Moments waiting to share. */
    const val SCHEDULED_ROW_TITLE = "Sharing later"
    const val DELETE_SCHEDULED_TITLE = "Delete this Moment?"
    const val DELETE_SCHEDULED_BODY = "It hasn't shared yet, so nobody has seen it."
    const val DELETE = "Delete"
    const val COULD_NOT_DELETE = "Couldn't delete that Moment. Try again."

    // A Moment shared later

    const val EARLIER_TODAY = "Earlier today"
    const val YESTERDAY = "Yesterday"

    /** "6:40 pm" in the phone's time zone. */
    fun time(at: Instant): String =
        DateTimeFormatter
            .ofPattern("h:mm a", Locale.US)
            .withZone(ZoneId.systemDefault())
            .format(at)
            .replace("AM", "am")
            .replace("PM", "pm")
}
