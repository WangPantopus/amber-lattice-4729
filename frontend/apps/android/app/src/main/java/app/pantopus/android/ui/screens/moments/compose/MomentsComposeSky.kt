package app.pantopus.android.ui.screens.moments.compose

import app.pantopus.android.data.api.models.moments.MomentShareLaterDto
import app.pantopus.android.ui.screens.moments.map.metersBetween
import app.pantopus.android.ui.sky.SkyWords
import java.time.Instant

/*
 * The Sky's places on the Post sheet, only while the place preview answers `sky: true` (founder 2026-11-17): a Moment
 * is where it was taken; "Pin it at a place" pins it at a public place close by, picked by name; at home it shows only
 * its area ("Around Washougal, WA") and says so; "Share later" holds it until a time picked. The server decides again
 * when it's posted. With no `sky` in the answer nothing here applies and the sheet is the one from before.
 */

/** The preview answered `sky: true`: the sheet draws the Sky's rows. */
val MomentsComposeUiState.sky: Boolean get() = place?.sky == true

/**
 * It pins at a public place: the switch is on, the spot isn't home, and there's a place (the one picked in the place
 * picker, else the one naming the spot).
 */
val MomentsComposeUiState.pinsHere: Boolean
    get() = sky && pinsAtPlace && place?.canPin == true && !noLocationOn && (venue != null || place?.skyPlace != null)

/** It shows only its area: under the Sky at home, where it never shows the spot; before it, "Show the area instead". */
val MomentsComposeUiState.floats: Boolean get() = if (sky) skyAtHome else showArea

/** The place's name while it pins at one: "Esther Short Park". */
val MomentsComposeUiState.skyPlaceName: String? get() = if (pinsHere) venue?.name ?: place?.skyPlace?.label else null

/** At home, under the Sky: the blue note, the home icon, and "Pin it at a place" greyed out. */
val MomentsComposeUiState.skyAtHome: Boolean get() = sky && place?.atHome == true && !noLocationOn

/**
 * The Sky at home: "Show elevation" stays on the sheet, greyed out, "Not shown at home" (no reading is taken there, so
 * none is needed).
 */
val MomentsComposeUiState.greysHeight: Boolean get() = skyAtHome

/**
 * The place row's words under the Sky: "At Esther Short Park"; at home "Around Washougal, WA"; else the name of where
 * it was taken.
 */
val MomentsComposeUiState.skyLine: String
    get() =
        skyPlaceName?.let(SkyWords::at)
            ?: if (floats) {
                SkyWords.floatingOver(place?.area?.label ?: place?.areaLabel ?: "this area")
            } else {
                place?.placeLabel?.takeIf { it.isNotBlank() } ?: "Where you are"
            }

/**
 * Where the sheet's map shows a venue picked for a Moment taken at [latitude], [longitude]: at the venue, unless, under
 * the Sky, its own point is farther off than a place may be picked (the middle of a big park the photo was taken in).
 * Then the place names the Moment and the pin stays where it was taken, as the server keeps it.
 */
fun MomentsComposeUiState.venuePoint(
    latitude: Double,
    longitude: Double,
): Pair<Double, Double>? =
    pickedVenue?.let { picked ->
        val far = sky && metersBetween(latitude, longitude, picked.latitude, picked.longitude) > pickWithinM
        if (far) latitude to longitude else picked.latitude to picked.longitude
    }

/** The "Share later" times on offer now, from the preview. */
val MomentsComposeUiState.shareLaterChoices: List<MomentShareLaterDto> get() = if (sky) place?.shareLater.orEmpty() else emptyList()

/** The choice picked, while it's still on offer. */
val MomentsComposeUiState.shareLaterChoice: MomentShareLaterDto?
    get() = shareLaterKey?.let { key -> shareLaterChoices.firstOrNull { it.key == key } }

/** When it would share: an hour or three from now, or the evening's time the server gave. */
val MomentsComposeUiState.sharesAt: Instant?
    get() =
        shareLaterChoice?.let { choice ->
            when (choice.key) {
                "1h" -> Instant.now().plusSeconds(HOUR_S)
                "3h" -> Instant.now().plusSeconds(3 * HOUR_S)
                else -> choice.at?.let { runCatching { Instant.parse(it) }.getOrNull() }
            }
        }

private const val HOUR_S = 3600L

/**
 * The Sky's "Pin it at a place" switched: on uses the place that names the spot, else opens the place picker (a place
 * picked there turns it on); off, the Moment is where it was taken again.
 */
fun MomentsComposeUiState.withPinAtPlace(on: Boolean): MomentsComposeUiState =
    when {
        !on -> copy(pinsAtPlace = false, venue = null, notice = null)
        place?.canPin != true -> this
        place?.skyPlace != null -> copy(pinsAtPlace = true, notice = null)
        else -> copy(findingPlace = canFindPlace, notice = null)
    }

/** A venue picked in the place picker names the Moment; under the Sky it also turns "Pin it at a place" on. */
fun MomentsComposeUiState.withVenue(picked: MomentVenue): MomentsComposeUiState =
    copy(venue = picked, placeKey = null, findingPlace = false, pinsAtPlace = sky)

/** The Sky's "Share later" switched: on picks the first time on offer, off posts now. */
fun MomentsComposeUiState.withShareLater(on: Boolean): MomentsComposeUiState =
    copy(shareLaterKey = if (on) shareLaterChoices.firstOrNull()?.key else null)

/** The server said no to a Sky choice: no public place to pin at here (the switch goes back off), or a time gone by. */
fun MomentsComposeUiState.skyRefused(code: String?): MomentsComposeUiState =
    if (code == "NO_PLACE_HERE") {
        copy(pinsAtPlace = false, venue = null, notice = SkyWords.NO_PLACE_HERE)
    } else {
        copy(notice = SkyWords.SHARE_TIME_PASSED)
    }

/** The Sky's rows on the Post sheet: "Pin it at a place" switched, "Share later" switched, one of its times picked. */
data class MomentsSkyActions(
    val onPinAtPlace: (Boolean) -> Unit = {},
    val onShareLater: (Boolean) -> Unit = {},
    val onShareLaterChoice: (String) -> Unit = {},
)
