@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.viewer

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.plans.PlanLocationResolver
import app.pantopus.android.data.pulse.StudioRepository
import app.pantopus.android.ui.screens.moments.studio.takesEveryTouch
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * Guess the spot in the viewer ("Pulse, reinvented" step 8; CONTRACT 5), as on iPhone (`MomentsGuessSpot.swift`). Only
 * while the viewer is opened with the switch on: the server leaves a guess-the-spot Moment's spot out until the reader
 * guessed (no place, no point, no place stamps) and says `guess` on it. Until they guess, the viewer holds still and
 * offers "Where is this? Drop a pin"; a map takes one pin, and the answer says how far off it was ("1.2 mi off"), then the
 * Moment shows in full. Its author sees how many guessed. Distance only: no points, no ranks.
 */

/** A guess-the-spot Moment someone else made that the reader hasn't guessed yet: the viewer holds still on it. */
fun MomentDto.guessWaits(mine: Boolean): Boolean = !mine && guess != null && guess.mine == null

/** Where the guess map starts, and the one guess. */
@HiltViewModel
class MomentGuessViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
        private val locations: PlanLocationResolver,
    ) : ViewModel() {
        /** Where the person is (their last fix, else their home), never anywhere the Moment says. */
        suspend fun start(): LatLng? = locations.resolve(waitForFix = false)?.let { LatLng(it.latitude, it.longitude) }

        /** Sends the guess; [onDone] gets how far off it was and the Moment in full, or the words of a refusal. */
        fun send(
            momentId: String,
            at: LatLng,
            onDone: (GuessAnswer) -> Unit,
        ) {
            viewModelScope.launch {
                onDone(
                    when (val result = studio.guess(momentId, at.latitude, at.longitude)) {
                        is NetworkResult.Success ->
                            result.data.moment?.let { GuessAnswer.Answered(result.data.guess?.label.orEmpty(), it) }
                                ?: GuessAnswer.Refused("Couldn't send your guess. Try again.")
                        is NetworkResult.Failure -> GuessAnswer.Refused(result.error.guessWords())
                    },
                )
            }
        }
    }

sealed interface GuessAnswer {
    /** How far off ("1.2 mi off") and the Moment now in full. */
    data class Answered(
        val label: String,
        val moment: MomentDto,
    ) : GuessAnswer

    data class Refused(
        val words: String,
    ) : GuessAnswer
}

private fun NetworkError.guessWords(): String =
    when (serverCode) {
        "MOMENT_ENDED" -> "This Moment has ended."
        "MOMENT_OWN" -> "That's your own Moment."
        else -> if (this is NetworkError.Transport) message else "Couldn't send your guess. Try again."
    }

/**
 * The guess pill under the header: "Where is this? Drop a pin" before the reader guessed (it opens the map),
 * "1.2 mi off · 4 guesses" after, and "Guess the spot · 4 guesses" on one's own. Nothing on any other Moment.
 */
