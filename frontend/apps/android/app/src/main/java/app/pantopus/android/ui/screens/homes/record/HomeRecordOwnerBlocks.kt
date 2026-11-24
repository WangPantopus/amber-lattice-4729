package app.pantopus.android.ui.screens.homes.record

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.homerecord.HomeRecordBarsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordCardBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordNoticeBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPhotoYearsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordRowsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordTilesBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordTimelineBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordValueBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordYearPhoto
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

// The blocks of the owner's record (drawn screen `design/Owner.dc.html`); the lookup's are in HomeRecordBlocks.kt.

// ─── value ──────────────────────────────────────────────────

@Composable
internal fun ValueBlock(
    block: HomeRecordValueBlock,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier) {
        block.label?.takeIf { it.isNotBlank() }?.let {
            Text(
                it.uppercase(),
                fontSize = 11.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.07.em,
                color = PantopusColors.appTextSecondary,
            )
        }
        Text(
            block.value,
            fontSize = 36.sp,
            lineHeight = 42.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.02).em,
            color = PantopusColors.appText,
            modifier = Modifier.padding(top = Spacing.s1),
        )
        block.chip?.let { Box(Modifier.padding(top = 6.dp)) { RecordChip(it) } }
        ValueBars(block)
        SourceLine(block.source, Modifier.padding(top = 10.dp))
        block.estimate?.let { estimate ->
            Column(modifier = Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
                Spacer(Modifier.height(Spacing.s2))
                Row(
                    modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                    horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        estimate.label.orEmpty(),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Medium,
                        color = PantopusColors.appTextStrong,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        estimate.text.orEmpty(),
                        fontSize = 15.sp,
                        lineHeight = 21.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PantopusColors.appText,
                        textAlign = TextAlign.End,
                    )
                }
                EstimateTrack(estimate.low, estimate.high, estimate.mark)
                SourceLine(estimate.note, Modifier.padding(top = 2.dp))
            }
        }
    }
}

/** The county value by year: one bar a year, the newest darker, each year under its bar. */
@Composable
private fun ValueBars(block: HomeRecordValueBlock) {
    val bars = block.bars.orEmpty()
    val top = bars.maxOfOrNull { it.amount }?.takeIf { it > 0 }
    if (top != null) {
        Row(
            modifier =
                Modifier
                    .padding(top = Spacing.s4)
                    .fillMaxWidth()
                    .height(120.dp)
                    .semantics { contentDescription = block.label ?: block.value },
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            bars.forEachIndexed { index, bar ->
                val fraction = (bar.amount / top).toFloat().coerceIn(0f, 1f)
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight(fraction * BAR_TOP_FRACTION)
                        .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp, bottomStart = 2.dp, bottomEnd = 2.dp))
                        .background(if (index == bars.lastIndex) PantopusColors.recordBarCurrent else PantopusColors.primary200),
                )
            }
        }
        Row(modifier = Modifier.padding(top = 6.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            bars.forEach { bar ->
                Text(
                    bar.year,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                    color = PantopusColors.appTextMuted,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun EstimateTrack(
    low: Double?,
    high: Double?,
    mark: Double?,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth().height(14.dp)) {
        val width = maxWidth
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.appSurfaceSunken),
        )
        if (low != null && high != null && high > low) {
            val start = low.coerceIn(0.0, 1.0).toFloat()
            val end = high.coerceIn(0.0, 1.0).toFloat()
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = width * start)
                    .width(width * (end - start))
                    .height(8.dp)
                    .clip(RoundedCornerShape(Radii.pill))
                    .background(PantopusColors.primary200),
            )
        }
        mark?.let {
            Box(
                Modifier
                    .offset(x = width * it.coerceIn(0.0, 1.0).toFloat() - 2.dp)
                    .size(width = 4.dp, height = 14.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(PantopusColors.primary600),
            )
        }
    }
}

// ─── photo years ────────────────────────────────────────────

