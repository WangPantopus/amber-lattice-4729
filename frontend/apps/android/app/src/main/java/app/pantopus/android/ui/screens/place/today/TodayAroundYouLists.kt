package app.pantopus.android.ui.screens.place.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.models.saved_places.AroundYouListDto
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCard
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.profile.ProfilePostCardActions
import app.pantopus.android.ui.screens.profile.profilePostHasOptions
import app.pantopus.android.ui.screens.root.ScrollAwayHeaderPage
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * Around you's posts as one list that keeps going (founder, 2026-11-24): the intro, the chips, and under All the
 * first page's sections followed by every earlier story under the day it was first seen; under any other chip that
 * chip's own list. More is read as the end of what shows nears, for as long as the server says there is more. Twin of
 * the web's `components/hub/AroundYou.tsx`.
 */

/** What the page needs of the lists behind it: the chosen one as far as it was read, and what the taps do. */
internal data class AroundYouListsUi(
    val state: AroundYouLists.State,
    val onSelect: (String) -> Unit,
    val onMore: () -> Unit,
    /** "Reply" and the reply preview on a card: its post page with the reply box ready to type in. */
    val onReply: (String) -> Unit,
)

/** A run of a list's cards under one day's heading ("" for a list without days). */
private data class DayGroup(
    val day: String,
    val cards: List<PulsePostCardContent>,
)

// More is asked for when this many rows, or fewer, are left under the last one showing.
private const val ROWS_BEFORE_END = 4

@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
internal fun AroundYouPostsList(
    page: AroundYouDto,
    top: Dp,
    nowMs: Long,
    cards: List<PulsePostCardContent>,
    actions: ProfilePostCardActions,
    lists: AroundYouListsUi?,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    ScrollAwayHeaderPage(listState)
    // A server from before the lists sends no chips: the page is its sections, as before, and asks for nothing more.
    val chips = page.lists.orEmpty().takeIf { lists != null }.orEmpty()
    val state = lists?.state ?: AroundYouLists.State()
    val offered = chips.any { it.id == state.id }
    val selected = if (offered) state.id else AroundYouLists.ALL
    // A chip the place no longer offers (another place, a quieter week) falls back to All.
    LaunchedEffect(offered, state.id) {
        if (!offered && state.id != AroundYouLists.ALL) lists?.onSelect?.invoke(AroundYouLists.ALL)
    }
    val all = selected == AroundYouLists.ALL
    val byId = remember(cards) { cards.associateBy { it.id } }
    val sections =
        remember(page, byId) {
            page.sections.mapNotNull { section ->
                // A section whose posts all left (removed, hidden) shows nothing.
                val sectionCards = section.posts.orEmpty().mapNotNull { byId[it.id] }
                if (sectionCards.isEmpty()) null else Triple(section.id, section.title, sectionCards)
            }
        }
    val shown = remember(sections) { sections.flatMap { it.third }.map { it.id }.toSet() }
    val dated = selected != AroundYouLists.EVENTS && selected != AroundYouLists.TALKED
    val groups =
        remember(state.posts, byId, shown, selected, nowMs / DAY_MS) {
            val out = mutableListOf<DayGroup>()
            for (post in state.posts) {
                // Under All the first page's own posts are above already.
                if (all && post.id in shown) continue
                val card = byId[post.id] ?: continue
                val day = if (dated) aroundDayLabel(post.createdAt, nowMs) else ""
                val last = out.lastOrNull()
                if (last != null && last.day == day) {
                    out[out.lastIndex] = last.copy(cards = last.cards + card)
                } else {
                    out += DayGroup(day, listOf(card))
                }
            }
            out.toList()
        }
    val listed = groups.sumOf { it.cards.size }
    val canAsk = chips.isNotEmpty() && lists != null
    // More is read as the end of what shows nears, never while a read is out or after one failed (Try again asks).
    val nearEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - 1 - ROWS_BEFORE_END
        }
    }
    LaunchedEffect(nearEnd, selected, state.pages, state.loading, state.failed, canAsk) {
        if (canAsk && nearEnd && state.hasMore && !state.loading && !state.failed) lists?.onMore?.invoke()
    }
    val draw: @Composable (PulsePostCardContent) -> Unit = { card ->
        val going = { actions.onReact(card.id) }
        // A Repost shows the headline to the reposter's connections in Pulse; the post itself lists only here.
        PulsePostCard(
            content = card,
            onTap = { actions.onOpen(card.id) },
            onPrimaryReaction = going,
            onRSVP = going.takeIf { card.attendees != null },
            onReact = { emoji -> actions.onChooseReaction(card.id, emoji) },
            onOverflow = { actions.onOptions(card.id) }.takeIf { profilePostHasOptions(card) },
            onToggleSave = { actions.onToggleSave(card.id) },
            onToggleRepost = { actions.onToggleRepost(card.id) },
            onReply = lists?.let { ui -> { ui.onReply(card.id) } },
        )
    }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().testTag("aroundYouPanel"),
        contentPadding = PaddingValues(top = top + 8.dp, bottom = 40.dp),
    ) {
        page.area?.let { area ->
            item(key = "intro") {
                Text(
                    "From local news outlets around $area. Each post links to the story where it was published.",
                    fontSize = 13.sp,
                    color = PantopusColors.appTextSecondary,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
            }
        }
        if (chips.size > 1) {
            item(key = "chips") { AroundYouChips(chips, selected) { id -> lists?.onSelect?.invoke(id) } }
        }
        if (all) {
            sections.forEach { (id, title, sectionCards) ->
                item(key = "section_$id") { ListHeading(title, Modifier.testTag("aroundYouSection_$id")) }
                items(sectionCards, key = { "page_${it.id}" }) { card -> draw(card) }
            }
        }
        groups.forEachIndexed { index, group ->
            val heading =
                when {
                    all && group.day.isNotEmpty() -> "Earlier · ${group.day}"
                    all -> "Earlier"
                    else -> group.day
                }
            if (heading.isNotEmpty()) {
                item(key = "day_${selected}_$index") { ListHeading(heading, Modifier.testTag("aroundYouDay_$index")) }
            } else if (index == 0) {
                item(key = "top_$selected") { ListDivider(Modifier.padding(top = 16.dp)) }
            }
            items(group.cards, key = { "list_${it.id}" }) { card -> draw(card) }
        }
        if (canAsk) aroundYouListFoot(selected, state, listed, onRetry = { lists?.onMore?.invoke() })
    }
}

