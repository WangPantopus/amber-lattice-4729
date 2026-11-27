@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.data.api.models.plans.PlanPinDto
import app.pantopus.android.data.api.models.reinvented.ReinventedStripResponse
import app.pantopus.android.ui.screens.moments.components.MomentStripFace
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing

/**
 * "Pulse, reinvented" phase 1, Alive right now (PHASE-1 §2 piece 6; CONTRACT 6c): over the list, a strip of tall
 * previews: Moments live from here with their weather, plans starting soon, and rings for people you know. A tap opens
 * the Moment in today's viewer, the plan in Plans, or the person's Moments. Nothing is drawn when the strip is empty.
 */
@Composable
internal fun ReinventedAliveStrip(
    strip: ReinventedStripResponse,
    actions: ReinventedStripActions,
) {
    if (strip.isEmpty) return
    Column(modifier = Modifier.fillMaxWidth().testTag("reinventedPulse.alive"), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            "Alive right now",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(horizontal = Spacing.s4).semantics { heading() },
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.s4),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            strip.liveHere.forEach { live -> LiveTile(live.moment) { actions.onOpenMoment(live.moment) } }
            strip.plansSoon.forEach { plan -> PlanTile(plan) { actions.onOpenPlan(plan.id) } }
            strip.people.forEach { ring -> PersonTile(ring) { actions.onOpenRing(ring) } }
        }
    }
}

@Composable
private fun Tile(
    spoken: String,
    tag: String,
    onClick: () -> Unit,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier =
            Modifier
                .size(width = 96.dp, height = 150.dp)
                .clip(shape)
                .border(1.dp, PantopusColors.appBorder, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics(mergeDescendants = true) { contentDescription = spoken }
                .testTag(tag),
    ) { content() }
}

@Composable
private fun LiveTile(
    moment: MomentDto,
    onClick: () -> Unit,
) {
    val who = moment.author.firstName ?: moment.author.name ?: "Someone"
    Tile("$who's Moment, live from here", "reinventedPulse.alive.moment.${moment.id}", onClick) {
        MomentPicture(moment, Modifier.fillMaxSize())
        Column(
            modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(PantopusColors.momentLiveOnStage))
                Text("Live", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            weatherWords(moment)?.let { words ->
                Text(
                    words,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** "31°F · Snow", from the Moment's weather stamp; null without one. */
private fun weatherWords(moment: MomentDto): String? {
    val weather = moment.weather ?: return null
    val temp = weather.tempF?.let { "${it.toInt()}°F" }
    return listOfNotNull(temp, weather.label?.takeIf { it.isNotBlank() }).joinToString(" · ").ifEmpty { null }
}

@Composable
private fun PlanTile(
    plan: PlanPinDto,
    onClick: () -> Unit,
) {
    val title = plan.title.orEmpty()
    Tile("Plan starting soon: $title", "reinventedPulse.alive.plan.${plan.id}", onClick) {
        Column(
            modifier = Modifier.fillMaxSize().background(PantopusColors.primary600).padding(Spacing.s2),
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            PantopusIconImage(
                icon = PantopusIcon.CalendarCheck,
                contentDescription = null,
                size = 20.dp,
                strokeWidth = 2.2f,
                tint = Color.White,
            )
            Text("Starting soon", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f))
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 4, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun PersonTile(
    ring: MomentRingDto,
    onClick: () -> Unit,
) {
    val who = ring.author.firstName ?: ring.author.name ?: "Someone"
    Tile("$who's Moments", "reinventedPulse.alive.person.${ring.id}", onClick) {
        Column(
            modifier = Modifier.fillMaxSize().background(PantopusColors.appSurface),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            MomentStripFace(author = ring.author, seen = ring.moments.map { it.seen }, label = who)
            Spacer(Modifier.size(Spacing.s1))
        }
    }
}