@Composable
internal fun PhotoYearsBlock(
    block: HomeRecordPhotoYearsBlock,
    modifier: Modifier,
) {
    val photos = block.photos.orEmpty().filter { it.imageUrl.isNotBlank() }
    if (photos.isEmpty()) return
    // Newest last; it shows first.
    var selected by rememberSaveable(block.id) { mutableIntStateOf(photos.lastIndex) }
    val shown = photos[selected.coerceIn(0, photos.lastIndex)]
    RecordCard(modifier = modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
            CardTitle(block.title.orEmpty(), Modifier.weight(1f))
            block.count?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 12.5.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
            }
        }
        Spacer(Modifier.height(Spacing.s3))
        RecordAerialPhoto(
            imageUrl = shown.imageUrl,
            outline = shown.outline,
            height = 216.dp,
            description = shown.label ?: shown.year,
            bottomStart = shown.label ?: shown.year,
            bottomStartDark = true,
        )
        if (photos.size > 1) {
            Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                photos.indices.chunked(YEAR_BUTTONS_PER_ROW).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                        row.forEach { index ->
                            YearButton(
                                photo = photos[index],
                                selected = index == selected,
                                onClick = { selected = index },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        repeat(YEAR_BUTTONS_PER_ROW - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
        SourceLine(block.note, Modifier.padding(top = 10.dp))
    }
}

@Composable
private fun YearButton(
    photo: HomeRecordYearPhoto,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier =
            modifier
                .clip(shape)
                .background(if (selected) PantopusColors.primary50 else PantopusColors.appSurface)
                .border(2.dp, if (selected) PantopusColors.primary600 else PantopusColors.appBorder, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = if (selected) "Showing ${photo.year}" else "Show ${photo.year}" }
                .testTag("homeRecord.year.${photo.year}"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RecordThumbnail(photo.imageUrl)
        Text(
            photo.year,
            fontSize = 12.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) PantopusColors.primary600 else PantopusColors.appTextStrong,
        )
    }
}

// ─── timeline ───────────────────────────────────────────────

@Composable
internal fun TimelineBlock(
    block: HomeRecordTimelineBlock,
    modifier: Modifier,
) {
    val items = block.items.orEmpty()
    RecordCard(modifier = modifier) {
        block.title?.takeIf { it.isNotBlank() }?.let { CardTitle(it, Modifier.padding(bottom = Spacing.s3)) }
        items.forEachIndexed { index, item ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                        .heightIn(min = 62.dp)
                        .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                Column(
                    modifier = Modifier.width(14.dp).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier
                            .padding(top = Spacing.s1)
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(if (item.strong) PantopusColors.home else PantopusColors.appSurface)
                            .border(2.dp, if (item.strong) PantopusColors.home else PantopusColors.appTextMuted, CircleShape),
                    )
                    if (index < items.lastIndex) {
                        Box(
                            Modifier
                                .padding(top = Spacing.s1)
                                .width(2.dp)
                                .weight(1f)
                                .background(PantopusColors.appBorder),
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f).padding(bottom = Spacing.s3), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                        Text(
                            item.title,
                            fontSize = 15.sp,
                            lineHeight = 21.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = PantopusColors.appText,
                            modifier = Modifier.weight(1f),
                        )
                        item.right?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                it,
                                fontSize = 15.sp,
                                lineHeight = 21.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (item.strong) PantopusColors.appText else PantopusColors.appTextMuted,
                            )
                        }
                    }
                    val line = item.line?.takeIf { it.isNotBlank() }
                    val mono = item.mono?.takeIf { it.isNotBlank() }
                    if (line != null || mono != null) {
                        Text(
                            buildAnnotatedString {
                                line?.let { append(it) }
                                if (line != null && mono != null) append(" · ")
                                mono?.let { withStyle(SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp)) { append(it) } }
                            },
                            fontSize = 12.5.sp,
                            lineHeight = 18.sp,
                            color = PantopusColors.appTextSecondary,
                        )
                    }
                }
            }
        }
        SourceLine(block.note)
    }
}

// ─── notice ─────────────────────────────────────────────────

@Composable
internal fun NoticeBlock(
    block: HomeRecordNoticeBlock,
    modifier: Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().recordCard().padding(Spacing.s4).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.primary50),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(PantopusIcon.History, null, size = 18.dp, strokeWidth = 2f, tint = PantopusColors.primary700)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            block.eyebrow?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it.uppercase(),
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.07.em,
                    color = PantopusColors.primary700,
                )
            }
            Text(block.title, fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            block.line?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 12.5.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
            }
        }
    }
}

// ─── rows ───────────────────────────────────────────────────

@Composable
internal fun RowsBlock(
    block: HomeRecordRowsBlock,
    open: (String) -> Unit,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier) {
        block.title?.takeIf { it.isNotBlank() }?.let { CardTitle(it) }
        block.lead?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 13.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary, modifier = Modifier.padding(top = 2.dp))
        }
        Spacer(Modifier.height(6.dp))
        val rows = block.rows.orEmpty()
        rows.forEachIndexed { index, row ->
            Row(
                modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(vertical = 6.dp).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    row.label,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                row.value?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        fontSize = if (row.mono) 14.sp else 13.5.sp,
                        lineHeight = 19.sp,
                        fontWeight = if (row.mono) FontWeight.Medium else FontWeight.Normal,
                        fontFamily = if (row.mono) FontFamily.Monospace else null,
                        color = if (row.mono) PantopusColors.appText else PantopusColors.appTextSecondary,
                        textAlign = TextAlign.End,
                        modifier = Modifier.widthIn(max = 220.dp),
                    )
                }
                RecordChip(row.chip)
            }
            if (index < rows.lastIndex) HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
        }
        block.action?.let {
            Spacer(Modifier.height(Spacing.s2))
            ActionButton(it, open, testTag = "homeRecord.block.${block.id}.action")
        }
        SourceLine(block.note, Modifier.padding(top = 10.dp))
    }
}

