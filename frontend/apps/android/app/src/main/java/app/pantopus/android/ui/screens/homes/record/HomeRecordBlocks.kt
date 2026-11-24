package app.pantopus.android.ui.screens.homes.record

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.homerecord.HomeRecordBarsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordCardBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordChip
import app.pantopus.android.data.api.models.homerecord.HomeRecordClosedGroupBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordFactsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordIntroBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordLink
import app.pantopus.android.data.api.models.homerecord.HomeRecordMeterRow
import app.pantopus.android.data.api.models.homerecord.HomeRecordMetersBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordNoteBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordNoticeBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPhotoYearsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPictureBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPromiseBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordRowsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordSectionLabelBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordStep
import app.pantopus.android.data.api.models.homerecord.HomeRecordTilesBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordTimelineBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordValueBlock
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.place.components.PlaceChip
import app.pantopus.android.ui.screens.place.components.PlaceChipModel
import app.pantopus.android.ui.screens.place.components.PlaceChipTone
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/** The page's card: white, a hairline border, radius 20 (the drawn screens). */
internal fun Modifier.recordCard(): Modifier =
    this
        .clip(RoundedCornerShape(Radii.xl2))
        .background(PantopusColors.appSurface)
        .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(Radii.xl2))

/** Whether [block] has anything to draw here. A closed group with no items, or a picture with no photo, does not. */
internal fun drawsSomething(block: HomeRecordBlock): Boolean =
    when (block) {
        // Android has no free street picture: the photo from above or nothing.
        is HomeRecordPictureBlock -> !block.above?.imageUrl.isNullOrBlank()
        is HomeRecordClosedGroupBlock -> !block.items.isNullOrEmpty()
        is HomeRecordFactsBlock -> !block.tiles.isNullOrEmpty() || !block.line.isNullOrBlank()
        is HomeRecordMetersBlock -> block.groups.orEmpty().any { !it.rows.isNullOrEmpty() }
        is HomeRecordPhotoYearsBlock -> block.photos.orEmpty().any { it.imageUrl.isNotBlank() }
        is HomeRecordTimelineBlock -> !block.items.isNullOrEmpty()
        is HomeRecordBarsBlock -> !block.items.isNullOrEmpty()
        is HomeRecordSectionLabelBlock -> block.text.isNotBlank()
        is HomeRecordNoteBlock -> block.text.isNotBlank()
        else -> true
    }

@Composable
internal fun RecordBlock(
    block: HomeRecordBlock,
    open: (String) -> Unit,
) {
    val tagged = Modifier.testTag("homeRecord.block.${block.id}")
    when (block) {
        is HomeRecordPictureBlock -> PictureBlock(block, tagged)
        is HomeRecordFactsBlock -> FactsBlock(block, tagged)
        is HomeRecordMetersBlock -> MetersBlock(block, tagged)
        is HomeRecordIntroBlock -> IntroBlock(block, tagged)
        is HomeRecordClosedGroupBlock -> ClosedGroupBlock(block, tagged)
        is HomeRecordPromiseBlock -> PromiseBlock(block, open, tagged)
        is HomeRecordNoteBlock -> NoteBlock(block, tagged)
        is HomeRecordSectionLabelBlock -> SectionLabel(block.text, tagged)
        is HomeRecordValueBlock -> ValueBlock(block, tagged)
        is HomeRecordPhotoYearsBlock -> PhotoYearsBlock(block, tagged)
        is HomeRecordTimelineBlock -> TimelineBlock(block, tagged)
        is HomeRecordNoticeBlock -> NoticeBlock(block, tagged)
        is HomeRecordRowsBlock -> RowsBlock(block, open, tagged)
        is HomeRecordTilesBlock -> TilesBlock(block, tagged)
        is HomeRecordBarsBlock -> BarsBlock(block, tagged)
        is HomeRecordCardBlock -> CardBlock(block, open, tagged)
    }
}

// ─── shared pieces ──────────────────────────────────────────

