@file:Suppress("MagicNumber", "LongMethod")

package app.pantopus.android.ui.screens.moments.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusElevation
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.pantopusShadow
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapEffect
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MapsComposeExperimentalApi
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log2

/**
 * The Post sheet's small map, full screen (founder, 2026-11-24): a tap on the map opens it over the Post screen, with the
 * pin (or the area's circle) where the Moment will show, on a map that pans, zooms and turns, so the spot can be checked
 * before posting. The place as others will read it sits at the bottom, a button there brings the pin back to the middle,
 * and the back button at the top left (or Back) returns to the Post screen just as it was.
 */
@OptIn(MapsComposeExperimentalApi::class)
@Composable
internal fun MomentsPostFullMap(
    spot: PostMapSpot,
    avatarUrl: String?,
    placeLabel: String,
    placeKind: String,
    atHome: Boolean,
    onBack: () -> Unit,
) {
    BoxWithConstraints(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PantopusColors.appSurface)
                .testTag("moments.post.fullMap"),
    ) {
        val target = LatLng(spot.latitude, spot.longitude)
        val home = remember(spot, maxWidth) { CameraPosition.fromLatLngZoom(target, fullZoom(spot, maxWidth)) }
        val camera = rememberCameraPositionState { position = home }
        val scope = rememberCoroutineScope()
        var mapReady by remember { mutableStateOf(false) }
        val density = LocalDensity.current
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            uiSettings =
                MapUiSettings(
                    zoomControlsEnabled = false,
                    mapToolbarEnabled = false,
                    myLocationButtonEnabled = false,
                    // Its place is the top left, under the back button; the button at the bottom turns the map north again.
                    compassEnabled = false,
                ),
            onMapLoaded = { mapReady = true },
        ) {
            // The map is ready even when its tiles can't load (no Maps key on a dev machine): the pin shows anyway.
            MapEffect(Unit) { mapReady = true }
            if (spot.area) {
                Circle(
                    center = target,
                    radius = spot.discRadiusM ?: AREA_RADIUS_M,
                    fillColor = PantopusColors.primary600.copy(alpha = 0.16f),
                    strokeColor = PantopusColors.primary600.copy(alpha = 0.55f),
                    strokeWidth = with(density) { 1.5.dp.toPx() },
                )
            }
        }
        if (!spot.area) {
            // The pin moves with the map: placed from the camera in the layout step, so nothing recomposes as it moves.
            Layout(
                modifier = Modifier.fillMaxSize().clipToBounds(),
                content = { MomentsPostSelfPin(avatarUrl = avatarUrl) },
            ) { measurables, constraints ->
                val pin = measurables.first().measure(Constraints())
                layout(constraints.maxWidth, constraints.maxHeight) {
                    camera.position
                    val projection = camera.projection?.takeIf { mapReady } ?: return@layout
                    val point = projection.toScreenLocation(target)
                    pin.place(IntOffset(point.x - pin.width / 2, point.y - (pin.height * 55 / 56)))
                }
            }
        }
        RoundButton(
            icon = PantopusIcon.ChevronLeft,
            label = "Back. Returns to your post",
            tag = "moments.post.fullMap.back",
            iconSize = 24.dp,
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = Spacing.s4, top = Spacing.s2),
        )
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = Spacing.s4, end = Spacing.s4, bottom = Spacing.s3),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            RoundButton(
                icon = PantopusIcon.LocateFixed,
                label = if (spot.area) "Show the area" else "Show the pin",
                tag = "moments.post.fullMap.recenter",
                iconSize = 20.dp,
                onClick = { scope.launch { camera.animate(CameraUpdateFactory.newCameraPosition(home), 400) } },
            )
            PlaceCard(label = placeLabel, kind = placeKind, atHome = atHome)
        }
    }
}

@Composable
private fun RoundButton(
    icon: PantopusIcon,
    label: String,
    tag: String,
    iconSize: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(44.dp)
                .pantopusShadow(ButtonShadow, CircleShape)
                .clip(CircleShape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, CircleShape)
                .clickable(role = Role.Button, onClick = onClick)
                .testTag(tag)
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = iconSize, strokeWidth = 2.2f, tint = PantopusColors.appText)
    }
}

/** The place row's words: the name others will read, and "Exact" or "Area". */
@Composable
private fun PlaceCard(
    label: String,
    kind: String,
    atHome: Boolean,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .pantopusShadow(CardShadow, shape)
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(horizontal = Spacing.s4, vertical = 14.dp)
                .testTag("moments.post.fullMap.place")
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(
            icon = if (atHome) PantopusIcon.Home else PantopusIcon.MapPin,
            contentDescription = null,
            size = 18.dp,
            strokeWidth = 2.2f,
            tint = PantopusColors.primary600,
        )
        Text(
            text = label,
            fontSize = 15.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appText,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(text = kind, fontSize = 13.sp, color = PantopusColors.appTextSecondary)
    }
}

/**
 * The full map's zoom: an exact pin shows a few streets around it; an area (or the Sky's disc) fills about three quarters
 * of the screen's width.
 */
private fun fullZoom(
    spot: PostMapSpot,
    width: Dp,
): Float {
    if (!spot.area) return FULL_PIN_ZOOM
    val radiusM = spot.discRadiusM ?: AREA_RADIUS_M
    val radiusDp = width.value * 0.38
    return log2(EQUATOR_METERS_PER_DP * cos(spot.latitude * PI / 180.0) * radiusDp / radiusM).toFloat().coerceIn(3f, FULL_PIN_ZOOM)
}

/** How close the full map opens on an exact pin. */
private const val FULL_PIN_ZOOM = 16f

/** "Within about half a mile": how far from the real spot the server may place an area pin (0.55 mile). */
private const val AREA_RADIUS_M = 885.0

/** Meters per dp on the map at zoom 0 on the equator (256 dp tiles). */
private const val EQUATOR_METERS_PER_DP = 156_543.03392

private val ButtonShadow = PantopusElevation(Color.Black, 0.16f, 8.dp, 0.dp, 3.dp)
private val CardShadow = PantopusElevation(Color.Black, 0.14f, 14.dp, 0.dp, 4.dp)