// ─── tiles ──────────────────────────────────────────────────

@Composable
internal fun TilesBlock(
    block: HomeRecordTilesBlock,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier) {
        block.title?.takeIf { it.isNotBlank() }?.let { CardTitle(it, Modifier.padding(bottom = 10.dp)) }
        val tiles = block.tiles.orEmpty()
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            tiles.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    pair.forEach { tile ->
                        Column(
                            modifier =
                                Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(Radii.lg))
                                    .background(PantopusColors.appSurfaceSunken)
                                    .padding(Spacing.s3)
                                    .semantics(mergeDescendants = true) {},
                            verticalArrangement = Arrangement.spacedBy(1.dp),
                        ) {
                            TileLabel(tile.label)
                            Text(
                                tile.value,
                                fontSize = 20.sp,
                                lineHeight = 26.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = (-0.015).em,
                                color = PantopusColors.appText,
                            )
                            tile.line?.takeIf { it.isNotBlank() }?.let {
                                Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PantopusColors.appTextSecondary)
                            }
                        }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        val rows = block.rows.orEmpty()
        if (rows.isNotEmpty()) Spacer(Modifier.height(6.dp))
        rows.forEachIndexed { index, row ->
            Row(
                modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(vertical = 6.dp).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(row.label, fontSize = 14.sp, color = PantopusColors.appTextSecondary, modifier = Modifier.weight(1f))
                Text(
                    row.value.orEmpty(),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = PantopusColors.appText,
                    textAlign = TextAlign.End,
                )
            }
            if (index < rows.lastIndex) HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
        }
        SourceLine(block.note, Modifier.padding(top = 6.dp))
    }
}

// ─── bars ───────────────────────────────────────────────────

@Composable
internal fun BarsBlock(
    block: HomeRecordBarsBlock,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier) {
        block.title?.takeIf { it.isNotBlank() }?.let { CardTitle(it, Modifier.padding(bottom = Spacing.s1)) }
        block.items.orEmpty().forEach { item ->
            val bar =
                when (item.tone) {
                    "high" -> PantopusColors.error
                    "mid" -> PantopusColors.warning
                    else -> PantopusColors.home
                }
            val ink =
                when (item.tone) {
                    "high" -> PantopusColors.error
                    "mid" -> PantopusColors.warning
                    else -> PantopusColors.appTextStrong
                }
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) {},
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    Text(
                        item.title,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PantopusColors.appText,
                        modifier = Modifier.weight(1f),
                    )
                    item.right?.takeIf { it.isNotBlank() }?.let {
                        Text(it, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium, color = ink)
                    }
                }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(PantopusColors.appSurfaceSunken),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(item.fill.coerceIn(0.0, 1.0).toFloat())
                            .height(6.dp)
                            .clip(RoundedCornerShape(Radii.pill))
                            .background(bar),
                    )
                }
                item.line?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PantopusColors.appTextMuted)
                }
            }
            HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
        }
        SourceLine(block.note, Modifier.padding(top = 10.dp))
    }
}

// ─── card ───────────────────────────────────────────────────

@Composable
internal fun CardBlock(
    block: HomeRecordCardBlock,
    open: (String) -> Unit,
    modifier: Modifier,
) {
    val rows = block.rows.orEmpty()
    RecordCard(modifier = modifier, spacing = Spacing.s2) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
            Text(
                block.title,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = (-0.01).em,
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            RecordChip(block.chip)
        }
        block.lead?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 13.5.sp, lineHeight = 19.sp, color = PantopusColors.appTextStrong)
        }
        if (rows.isNotEmpty()) {
            Column {
                rows.forEach { row ->
                    HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
                    Row(
                        modifier =
                            Modifier.fillMaxWidth().heightIn(
                                min = 46.dp,
                            ).padding(vertical = 6.dp).semantics(mergeDescendants = true) {},
                        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            row.label,
                            fontSize = 13.5.sp,
                            lineHeight = 19.sp,
                            color = PantopusColors.appTextSecondary,
                            modifier = Modifier.weight(1f),
                        )
                        row.value?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                it,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = PantopusColors.appText,
                                textAlign = TextAlign.End,
                            )
                        }
                    }
                }
            }
        }
        block.notes.orEmpty().filter { it.isNotBlank() }.forEach {
            Text(it, fontSize = 12.5.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
        }
        SourceLine(block.source)
        block.action?.let {
            // A card that is only its words and its step leads with the step (the drawn recording alerts card).
            ActionButton(it, open, testTag = "homeRecord.block.${block.id}.action", filled = block.chip == null && rows.isEmpty())
        }
    }
}

private const val YEAR_BUTTONS_PER_ROW = 4

/** The tallest bar stops just under the chart's top (116 of 120 in the drawn screen). */
private const val BAR_TOP_FRACTION = 116f / 120f
