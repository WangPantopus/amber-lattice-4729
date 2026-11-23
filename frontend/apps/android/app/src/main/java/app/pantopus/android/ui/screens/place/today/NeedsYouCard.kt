package app.pantopus.android.ui.screens.place.today

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.ai.AINeedsYouRepository
import app.pantopus.android.data.api.models.ai.AINeedsYouItemDto
import app.pantopus.android.data.api.net.refusesStoredCopy
import app.pantopus.android.ui.screens.place.components.PlaceIconTile
import app.pantopus.android.ui.screens.place.components.PlaceTileTone
import app.pantopus.android.ui.screens.place.components.placeSurface
import app.pantopus.android.ui.screens.place.detail.TodayHairline
import app.pantopus.android.ui.screens.place.detail.TodayHouseCard
import app.pantopus.android.ui.screens.place.detail.TodayTextAction
import app.pantopus.android.ui.screens.place.detail.needsYouShown
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The rows the card shows before "Show all" (AI assistant phase 3 contract §6.4). */
private const val NEEDS_YOU_FIRST_ROWS = 3

/**
 * Today's Needs you (AI assistant phase 3 contract §6.4): what waits on the person, from `GET /api/ai/needs-you`
 * through the screens' store. The last list shows at once and then refreshes, when Today appears, when the store marks
 * it out of date and on a pull. A failed refresh keeps the last list; with none yet the card isn't there.
 */
@HiltViewModel
class NeedsYouViewModel
    @Inject
    constructor(
        private val repo: AINeedsYouRepository,
    ) : ViewModel() {
        private val _items = MutableStateFlow(repo.needsYouCopy()?.items)

        /** The list to show; null before the first answer, or after a refused one (nothing shows). */
        val items: StateFlow<List<AINeedsYouItemDto>?> = _items.asStateFlow()

        private var reading: Job? = null

        /** Today appeared, or the store marked the list out of date: the store reads only an out-of-date copy. */
        fun load() = read(force = false)

        /** Pull to refresh and Retry: reads now. */
        fun pull() = read(force = true)

        private fun read(force: Boolean) {
            if (!force && reading?.isActive == true) return
            reading =
                viewModelScope.launch {
                    var stored = repo.needsYouStored(force)
                    // A token refresh at launch can set an answer aside (no data and no failure): ask once more.
                    if (stored.data == null && stored.failure == null) stored = repo.needsYouStored(force = true)
                    val data = stored.data
                    when {
                        data != null -> _items.value = data.items
                        stored.failure.refusesStoredCopy -> _items.value = null
                    }
                }
        }
    }

/**
 * The card: "Needs you", then up to three rows, each opening its screen with the deep-link router; "Show all (N)"
 * expands it in place. A task row whose task "Coming up at home" lists on the same screen ([agendaTaskIds]) is left
 * out, and N counts what the card shows. Nothing shows when nothing waits.
 */
@Composable
fun NeedsYouCard(
    items: List<AINeedsYouItemDto>?,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
    agendaTaskIds: Set<String> = emptySet(),
    /** Space above the title: a section's under the sky, none at the top of the screen. */
    topGap: Dp = 24.dp,
) {
    val shown = needsYouShown(items, agendaTaskIds)
    if (shown.isEmpty()) return
    NeedsYouRows(shown.map { item -> NeedsYouLine.of(item, onOpen) }, modifier, topGap)
}

/**
 * The card with the house on Today (JOURNEYS section 3): right under the picture, it says in words what the picture
 * shows. A first row while mail waits unopened ("You have mail", "{n} unopened", opening Mail), then the
 * list as always, then on a pickup evening "Pickup is tomorrow" with the kinds (opening the pickup schedule, as the
 * bins do). With nothing to list, a person with a home reads one line instead of an empty space.
 */
@Composable
fun TodayHouseNeedsYouCard(
    items: List<AINeedsYouItemDto>?,
    onOpen: (String) -> Unit,
    /** Mail that came and is not opened yet; the row shows while it is over 0. */
    unopenedMail: Int,
    onOpenMail: () -> Unit,
    page: TodayHouseCard,
    modifier: Modifier = Modifier,
) {
    val mail =
        NeedsYouLine(PantopusIcon.Mail, PlaceTileTone.SKY, "You have mail", "$unopenedMail unopened", "today.house.mailRow", onOpenMail)
            .takeIf { unopenedMail > 0 }
    val pickup =
        page.pickup?.let { (kinds, open) ->
            NeedsYouLine(PantopusIcon.Trash2, PlaceTileTone.HOME, "Pickup is tomorrow", kinds, "today.house.pickupRow", open)
        }
    val rows = listOfNotNull(mail) + needsYouShown(items, page.agendaTaskIds).map { NeedsYouLine.of(it, onOpen) } + listOfNotNull(pickup)
    when {
        rows.isNotEmpty() -> NeedsYouRows(rows, modifier, topGap = 16.dp)
        page.hasHome -> NeedsYouQuiet(modifier.padding(top = 10.dp))
    }
}

