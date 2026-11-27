@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.ui.components.EmptyState
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCard
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.moments.components.MomentCardBackground
import app.pantopus.android.ui.screens.moments.components.MomentImages
import app.pantopus.android.ui.screens.moments.components.momentCardGradient
import app.pantopus.android.ui.screens.moments.components.rememberMomentImage
import app.pantopus.android.ui.screens.profile.ProfilePostCardActions
import app.pantopus.android.ui.screens.profile.profilePostHasOptions
import app.pantopus.android.ui.screens.shared.feed.FeedSkeletonCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage

/**
 * The new Pulse's list (PHASE-1 §2 pieces 3 and 4): two looks for two lifetimes. A Moment that fades is borderless and
 * full width with its time left; a post that stays is today's Pulse card ([PulsePostCard], its reactions, Save, Repost
 * and the post menu as everywhere) under a status line ("Question, 3 answers", "Solved", "Spot", "Plan, 4 going"), in a
 * border. A thin line with the band's label where the distance band changes ("Your street", "Camas", "2 mi"), and the
 * server's end line ("Caught up around you. Keep exploring?"). [top] is what the strip draws over the rows.
 */
@Composable
internal fun ReinventedPulseList(
    state: ReinventedPulseState,
    cards: List<PulsePostCardContent>,
    nowMs: Long,
    listState: LazyListState,
    actions: ReinventedListActions,
    modifier: Modifier = Modifier,
    top: (@Composable () -> Unit)? = null,
) {
    when (val load = state.load) {
        ReinventedPulseState.Load.Loading -> LoadingRows(modifier)
        is ReinventedPulseState.Load.Failed ->
            EmptyState(
                icon = PantopusIcon.AlertTriangle,
                headline = "Pulse didn't load",
                subcopy = load.message,
                ctaTitle = "Try again",
                onCta = actions.onRefresh,
                modifier = modifier.padding(top = Spacing.s5),
            )
        ReinventedPulseState.Load.NeedsPlace ->
            EmptyState(
                icon = PantopusIcon.MapPin,
                headline = "Where should Pulse look?",
                subcopy = "Turn on location for Pantopus in Settings, or add your home in Place, to see what's around you.",
                ctaTitle = "Show my circle instead",
                onCta = actions.onShowCircle,
                modifier = modifier.padding(top = Spacing.s5),
            )
        ReinventedPulseState.Load.Loaded -> LoadedRows(state, cards, nowMs, listState, actions, modifier, top)
    }
}

@Composable
private fun LoadingRows(modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = Spacing.s4).semantics { contentDescription = "Loading Pulse" },
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        repeat(3) { FeedSkeletonCard(withTitle = true) }
    }
}

@Composable
@Suppress("LongParameterList") // What the rows show and do, the list's own scroll state, and what goes over them.
private fun LoadedRows(
    state: ReinventedPulseState,
    cards: List<PulsePostCardContent>,
    nowMs: Long,
    listState: LazyListState,
    actions: ReinventedListActions,
    modifier: Modifier,
    top: (@Composable () -> Unit)?,
) {
    val rows = remember(state.items, state.bands, cards) { state.rows(cards) }
    // More is read as the end of what shows nears, never while a read is out.
    val nearEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - ROWS_BEFORE_END
        }
    }
    LaunchedEffect(nearEnd, state.cursor) { if (nearEnd && state.cursor != null) actions.onLoadMore() }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().testTag("reinventedPulse.list"),
        contentPadding = PaddingValues(bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        top?.let { strip -> item(key = "top") { strip() } }
        if (state.items.isEmpty()) item(key = "empty") { EmptyNote(state.reach) }
        items(rows, key = { it.key }) { row ->
            when (row) {
                is ReinventedRow.Band -> BandLine(row)
                is ReinventedRow.Moment ->
                    if (row.kept) {
                        KeptCard(row.moment) { actions.onOpenMoment(row.moment) }
                    } else {
                        ReinventedMomentRow(row.moment, nowMs) { actions.onOpenMoment(row.moment) }
                    }
                is ReinventedRow.Post -> PostThatStays(row.card, actions.cards)
            }
        }
        item(key = "end") { EndLine(state) }
    }
}

@Composable
private fun EndLine(state: ReinventedPulseState) {
    if (state.cursor != null) {
        Box(Modifier.fillMaxWidth().padding(vertical = Spacing.s4), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.height(24.dp), strokeWidth = 2.dp, color = PantopusColors.primary600)
        }
        return
    }
    val end = state.end ?: return
    Text(
        text = end,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = PantopusColors.appTextSecondary,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s5, horizontal = Spacing.s4).testTag("reinventedPulse.end"),
    )
}