@Composable
internal fun RecordCard(
    modifier: Modifier = Modifier,
    padding: Dp = Spacing.s4,
    spacing: Dp = 0.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier.fillMaxWidth().recordCard().padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

/** A small uppercase label: "Around this address", "Protect your home". */
@Composable
internal fun SectionLabel(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text.uppercase(),
        fontSize = 11.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.08.em,
        color = PantopusColors.appTextSecondary,
        modifier = modifier.padding(horizontal = Spacing.s1).semantics { heading() },
    )
}

@Composable
internal fun CardTitle(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text,
        fontSize = 17.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.01).em,
        color = PantopusColors.appText,
        modifier = modifier.semantics { heading() },
    )
}

/** The line that names where a block's data came from, and its notes. */
@Composable
internal fun SourceLine(
    text: String?,
    modifier: Modifier = Modifier,
) {
    text?.takeIf { it.isNotBlank() }?.let {
        Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PantopusColors.appTextMuted, modifier = modifier)
    }
}

@Composable
internal fun TileLabel(text: String) {
    Text(
        text.uppercase(),
        fontSize = 11.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.06.em,
        color = PantopusColors.appTextSecondary,
    )
}

@Composable
internal fun RecordChip(chip: HomeRecordChip?) {
    chip?.takeIf { it.text.isNotBlank() }?.let {
        val tone =
            when (it.tone) {
                "success" -> PlaceChipTone.SUCCESS
                "warning" -> PlaceChipTone.WARNING
                else -> PlaceChipTone.NEUTRAL
            }
        PlaceChip(PlaceChipModel(tone, it.text))
    }
}

/** `low`, `mid`, `high` → the ink for words in that tone. */
private fun toneInk(tone: String?): Color =
    when (tone) {
        "high" -> PantopusColors.error
        "mid" -> PantopusColors.warning
        else -> PantopusColors.success
    }

/** The contract's icon names; an unknown one draws the default. */
private val RECORD_ICONS: Map<String, PantopusIcon> =
    mapOf(
        "history" to PantopusIcon.History,
        "trend" to PantopusIcon.TrendingUp,
        "tag" to PantopusIcon.Tag,
        "bank" to PantopusIcon.Landmark,
        "bars" to PantopusIcon.BarChart3,
        "shield" to PantopusIcon.ShieldCheck,
        "image" to PantopusIcon.Image,
        "wrench" to PantopusIcon.Wrench,
        "bell" to PantopusIcon.Bell,
        "layers" to PantopusIcon.Layers,
        "home" to PantopusIcon.Home,
        "alert" to PantopusIcon.AlertTriangle,
        "file" to PantopusIcon.FileText,
        "mail" to PantopusIcon.Mail,
        "percent" to PantopusIcon.Percent,
        "eye_off" to PantopusIcon.EyeOff,
    )

internal fun recordIcon(name: String?): PantopusIcon = RECORD_ICONS[name] ?: PantopusIcon.Info

/** An action as an outlined (or, [filled], solid) button: an https page shows the leaving-the-app mark. */
@Composable
internal fun ActionButton(
    link: HomeRecordLink,
    open: (String) -> Unit,
    testTag: String,
    filled: Boolean = false,
) {
    if (link.label.isBlank() || !isOpenable(link.url)) return
    val shape = RoundedCornerShape(Radii.lg)
    val ink = if (filled) PantopusColors.appTextInverse else PantopusColors.primary600
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 46.dp)
                .clip(shape)
                .then(
                    if (filled) {
                        Modifier.background(PantopusColors.primary600)
                    } else {
                        Modifier.background(PantopusColors.appSurface).border(1.dp, PantopusColors.appBorderStrong, shape)
                    },
                ).clickable(role = Role.Button) { open(link.url) }
                .padding(horizontal = Spacing.s3, vertical = 10.dp)
                .testTag(testTag),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(link.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ink, textAlign = TextAlign.Center)
        if (link.url.startsWith("https://")) {
            PantopusIconImage(PantopusIcon.ExternalLink, null, size = 15.dp, strokeWidth = 2f, tint = ink)
        }
    }
}

// ─── picture ────────────────────────────────────────────────