/** "Nothing needs you today.": the house is quiet. */
@Composable
private fun NeedsYouQuiet(modifier: Modifier = Modifier) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .placeSurface()
                .padding(horizontal = 14.dp, vertical = 14.dp)
                .semantics(mergeDescendants = true) {}
                .testTag("today.house.quiet"),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PantopusIconImage(PantopusIcon.Check, null, size = 18.dp, strokeWidth = 2.5f, tint = PantopusColors.success)
        Text("Nothing needs you today.", fontSize = 15.sp, lineHeight = 20.sp, color = PantopusColors.appText)
    }
}

/** One row of the card: a list item, or one of the house's own rows (unopened mail, tomorrow's pickup). */
private data class NeedsYouLine(
    val icon: PantopusIcon,
    val tone: PlaceTileTone,
    val title: String,
    val subtitle: String?,
    val tag: String,
    /** Null for an item with no link: it shows, and is not a button. */
    val onOpen: (() -> Unit)?,
) {
    companion object {
        fun of(
            item: AINeedsYouItemDto,
            onOpen: (String) -> Unit,
        ) = NeedsYouLine(
            icon = needsYouIcon(item.type),
            tone = if (item.type == "task_overdue") PlaceTileTone.MUTED else PlaceTileTone.SKY,
            title = item.title,
            subtitle = item.subtitle,
            tag = "needsYou.row.${item.type}",
            onOpen = item.link?.let { link -> { onOpen(link) } },
        )
    }
}

/** "Needs you", up to three rows and "Show all (N)" over three. */
@Composable
private fun NeedsYouRows(
    shown: List<NeedsYouLine>,
    modifier: Modifier,
    topGap: Dp,
) {
    var showsAll by rememberSaveable { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth().testTag("needsYou.card")) {
        Text(
            "Needs you",
            fontSize = 18.sp,
            lineHeight = 23.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.2).sp,
            color = PantopusColors.appText,
            modifier = Modifier.padding(top = topGap, bottom = 8.dp, start = 2.dp).semantics { heading() },
        )
        Column(modifier = Modifier.fillMaxWidth().animateContentSize().placeSurface().padding(horizontal = 14.dp)) {
            val rows = if (showsAll) shown else shown.take(NEEDS_YOU_FIRST_ROWS)
            rows.forEachIndexed { index, line ->
                if (index > 0) TodayHairline()
                NeedsYouRow(line)
            }
            if (shown.size > NEEDS_YOU_FIRST_ROWS) {
                TodayHairline()
                TodayTextAction(
                    if (showsAll) "Show fewer" else "Show all (${shown.size})",
                    onClick = { showsAll = !showsAll },
                    modifier = Modifier.testTag("needsYou.showAll"),
                )
            }
        }
    }
}

@Composable
private fun NeedsYouRow(line: NeedsYouLine) {
    val open = line.onOpen
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .then(if (open != null) Modifier.clickable(role = Role.Button, onClickLabel = "Open", onClick = open) else Modifier)
                .semantics(mergeDescendants = true) {}
                .padding(vertical = 12.dp)
                .testTag(line.tag),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlaceIconTile(icon = line.icon, tone = line.tone)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(line.title, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            line.subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 12.5.sp, lineHeight = 17.sp, color = PantopusColors.appTextSecondary)
            }
        }
        if (open != null) PantopusIconImage(PantopusIcon.ChevronRight, null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

private fun needsYouIcon(type: String): PantopusIcon =
    when (type) {
        "still_coming" -> PantopusIcon.CalendarCheck
        "plan_requests" -> PantopusIcon.Users
        "task_overdue" -> PantopusIcon.AlertCircle
        "task_assigned" -> PantopusIcon.ListChecks
        "home_invite" -> PantopusIcon.Home
        "household_request", "connection_request" -> PantopusIcon.UserPlus
        "nudge_card" -> PantopusIcon.Sparkles
        "question_answered" -> PantopusIcon.MessageCircle
        else -> PantopusIcon.Bell
    }
