package app.pantopus.android.ui.screens.place.today

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.models.saved_places.AroundYouItemDto
import app.pantopus.android.data.api.models.saved_places.AroundYouSectionDto
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.screens.root.ScrollAwayHeaderPage
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlin.math.roundToLong

/*
 * Today's two halves (founder decision 2026-11-14): "At home" is Today as it was; "Around you" lists local headlines
 * for the same place, each the outlet's own with its name, opened at the outlet. The switch is the big two-part one
 * Pulse draws for List | Map, and it shows only when the server has something for this place, so an area without
 * local sources sees Today unchanged. Parity twin of iOS `TodayAroundYou.swift`.
 */

/** Something to show for this place: Today offers the switch. */
val AroundYouDto?.showsSwitch: Boolean
    get() = this != null && available && sections.isNotEmpty()

/** The big two-part switch under Today's title, drawn as Pulse's List | Map. */
@Composable
fun TodayHalfSwitch(
    active: TodayHalf,
    onSelect: (TodayHalf) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.appSurfaceSunken)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(Radii.pill))
                .padding(3.dp)
                .testTag("todayHalfToggle")
                .selectableGroup(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TodayHalf.entries.forEach { half ->
            val selected = half == active
            val tint = if (selected) PantopusColors.appTextInverse else PantopusColors.appTextSecondary
            Row(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 40.dp)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(if (selected) PantopusColors.primary600 else PantopusColors.appSurfaceSunken)
                        .selectable(selected = selected, role = Role.RadioButton) { onSelect(half) }
                        .testTag("todayHalfSegment_${half.key}"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                PantopusIconImage(icon = half.icon, contentDescription = null, size = 17.dp, tint = tint)
                Text(text = half.label, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = tint)
            }
        }
    }
}

/** The Around you page: the sections the server sends, each a card of rows. */
@Composable
fun TodayAroundYouPage(
    page: AroundYouDto,
    top: Dp,
    nowMs: Long,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val open: (String) -> Unit = { link ->
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(link))
        } catch (_: ActivityNotFoundException) {
            // No browser on this phone: the headline stays readable.
        }
    }
    val scroll = rememberScrollState()
    ScrollAwayHeaderPage(scroll)
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(top = top)
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp, bottom = 40.dp)
                .testTag("aroundYouPanel"),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        page.area?.let { area ->
            Text(
                "From local news outlets around $area. Each headline opens the story where it was published.",
                fontSize = 13.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
        page.sections.forEach { section -> AroundYouSection(section, nowMs, open) }
    }
}

@Composable
private fun AroundYouSection(
    section: AroundYouSectionDto,
    nowMs: Long,
    open: (String) -> Unit,
) {
    Column(
        modifier = Modifier.testTag("aroundYouSection_${section.id}"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            section.title.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.77.sp,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(horizontal = 4.dp).semantics { heading() },
        )
        Column(modifier = Modifier.fillMaxWidth().placeCard()) {
            section.items.forEachIndexed { index, item ->
                if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorderSubtle))
                AroundYouRow(item, nowMs, open)
            }
        }
    }
}

@Composable
private fun AroundYouRow(
    item: AroundYouItemDto,
    nowMs: Long,
    open: (String) -> Unit,
) {
    val link = item.url?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
    // A story says when it was first seen; a tip (no link) is not news and carries no time.
    val meta = listOfNotNull(item.source, link?.let { seenAgo(item.seenAt, nowMs) }).joinToString(" · ")
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .then(
                    if (link != null) {
                        Modifier.clickable(
                            role = Role.Button,
                            onClickLabel = "Open the story at ${item.source ?: "its outlet"}",
                        ) { open(link) }
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .testTag("aroundYouItem"),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            if (meta.isNotEmpty()) Text(meta, fontSize = 12.sp, color = PantopusColors.appTextSecondary)
        }
        if (link != null) {
            PantopusIconImage(
                icon = PantopusIcon.ExternalLink,
                contentDescription = null,
                size = 16.dp,
                tint = PantopusColors.appTextMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

private const val MINUTES_PER_HOUR = 60
private const val HOURS_PER_DAY = 24
private const val SECONDS_PER_MINUTE = 60.0

/** "3 hr ago", "Yesterday", "2 days ago": how long since the story was first seen; null when the time can't be read. */
internal fun seenAgo(
    iso: String,
    nowMs: Long,
): String? {
    val seen =
        try {
            Instant.parse(iso)
        } catch (_: DateTimeParseException) {
            return null
        }
    val minutes =
        (Duration.between(seen, Instant.ofEpochMilli(nowMs)).seconds / SECONDS_PER_MINUTE).roundToLong().coerceAtLeast(0)
    val hours = (minutes / MINUTES_PER_HOUR.toDouble()).roundToLong()
    val days = (hours / HOURS_PER_DAY.toDouble()).roundToLong()
    return when {
        minutes < 2 -> "Just now"
        minutes < MINUTES_PER_HOUR -> "$minutes min ago"
        hours < HOURS_PER_DAY -> "$hours hr ago"
        days == 1L -> "Yesterday"
        else -> "$days days ago"
    }
}