/** What follows a list's cards: that it is being read, that a read failed, that it is empty, or that it has ended. */
private fun LazyListScope.aroundYouListFoot(
    selected: String,
    state: AroundYouLists.State,
    listed: Int,
    onRetry: () -> Unit,
) {
    val all = selected == AroundYouLists.ALL
    when {
        state.failed ->
            // Under All a failed read of the earlier stories says nothing until there are some: the page is whole.
            if (!all || listed > 0) {
                item(key = "foot_failed") {
                    ListNote(
                        if (listed > 0) "Couldn’t load more. Try again" else "Couldn’t load this list. Try again",
                        Modifier.clickable(role = Role.Button, onClick = onRetry).testTag("aroundYouRetry"),
                    )
                }
            }
        state.loading -> if (!all || listed > 0) item(key = "foot_loading") { ListNote("Loading…", Modifier.testTag("aroundYouLoading")) }
        !all && state.pages > 0 && listed == 0 ->
            item(key = "foot_empty") { ListNote(emptyListText(selected), Modifier.testTag("aroundYouListEmpty")) }
        !state.hasMore && state.pages > 1 && listed > 0 ->
            item(key = "foot_end") { ListNote("That’s everything so far.", Modifier.testTag("aroundYouEnd")) }
    }
}

/** What an empty list says. */
private fun emptyListText(list: String): String =
    when (list) {
        AroundYouLists.TALKED -> "No one has replied or reacted yet. Open a story and be the first."
        AroundYouLists.EVENTS -> "No events on the calendars in the next week."
        else -> "Nothing here yet."
    }

/** The chips over the page: which list shows. Drawn as Pulse draws its topic chips. */
@Composable
private fun AroundYouChips(
    chips: List<AroundYouListDto>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .selectableGroup()
                .testTag("aroundYouLists"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        chips.forEach { chip ->
            val active = chip.id == selected
            val shape = RoundedCornerShape(Radii.pill)
            Text(
                text = chip.title,
                fontSize = 13.sp,
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                color = if (active) PantopusColors.appTextInverse else PantopusColors.appTextStrong,
                maxLines = 1,
                modifier =
                    Modifier
                        .clip(shape)
                        .background(if (active) PantopusColors.primary600 else PantopusColors.appSurfaceRaised)
                        .border(1.dp, if (active) PantopusColors.primary600 else PantopusColors.appBorder, shape)
                        .testTag("aroundYouList_${chip.id}")
                        // One node per chip, read once with its state.
                        .selectable(selected = active, role = Role.RadioButton) { onSelect(chip.id) }
                        .clearAndSetSemantics { contentDescription = chip.title }
                        .padding(horizontal = Spacing.s3, vertical = 8.dp),
            )
        }
    }
}

/** A section's or a day's name over its cards, with the line the first card sits under. */
@Composable
private fun ListHeading(
    title: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth().padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeading(title, Modifier.padding(horizontal = 20.dp))
        ListDivider()
    }
}

@Composable
private fun ListDivider(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorderSubtle))
}

@Composable
private fun ListNote(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text,
        fontSize = 13.sp,
        color = PantopusColors.appTextSecondary,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
    )
}

private const val DAY_MS = 86_400_000L

/** A post's time, written with a Z or with an offset; null when it can't be read. */
private fun instantOf(iso: String): Instant? =
    try {
        Instant.parse(iso)
    } catch (_: DateTimeParseException) {
        try {
            OffsetDateTime.parse(iso).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
    }

/** "Today", "Yesterday", "Sunday, Nov 22": the day a story was first seen, for the lists' day headings. */
internal fun aroundDayLabel(
    iso: String,
    nowMs: Long,
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    val seen = instantOf(iso)?.atZone(zone)?.toLocalDate() ?: return ""
    val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
    val days = ChronoUnit.DAYS.between(seen, today)
    return when {
        days <= 0L -> "Today"
        days == 1L -> "Yesterday"
        else -> {
            val pattern = if (seen.year == today.year) "EEEE, MMM d" else "EEEE, MMM d, yyyy"
            seen.format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault()))
        }
    }
}