@Composable
fun MomentGuessPill(
    moment: MomentDto,
    mine: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val guess = moment.guess ?: return
    val count = if (guess.count == 1) "1 guess" else "${guess.count} guesses"
    val open = guess.mine == null && !mine
    val words =
        when {
            mine -> "Guess the spot · $count"
            open -> "Where is this? Drop a pin"
            else -> "${guess.mine?.label.orEmpty()} · $count"
        }
    Row(
        modifier =
            modifier
                .height(34.dp)
                .clip(RoundedCornerShape(17.dp))
                .background(if (open) PantopusColors.primary600 else PantopusColors.momentCaptionPill)
                .then(if (open) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                .padding(horizontal = 12.dp)
                .testTag("moments.viewer.guess")
                .clearAndSetSemantics {
                    contentDescription = words
                    if (open) role = Role.Button
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 15.dp, strokeWidth = 2.2f, tint = Color.White)
        Text(text = words, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/**
 * The map that takes the one guess: tap where you think it was, then Guess. The answer shows how far off, and the spot
 * itself (the green pin) beside the guess; Done closes it with the Moment in full ([onGuessed]).
 */
@Composable
fun MomentGuessSheet(
    moment: MomentDto,
    onGuessed: (MomentDto) -> Unit,
    onClose: () -> Unit,
    guesses: MomentGuessViewModel = hiltViewModel(),
) {
    var pin by remember { mutableStateOf<LatLng?>(null) }
    var sending by remember { mutableStateOf(false) }
    var answer by remember { mutableStateOf<GuessAnswer.Answered?>(null) }
    var refused by remember { mutableStateOf<String?>(null) }
    val camera = rememberCameraPositionState { position = CameraPosition.fromLatLngZoom(LatLng(39.5, -98.35), 3f) }
    LaunchedEffect(moment.id) { guesses.start()?.let { camera.position = CameraPosition.fromLatLngZoom(it, 11f) } }
    val finish = { answer?.let { onGuessed(it.moment) } ?: onClose() }
    BackHandler { finish() }
    Box(modifier = Modifier.fillMaxSize().background(PantopusColors.appSurface).takesEveryTouch().testTag("moments.viewer.guessMap")) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false, myLocationButtonEnabled = false),
            onMapClick = { if (answer == null && !sending) pin = it },
        ) {
            pin?.let { GuessMarker(it, title = "Your guess", green = false) }
            answer?.moment?.let { full ->
                val lat = full.latitude
                val lng = full.longitude
                if (lat != null && lng != null) GuessMarker(LatLng(lat, lng), title = "Where it was taken", green = true)
            }
        }
        GuessClose(onClick = finish, modifier = Modifier.statusBarsPadding().padding(start = Spacing.s4, top = Spacing.s3))
        GuessPanel(
            answer = answer,
            refused = refused,
            canGuess = pin != null && !sending,
            sending = sending,
            modifier = Modifier.align(Alignment.BottomCenter),
            onGuess = {
                val at = pin ?: return@GuessPanel
                sending = true
                refused = null
                guesses.send(moment.id, at) { result ->
                    sending = false
                    when (result) {
                        is GuessAnswer.Answered -> answer = result
                        is GuessAnswer.Refused -> refused = result.words
                    }
                }
            },
            onDone = finish,
        )
    }
}

@Composable
private fun GuessMarker(
    at: LatLng,
    title: String,
    green: Boolean,
) {
    val state = rememberMarkerState(key = "${at.latitude},${at.longitude},$green", position = at)
    Marker(
        state = state,
        title = title,
        icon = BitmapDescriptorFactory.defaultMarker(if (green) BitmapDescriptorFactory.HUE_GREEN else BitmapDescriptorFactory.HUE_AZURE),
    )
}

@Composable
private fun GuessClose(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(PantopusColors.momentCameraChip)
                .clickable(role = Role.Button, onClick = onClick)
                .testTag("moments.viewer.guessClose")
                .clearAndSetSemantics {
                    contentDescription = "Close"
                    role = Role.Button
                },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 22.dp, strokeWidth = 2.2f, tint = Color.White)
    }
}

/** The bottom of the guess map: what to do, then Guess; after the guess, how far off and Done. */
@Composable
private fun GuessPanel(
    answer: GuessAnswer.Answered?,
    refused: String?,
    canGuess: Boolean,
    sending: Boolean,
    onGuess: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(PantopusColors.studioBar)
                .navigationBarsPadding()
                .padding(Spacing.s4),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        val title = answer?.label?.ifBlank { null } ?: "Where is this?"
        val line =
            when {
                answer != null -> "The green pin is where it was taken."
                refused != null -> refused
                else -> "Tap the map where you think it was taken. You get one guess."
            }
        Text(
            text = title,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.testTag("moments.viewer.guessTitle"),
        )
        Text(text = line, color = PantopusColors.studioPillSecondary, fontSize = 14.sp)
        val label =
            if (answer != null) {
                "Done"
            } else if (sending) {
                "Sending…"
            } else {
                "Guess"
            }
        val enabled = answer != null || canGuess
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .alpha(if (enabled || sending) 1f else 0.5f)
                    .clip(RoundedCornerShape(26.dp))
                    .background(PantopusColors.primary600)
                    .clickable(enabled = enabled, role = Role.Button, onClick = if (answer != null) onDone else onGuess)
                    .testTag("moments.viewer.guessSend")
                    .clearAndSetSemantics {
                        contentDescription = label
                        role = Role.Button
                    },
            contentAlignment = Alignment.Center,
        ) {
            Text(text = label, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
