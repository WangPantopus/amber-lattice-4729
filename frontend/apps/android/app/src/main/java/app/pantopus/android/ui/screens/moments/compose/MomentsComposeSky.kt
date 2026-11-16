package app.pantopus.android.ui.screens.moments.compose

import app.pantopus.android.data.api.models.moments.MomentShareLaterDto
import app.pantopus.android.ui.sky.SkyWords
import java.time.Instant

/*
 * The Sky's approximate places on the Post sheet (phase A, contract section 10.1), only while the place preview answers
 * `sky: true`: a Moment floats over its area by default ("Around Washougal, WA"); "Pin it at a place" pins it at
 * a public place picked by name; at home it always floats and says so; "Share later" holds it until a time picked. The
 * server decides again when it's posted. With no `sky` in the answer nothing here applies and the sheet is the one from
 * before.
 */

/** The preview answered `sky: true`: the sheet draws the Sky's rows. */
val MomentsComposeUiState.sky: Boolean get() = place?.sky == true

/**
 * It pins at a public place: the switch is on, the spot isn't home, and there's a place (the one picked in the place
 * picker, else the one naming the spot).
 */
val MomentsComposeUiState.pinsHere: Boolean
    get() = sky && pinsAtPlace && place?.canPin == true && !noLocationOn && (venue != null || place?.skyPlace != null)

/** It floats over its area: under the Sky unless it pins at a place; before it, "Show the area instead". */
val MomentsComposeUiState.floats: Boolean get() = if (sky) !pinsHere else showArea

/** The place's name while it pins at one: "Esther Short Park". */
val MomentsComposeUiState.skyPlaceName: String? get() = if (pinsHere) venue?.name ?: place?.skyPlace?.label else null

/** At home, under the Sky: the blue note, the home icon, and "Pin it at a place" greyed out. */
val MomentsComposeUiState.skyAtHome: Boolean get() = sky && place?.atHome == true && !noLocationOn

/**
 * The Sky at home: "Show elevation" stays on the sheet, greyed out, "Not shown at home" (no reading is taken there, so
 * none is needed).
 */
val MomentsComposeUiState.greysHeight: Boolean get() = skyAtHome

/** The place row's words under the Sky: "At Esther Short Park", else "Around Washougal, WA". */
val MomentsComposeUiState.skyLine: String
    get() = skyPlaceName?.let(SkyWords::at) ?: SkyWords.floatingOver(place?.area?.label ?: place?.areaLabel ?: "this area")

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

/** The place picker lists only places that can take a pin: under the Sky, never a school or a preschool (call C9). */
fun MomentsComposeUiState.canPinAt(category: String?): Boolean = !sky || category !in NOT_PINNABLE

private val NOT_PINNABLE = setOf("School", "Preschool")
private const val HOUR_S = 3600L

/**
 * The Sky's "Pin it at a place" switched: on uses the place that names the spot, else opens the place picker (a place
 * picked there turns it on); off, the Moment floats again.
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

/** The place row shows the floating icon (a dashed circle with a dot in it): a floating Moment, not at home. */
val MomentsComposeUiState.showsFloatingIcon: Boolean get() = sky && floats && !noLocationOn && !skyAtHome

/** The Sky's rows on the Post sheet: "Pin it at a place" switched, "Share later" switched, one of its times picked. */
data class MomentsSkyActions(
    val onPinAtPlace: (Boolean) -> Unit = {},
    val onShareLater: (Boolean) -> Unit = {},
    val onShareLaterChoice: (String) -> Unit = {},
)