@Composable
private fun EmptyNote(reach: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s5).padding(top = Spacing.s5).testTag("reinventedPulse.empty"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(reinventedEmptyTitle(reach), fontSize = 17.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)
        Text(
            REINVENTED_EMPTY_LINE,
            fontSize = 14.sp,
            color = PantopusColors.appTextSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

/** A thin line with the band's words, where the distance band changes. */
@Composable
private fun BandLine(row: ReinventedRow.Band) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.s4)
                .padding(top = Spacing.s2)
                .semantics { heading() }
                .testTag("reinventedPulse.band.${row.band.band}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Box(Modifier.weight(1f).height(1.dp).background(PantopusColors.appBorder))
        Text(row.band.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextSecondary)
        Box(Modifier.weight(1f).height(1.dp).background(PantopusColors.appBorder))
    }
}

/** A post that stays: its status line over today's Pulse card, in a border. */
@Composable
private fun PostThatStays(
    card: PulsePostCardContent,
    actions: ProfilePostCardActions,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .padding(horizontal = Spacing.s3)
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .testTag("reinventedPulse.post.${card.id}"),
    ) {
        reinventedStatus(card)?.let { status ->
            Text(
                text = status,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.primary600,
                modifier = Modifier.padding(horizontal = Spacing.s4).padding(top = Spacing.s3).testTag("reinventedPulse.status.${card.id}"),
            )
        }
        val going = { actions.onReact(card.id) }
        PulsePostCard(
            content = card,
            onTap = { actions.onOpen(card.id) },
            onPrimaryReaction = going,
            onRSVP = going.takeIf { card.attendees != null },
            onReact = { emoji -> actions.onChooseReaction(card.id, emoji) },
            onOverflow = { actions.onOptions(card.id) }.takeIf { profilePostHasOptions(card) },
            onToggleSave = { actions.onToggleSave(card.id) },
            onToggleRepost = { actions.onToggleRepost(card.id) },
            onOpenQuoted = actions.onOpenQuoted,
        )
    }
}

/** A Moment its author kept: a post that stays, in the bordered look, under "Kept · stays". */
@Composable
private fun KeptCard(
    moment: MomentDto,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .padding(horizontal = Spacing.s3)
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(bottom = Spacing.s3)
                .testTag("reinventedPulse.kept.${moment.id}"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            text = "Kept · stays",
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.primary600,
            modifier = Modifier.padding(horizontal = Spacing.s4).padding(top = Spacing.s3),
        )
        ReinventedMomentRow(moment, nowMs = 0L, kept = true, onOpen = onOpen)
    }
}

/** A Moment that fades: borderless, full width, its picture (or its card), who and where, and its time left. */
@Composable
internal fun ReinventedMomentRow(
    moment: MomentDto,
    nowMs: Long,
    kept: Boolean = false,
    onOpen: () -> Unit,
) {
    val left = if (kept) "" else momentTimeLeft(moment.expiresAt, nowMs)
    val who = moment.author.firstName ?: moment.author.name ?: "Someone"
    val spoken =
        listOfNotNull(
            "$who's Moment",
            left.ifEmpty { null },
            moment.placeLabel,
            moment.caption?.ifBlank { null },
        ).joinToString(", ")
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClickLabel = "Open the Moment", onClick = onOpen)
                .semantics(mergeDescendants = true) { contentDescription = spoken }
                .testTag("reinventedPulse.moment.${moment.id}"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(MOMENT_HEIGHT)) {
            MomentPicture(moment, Modifier.fillMaxSize())
            Row(
                modifier =
                    Modifier
                        .padding(Spacing.s3)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(Color.Black.copy(alpha = 0.5f))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val words = listOfNotNull(who, left.ifEmpty { null }, moment.placeLabel?.ifBlank { null })
                Text(
                    text = words.joinToString("  ·  "),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        moment.caption?.takeIf { it.isNotBlank() }?.let { caption ->
            Text(
                text = caption,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = PantopusColors.appText,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = Spacing.s4),
            )
        }
    }
}

/** A Moment's picture: a photo, a video's poster, or a text card on its background. */
@Composable
internal fun MomentPicture(
    moment: MomentDto,
    modifier: Modifier,
) {
    if (moment.kind == "text") {
        Box(
            modifier = modifier.momentCardGradient(MomentCardBackground.fromWire(moment.background)).padding(Spacing.s5),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = moment.text.orEmpty(),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center,
                maxLines = 8,
                overflow = TextOverflow.Ellipsis,
            )
        }
        return
    }
    val video = moment.kind == "video"
    val url = if (video) moment.posterUrl ?: moment.mediaUrl else moment.mediaUrl
    val key = if (video) MomentImages.posterKey(moment.id) else MomentImages.mediaKey(moment.id)
    val request = rememberMomentImage(url, key)
    Box(modifier = modifier.background(PantopusColors.appSurfaceRaised)) {
        if (request != null) {
            AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

private val MOMENT_HEIGHT = 380.dp
private const val ROWS_BEFORE_END = 4