@Composable
private fun PictureBlock(
    block: HomeRecordPictureBlock,
    modifier: Modifier,
) {
    val above = block.above ?: return
    RecordCard(modifier = modifier, padding = Spacing.s3, spacing = Spacing.s3) {
        // No Street choice on Android: there is no free street picture, so the photo from above stands alone.
        RecordAerialPhoto(
            imageUrl = above.imageUrl,
            outline = above.outline,
            height = 230.dp,
            description = block.caption,
            bottomStart = above.chips.orEmpty().firstOrNull { it.at == "bl" }?.text,
            bottomEnd = above.chips.orEmpty().firstOrNull { it.at == "br" }?.text,
        )
        SourceLine(block.caption, Modifier.padding(horizontal = Spacing.s1).padding(bottom = 2.dp))
    }
}

// ─── facts ──────────────────────────────────────────────────

@Composable
private fun FactsBlock(
    block: HomeRecordFactsBlock,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier, spacing = Spacing.s3) {
        val tiles = block.tiles.orEmpty().take(MAX_FACT_TILES)
        if (tiles.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                tiles.forEach { tile ->
                    Column(
                        modifier =
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(Radii.lg))
                                .background(PantopusColors.appSurfaceSunken)
                                .padding(horizontal = 10.dp, vertical = Spacing.s3)
                                .semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        TileLabel(tile.label)
                        Text(
                            buildAnnotatedString {
                                append(tile.value)
                                tile.unit?.takeIf { it.isNotBlank() }?.let { unit ->
                                    withStyle(
                                        SpanStyle(
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = PantopusColors.appTextSecondary,
                                        ),
                                    ) { append(" $unit") }
                                }
                            },
                            fontSize = 22.sp,
                            lineHeight = 28.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.015).em,
                            color = PantopusColors.appText,
                        )
                    }
                }
            }
        }
        block.line?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 14.sp, lineHeight = 20.sp, color = PantopusColors.appTextStrong)
        }
        SourceLine(block.source)
    }
}

// ─── meters ─────────────────────────────────────────────────

@Composable
private fun MetersBlock(
    block: HomeRecordMetersBlock,
    modifier: Modifier,
) {
    Column(modifier = modifier) {
        block.title?.takeIf { it.isNotBlank() }?.let { SectionLabel(it, Modifier.padding(bottom = 10.dp)) }
        RecordCard(modifier = Modifier, padding = 0.dp) {
            Column(modifier = Modifier.padding(start = Spacing.s4, end = Spacing.s4, top = 6.dp, bottom = 14.dp)) {
                block.groups.orEmpty().filter { !it.rows.isNullOrEmpty() }.forEachIndexed { index, group ->
                    group.title?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            it,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = PantopusColors.appTextStrong,
                            modifier =
                                Modifier
                                    .padding(top = if (index == 0) Spacing.s3 else Spacing.s4, bottom = 2.dp)
                                    .semantics { heading() },
                        )
                    }
                    group.rows.orEmpty().forEach { MeterRow(it) }
                }
                SourceLine(block.note, Modifier.padding(top = Spacing.s3))
            }
        }
    }
}

@Composable
private fun MeterRow(row: HomeRecordMeterRow) {
    val ink = toneInk(row.tone)
    val level = row.level.coerceIn(0, METER_STEPS)
    Column {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .semantics(mergeDescendants = true) { contentDescription = "${row.label}: ${row.word.orEmpty()}" },
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                row.label,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Medium,
                color = PantopusColors.appText,
                modifier = Modifier.width(104.dp),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(METER_STEPS) { step ->
                    Box(
                        Modifier
                            .size(width = 16.dp, height = 8.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(if (step < level) ink else PantopusColors.appBorder),
                    )
                }
            }
            Text(
                row.word.orEmpty(),
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = ink,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
        }
        HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
    }
}

// ─── intro, closed groups, promise, note ────────────────────

