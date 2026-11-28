@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.reinvented.ReinventedMagazineItemDto
import app.pantopus.android.data.api.models.reinvented.ReinventedMagazinePageDto
import app.pantopus.android.ui.screens.moments.components.MomentFace
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A circle's weekly magazine (CONTRACT 8d), inside the reach dial: the week's pages as the server lays them out (cover,
 * one, two, grid), who posted how much, and "An earlier week" / "A later week" (up to 8 back). A tap opens the Moment
 * or post once the dial has closed. Opening it marks it read.
 */
@Composable
internal fun MagazinePage(
    circleId: String,
    ui: ReinventedCirclesUi,
    model: ReinventedCirclesViewModel,
    onPage: (DialPage) -> Unit,
    onOpen: (ReinventedMagazineItemDto) -> Unit,
) {
    LaunchedEffect(circleId) { model.magazine(circleId) }
    val magazine = ui.magazine
    PageTitle(magazine?.circle?.name ?: "This week's magazine", onBack = { onPage(DialPage.Circle(circleId)) })
    if (magazine == null) {
        Text(
            if (ui.magazineFailed) "The magazine didn't load." else "Laying out the week…",
            fontSize = 14.sp,
            color = PantopusColors.appTextSecondary,
        )
        return
    }
    val week = magazine.week
    week?.let { Text(weekWords(it.from, it.to), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText) }
    if (magazine.empty || magazine.pages.isEmpty()) {
        Text("Nothing from this circle this week.", fontSize = 14.sp, color = PantopusColors.appTextSecondary)
    }
    magazine.pages.forEach { page -> MagazineSpread(page, onOpen) }
    if (magazine.people.isNotEmpty()) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s3), verticalAlignment = Alignment.CenterVertically) {
            magazine.people.forEach { who ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    MomentFace(who.person, 24.dp)
                    Text("${who.count}", fontSize = 13.sp, color = PantopusColors.appTextSecondary)
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
        week?.from?.let { from ->
            TextButton(
                onClick = { model.magazine(circleId, dayBefore(from)) },
                modifier = Modifier.testTag("reinventedPulse.magazine.earlier"),
            ) {
                Text("An earlier week")
            }
        }
        week?.to?.let { to ->
            val later = dayAfter(to)
            if (later != null && !LocalDate.parse(later).isAfter(LocalDate.now())) {
                TextButton(onClick = { model.magazine(circleId, later) }, modifier = Modifier.testTag("reinventedPulse.magazine.later")) {
                    Text("A later week")
                }
            }
        }
    }
}

/** One page: a cover (one big), one, two side by side, or a grid of three across. */
@Composable
private fun MagazineSpread(
    page: ReinventedMagazinePageDto,
    onOpen: (ReinventedMagazineItemDto) -> Unit,
) {
    val across =
        when (page.layout) {
            "cover", "one" -> 1
            "two" -> 2
            else -> 3
        }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1), modifier = Modifier.testTag("reinventedPulse.magazine.${page.layout}")) {
        page.items.chunked(across).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s1)) {
                row.forEach { item -> MagazineTile(item, cover = page.layout == "cover", modifier = Modifier.weight(1f), onOpen = onOpen) }
                repeat(across - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun MagazineTile(
    item: ReinventedMagazineItemDto,
    cover: Boolean,
    modifier: Modifier,
    onOpen: (ReinventedMagazineItemDto) -> Unit,
) {
    val who = item.author?.firstName ?: item.author?.name ?: "Someone"
    Box(
        modifier =
            modifier
                .aspectRatio(if (cover) 1.25f else 0.8f)
                .clip(RoundedCornerShape(10.dp))
                .background(PantopusColors.appSurfaceRaised)
                .clickable(role = Role.Button) { onOpen(item) }
                .semantics(mergeDescendants = true) {
                    contentDescription = listOfNotNull(who, item.caption, "Kept after it faded".takeIf { item.ended }).joinToString(". ")
                }.testTag("reinventedPulse.magazine.item.${item.id}"),
    ) {
        item.thumbUrl?.let {
            AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        Column(
            modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().background(PantopusColors.momentCaptionPill).padding(6.dp),
        ) {
            Text(who, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
            item.caption?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 11.5.sp, color = Color.White, maxLines = if (cover) 2 else 1, overflow = TextOverflow.Ellipsis)
            }
            if (item.ended) Text("Kept after it faded", fontSize = 10.5.sp, color = Color.White)
        }
    }
}

/** "Nov 20 – Nov 26". */
private fun weekWords(
    from: String,
    to: String,
): String {
    val f = DateTimeFormatter.ofPattern("MMM d", Locale.US)
    return runCatching { "${LocalDate.parse(from).format(f)} – ${LocalDate.parse(to).format(f)}" }.getOrDefault("$from – $to")
}

/** The day before the shown week's first day: the server answers the week that holds it. */
private fun dayBefore(from: String): String? = runCatching { LocalDate.parse(from).minusDays(1).toString() }.getOrNull()

private fun dayAfter(to: String): String? = runCatching { LocalDate.parse(to).plusDays(1).toString() }.getOrNull()
