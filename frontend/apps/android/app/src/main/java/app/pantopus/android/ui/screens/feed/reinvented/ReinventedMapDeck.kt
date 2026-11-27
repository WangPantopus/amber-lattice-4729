@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.flow.distinctUntilChanged

/** The time row's choices: back in time, or forward for plans (PHASE-1 §2 piece 8). */
internal val REINVENTED_TIMES =
    listOf(
        "live" to "Live",
        "today" to "Today",
        "week" to "This week",
        "all" to "All time",
        "tonight" to "Tonight",
        "weekend" to "This weekend",
    )

/**
 * The time row at the Map height: back through Live, Today, This week and All time, forward to Tonight and This weekend
 * (plans only). Going back shows posts that stay and the reader's own Moments; an ended Moment of someone else stays
 * ended, as today.
 */
@Composable
internal fun ReinventedTimeRow(
    time: String,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.s4),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        REINVENTED_TIMES.forEach { (key, title) ->
            val on = time == key
            val shape = RoundedCornerShape(percent = 50)
            Text(
                text = title,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (on) Color.White else PantopusColors.appText,
                modifier =
                    Modifier
                        .clip(shape)
                        .background(if (on) PantopusColors.primary600 else PantopusColors.appSurface)
                        .border(1.dp, if (on) Color.Transparent else PantopusColors.appBorder, shape)
                        .selectable(selected = on, role = Role.Tab) { onPick(key) }
                        .padding(horizontal = Spacing.s3, vertical = 6.dp)
                        .testTag("reinventedPulse.time.$key"),
            )
        }
    }
}

/**
 * The peek deck at the Map height: one card at a time along the bottom; swipe it with one thumb and the map glides
 * from pin to pin ([onFocus]). A tap opens the card's Moment, post or plan ([onOpen]).
 */
@Composable
internal fun ReinventedPeekDeck(
    deck: List<ReinventedMapItem>,
    onFocus: (ReinventedMapItem) -> Unit,
    onOpen: (ReinventedMapItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (deck.isEmpty()) return
    val pager = rememberPagerState { deck.size }
    val focus by rememberUpdatedState(onFocus)
    val cards by rememberUpdatedState(deck)
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.distinctUntilChanged().collect { page -> cards.getOrNull(page)?.let(focus) }
    }
    HorizontalPager(
        state = pager,
        contentPadding = PaddingValues(horizontal = 24.dp),
        pageSpacing = Spacing.s3,
        key = { deck.getOrNull(it)?.id ?: it },
        modifier = modifier.fillMaxWidth().height(112.dp).testTag("reinventedPulse.deck"),
    ) { page ->
        deck.getOrNull(page)?.let { item -> DeckCard(item) { onOpen(item) } }
    }
}

@Composable
private fun DeckCard(
    item: ReinventedMapItem,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 100.dp)
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(Spacing.s3)
                .testTag("reinventedPulse.card.${item.id}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(modifier = Modifier.size(width = 64.dp, height = 72.dp), contentAlignment = Alignment.Center) {
            ReinventedMapPin(item, focused = false)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                deckTitle(item),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                deckSubtitle(item),
                fontSize = 13.sp,
                color = PantopusColors.appTextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun deckTitle(item: ReinventedMapItem): String =
    when (item) {
        is ReinventedMapItem.Ring -> "${item.ring.author.firstName ?: item.ring.author.name ?: "Someone"}'s Moment"
        is ReinventedMapItem.Mark -> if (item.mark.headsUp) "Heads-up: ${words(item.mark.post)}" else words(item.mark.post)
        is ReinventedMapItem.Kept -> item.kept.moment.caption?.takeIf { it.isNotBlank() } ?: "A kept Moment"
        is ReinventedMapItem.Ticket -> item.ticket.title.orEmpty().ifBlank { "Plan" }
    }

private fun deckSubtitle(item: ReinventedMapItem): String =
    when (item) {
        is ReinventedMapItem.Ring -> item.ring.placeLabel.orEmpty()
        is ReinventedMapItem.Mark -> item.mark.post.locationName.orEmpty()
        is ReinventedMapItem.Kept -> item.kept.moment.placeLabel.orEmpty()
        is ReinventedMapItem.Ticket -> item.ticket.placeName ?: item.ticket.areaLabel ?: "Plan"
    }

private fun words(post: FeedPost): String = post.title?.trim()?.takeIf { it.isNotEmpty() } ?: post.content.orEmpty().trim()