@Composable
private fun IntroBlock(
    block: HomeRecordIntroBlock,
    modifier: Modifier,
) {
    Column(
        modifier = modifier.padding(horizontal = Spacing.s1),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            block.title,
            fontSize = 22.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.015).em,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        block.body?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 14.sp, lineHeight = 20.sp, color = PantopusColors.appTextSecondary)
        }
    }
}

@Composable
private fun ClosedGroupBlock(
    block: HomeRecordClosedGroupBlock,
    modifier: Modifier,
) {
    RecordCard(modifier = modifier, padding = 0.dp) {
        Column(modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = Spacing.s1, bottom = 6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.s12),
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    block.title,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.01).em,
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                block.chip?.takeIf { it.isNotBlank() }?.let {
                    PlaceChip(PlaceChipModel(PlaceChipTone.NEUTRAL, it, icon = PantopusIcon.Lock))
                }
            }
            block.items.orEmpty().forEach { item ->
                HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .padding(vertical = 7.dp)
                            .semantics(mergeDescendants = true) {},
                    horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.homeBg),
                        contentAlignment = Alignment.Center,
                    ) {
                        PantopusIconImage(recordIcon(item.icon), null, size = 16.dp, strokeWidth = 2f, tint = PantopusColors.home)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            item.title,
                            fontSize = 14.5.sp,
                            lineHeight = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = (-0.01).em,
                            color = PantopusColors.appText,
                        )
                        item.line?.takeIf { it.isNotBlank() }?.let {
                            Text(it, fontSize = 12.5.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PromiseBlock(
    block: HomeRecordPromiseBlock,
    open: (String) -> Unit,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(Radii.xl2)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.primary50)
                .border(1.dp, PantopusColors.primary200, shape)
                .padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s5, bottom = Spacing.s4),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                block.title,
                fontSize = 20.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.012).em,
                color = PantopusColors.primary900,
                modifier = Modifier.semantics { heading() },
            )
            block.body?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 14.sp, lineHeight = 20.sp, color = PantopusColors.appTextStrong)
            }
        }
        block.steps?.takeIf { it.isNotEmpty() }?.let { PromiseSteps(it) }
        block.button?.takeIf { it.label.isNotBlank() && isOpenable(it.url) }?.let { button ->
            PrimaryButton(
                title = button.label,
                onClick = { open(button.url) },
                modifier = Modifier.fillMaxWidth().testTag("homeRecord.promise.button"),
            )
        }
        block.alt?.takeIf { it.label.isNotBlank() && isOpenable(it.url) }?.let { alt ->
            Text(
                buildAnnotatedString {
                    alt.lead?.takeIf { it.isNotBlank() }?.let { append("$it ") }
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = PantopusColors.primary600)) { append(alt.label) }
                },
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = PantopusColors.appTextSecondary,
                textAlign = TextAlign.Center,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Radii.md))
                        .clickable(role = Role.Button) { open(alt.url) }
                        .padding(vertical = 6.dp)
                        .testTag("homeRecord.promise.alt"),
            )
        }
    }
}

/** The promise's numbered steps. */
@Composable
private fun PromiseSteps(steps: List<HomeRecordStep>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        steps.forEachIndexed { index, step ->
            Row(
                modifier = Modifier.semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                Box(
                    modifier =
                        Modifier
                            .size(26.dp)
                            .clip(CircleShape)
                            .background(PantopusColors.appSurface)
                            .border(1.dp, PantopusColors.primary200, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${index + 1}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = PantopusColors.primary600)
                }
                Column {
                    Text(
                        step.title,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PantopusColors.appText,
                    )
                    step.line?.takeIf { it.isNotBlank() }?.let {
                        Text(it, fontSize = 13.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteBlock(
    block: HomeRecordNoteBlock,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(Radii.xl)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(horizontal = Spacing.s4, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PantopusIconImage(
            recordIcon(block.icon),
            null,
            size = 18.dp,
            strokeWidth = 2f,
            tint = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(top = 1.dp),
        )
        Text(block.text, fontSize = 13.sp, lineHeight = 19.sp, color = PantopusColors.appTextStrong)
    }
}

private const val MAX_FACT_TILES = 3
private const val METER_STEPS = 5
