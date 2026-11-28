package app.pantopus.android.data.api.models.moments

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * "Pulse, reinvented" phase 0 step 3: the stamps Pantopus checked (CONTRACT section 2). The author places them; the
 * server fills every value when the Moment is posted, so nobody can type one. Only while `pulse_reinvented` is on for
 * the caller does the server read or send any of this; today's screens never see it.
 */

/** The seven kinds, in the tray's order (CONTRACT 2). */
object MomentStampKinds {
    const val POSTMARK = "postmark"
    const val WEATHER = "weather"
    const val ELEVATION = "elevation"
    const val PLACE = "place"
    const val TIME = "time"
    const val SUNSET = "sunset"
    const val HOME_DISTANCE = "home_distance"

    val ALL = listOf(POSTMARK, WEATHER, ELEVATION, PLACE, TIME, SUNSET, HOME_DISTANCE)
}

/**
 * Where a stamp sits (CONTRACT 2b): its centre on the picture itself, 0 to 1 across and down from the top left (as
 * `MomentMarks` places text and drawings; for a text card, on the card), its size (0.25 to 4; 1 is 96/402 of the
 * picture's drawn width for the postmark and 34/402 of it tall for a chip) and its turn in degrees, clockwise.
 */
@JsonClass(generateAdapter = true)
data class MomentStampPlacement(
    val kind: String,
    val x: Double,
    val y: Double,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
)

/**
 * A stamp's value as the server filled it. Every field is optional: each kind carries its own few (the postmark its
 * place, date, time and weather; the weather stamp its own `temp_f`, `kind` and `label`; the rest a `label`).
 */
@JsonClass(generateAdapter = true)
data class MomentStampValueDto(
    /** The postmark's town ("Camas, WA"); the place stamp uses [label]. */
    val place: String? = null,
    @Json(name = "date_label") val dateLabel: String? = null,
    @Json(name = "time_label") val timeLabel: String? = null,
    /** The postmark's weather. */
    val weather: MomentWeatherDto? = null,
    /** What the stamp reads as is: "Lacamas Lake", "4:41 PM", "Sunset in 12 min", "100+ mi from home", "180 ft". */
    val label: String? = null,
    /** The weather stamp's own fields (its value is the weather itself). */
    @Json(name = "temp_f") val tempF: Double? = null,
    val kind: String? = null,
)

/** A placed stamp with the value the server filled (CONTRACT 2c). A part the app can't read leaves the stamp out. */
@JsonClass(generateAdapter = true)
data class MomentStampDto(
    val kind: String? = null,
    val x: Double? = null,
    val y: Double? = null,
    val scale: Double? = null,
    val rotation: Double? = null,
    val value: MomentStampValueDto? = null,
) {
    /** Where it sits, or null for a kind this app doesn't know or a stamp missing where it sits. */
    val placement: MomentStampPlacement?
        get() {
            val kind = kind?.takeIf { it in MomentStampKinds.ALL } ?: return null
            return MomentStampPlacement(kind, x ?: return null, y ?: return null, scale ?: 1.0, rotation ?: 0.0)
        }
}

/**
 * What the Studio's tray shows before posting (CONTRACT 2a, `POST /api/moments/place-preview` with `stamps: true`):
 * each kind's value for a Moment posted at this spot now, null where the server can't give one here. The elevation is
 * the phone's own reading, so it isn't here.
 */
@JsonClass(generateAdapter = true)
data class MomentStampsPreviewDto(
    val postmark: MomentStampValueDto? = null,
    val weather: MomentStampValueDto? = null,
    val place: MomentStampValueDto? = null,
    val time: MomentStampValueDto? = null,
    val sunset: MomentStampValueDto? = null,
    @Json(name = "home_distance") val homeDistance: MomentStampValueDto? = null,
) {
    /** The kinds with a value here, by kind. */
    val values: Map<String, MomentStampValueDto>
        get() =
            listOfNotNull(
                postmark?.let { MomentStampKinds.POSTMARK to it },
                weather?.let { MomentStampKinds.WEATHER to it },
                place?.let { MomentStampKinds.PLACE to it },
                time?.let { MomentStampKinds.TIME to it },
                sunset?.let { MomentStampKinds.SUNSET to it },
                homeDistance?.let { MomentStampKinds.HOME_DISTANCE to it },
            ).toMap()
}

/**
 * The author's 15-minute edit (CONTRACT 3, `PATCH /api/moments/:id`): only what changed is sent (a field left null is
 * left out); a caption of "" clears it.
 */
@JsonClass(generateAdapter = true)
data class MomentEditBody(
    val caption: String? = null,
    val stamps: List<MomentStampPlacement>? = null,
    val audience: String? = null,
    /** The whole new list of people the caption mentions (CONTRACT 7h); left out when it didn't change. */
    val mentions: List<String>? = null,
)

/** The tray's request: today's place-preview body, plus `stamps: true` (sent only by the Studio). */
@JsonClass(generateAdapter = true)
data class MomentStampsPreviewBody(
    val latitude: Double,
    val longitude: Double,
    val stamps: Boolean = true,
)

/** The tray's answer: only its `stamps` are read (the rest is today's place-preview answer). */
@JsonClass(generateAdapter = true)
data class MomentStampsPreviewResponse(
    val stamps: MomentStampsPreviewDto? = null,
)
