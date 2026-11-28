package app.pantopus.android.ui.screens.feed.living

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.living.LivingCompass
import app.pantopus.android.data.location.LocationProvider
import app.pantopus.android.data.pulse.PulseReinventedFeature
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** The switch and the phone's place, for the compass at the shutter (CONTRACT 9h). */
@HiltViewModel
class LivingCompassViewModel
    @Inject
    constructor(
        feature: PulseReinventedFeature,
        private val location: LocationProvider,
    ) : ViewModel() {
        val on: StateFlow<Boolean> = feature.on

        fun place(): Pair<Double, Double>? = location.cachedCoordinate()?.let { it.latitude to it.longitude }
    }

/**
 * While the camera is up: the compass reads only while `pulse_reinvented` is on for the person, and stops when the
 * camera goes or the switch reads off. With the switch off, or on a phone with no rotation sensor, nothing starts.
 */
@Composable
fun LivingCompassWatch(viewModel: LivingCompassViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val on by viewModel.on.collectAsStateWithLifecycle()
    DisposableEffect(on) {
        val place = if (on) viewModel.place() else null
        LivingCompass.watch(context.applicationContext, on, place?.first, place?.second)
        onDispose { LivingCompass.stop() }
    }
}
