@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.reinvented.ReinventedStrandGroupDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pulse.ReinventedRepository
import app.pantopus.android.ui.screens.moments.components.MomentFace
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

/*
 * "Pulse, reinvented" phase 3, strands (PHASE-3 piece 5; CONTRACT 8c; iPhone's `ReinventedStrands.swift`): "Went because
 * of you", at the top of My Atlas, which is private to its owner. Told to the first person only: nothing here shows a
 * strand to anyone else. Each group is the server's own words, up to three faces and the source's caption; a tap opens
 * the post or Moment it came from, as the reader may open it now. New ones are marked seen after 1.5 s on screen.
 */

data class ReinventedStrandsState(
    val groups: List<ReinventedStrandGroupDto> = emptyList(),
    val unseen: Int = 0,
    val cursor: String? = null,
    val loading: Boolean = false,
)

@HiltViewModel
class ReinventedStrandsViewModel
    @Inject
    constructor(
        private val repository: ReinventedRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(ReinventedStrandsState())
        val state: StateFlow<ReinventedStrandsState> = _state.asStateFlow()

        /** Reads the first page again (My Atlas opened, or pulled). */
        fun refresh() = read(cursor = null)

        fun more() = _state.value.cursor?.let { read(it) }

        private fun read(cursor: String?) {
            if (_state.value.loading) return
            _state.update { it.copy(loading = true) }
            viewModelScope.launch {
                when (val answer = repository.strands(cursor)) {
                    is NetworkResult.Success ->
                        _state.update {
                            val groups = if (cursor == null) answer.data.strands else it.groups + answer.data.strands
                            it.copy(groups = groups, unseen = answer.data.unseenCount, cursor = answer.data.nextCursor, loading = false)
                        }
                    // An older server, the switch going off, or no connection: the section is simply not drawn.
                    is NetworkResult.Failure -> _state.update { it.copy(loading = false) }
                }
            }
        }

        /** The new ones on screen were seen: the server is told once; they stay listed, without the dot. */
        fun seen() {
            val ids = _state.value.groups.filter { it.unseen }.flatMap { group -> group.items.map { it.id } }
            if (ids.isEmpty()) return
            viewModelScope.launch {
                if (repository.strandsSeen(ids) is NetworkResult.Success) {
                    _state.update { s -> s.copy(groups = s.groups.map { it.copy(unseen = false) }, unseen = 0) }
                }
            }
        }
    }

/** "Went because of you" over My Atlas's days; nothing when there are none. */
@Composable
internal fun ReinventedStrandsSection(viewModel: ReinventedStrandsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Read each time My Atlas opens.
    LaunchedEffect(Unit) { viewModel.refresh() }
    if (state.groups.isEmpty()) return
    LaunchedEffect(state.unseen) {
        if (state.unseen > 0) {
            delay(SEEN_AFTER_MS)
            viewModel.seen()
        }
    }
    val links = LocalUriHandler.current
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.s1, vertical = Spacing.s2)
                .clip(RoundedCornerShape(16.dp))
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(16.dp))
                .padding(Spacing.s3)
                .testTag("reinventedPulse.strands"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            Text(
                "Went because of you",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier = Modifier.semantics { heading() },
            )
            if (state.unseen > 0) {
                Text(
                    "${state.unseen} new",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.primary600,
                    modifier = Modifier.testTag("reinventedPulse.strands.new"),
                )
            }
        }
        Text("Only you see these. Nobody else is told.", fontSize = 12.5.sp, color = PantopusColors.appTextSecondary)
        state.groups.groupBy { strandDay(it.day) }.forEach { (day, groups) ->
            Text(day, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextSecondary)
            groups.forEach { group ->
                StrandRow(group) {
                    val kind = if (group.source.type == "post") "posts" else "moments"
                    runCatching { links.openUri("pantopus://$kind/${group.source.id}") }
                }
            }
        }
        if (state.cursor != null) {
            Text(
                "Show more",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.primary600,
                modifier = Modifier.clickable(role = Role.Button, onClick = viewModel::more).padding(vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun StrandRow(
    group: ReinventedStrandGroupDto,
    onOpen: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .clickable(role = Role.Button, onClick = onOpen)
                .semantics(mergeDescendants = true) {
                    contentDescription = listOfNotNull(group.label, group.source.caption, "New".takeIf { group.unseen }).joinToString(". ")
                }.padding(vertical = 6.dp)
                .testTag("reinventedPulse.strand.${group.source.id}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Faces(group)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(group.label, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            group.source.caption?.takeIf { it.isNotBlank() }?.let { caption ->
                Text(caption, fontSize = 13.sp, color = PantopusColors.appTextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (group.unseen) Box(Modifier.size(9.dp).clip(CircleShape).background(PantopusColors.primary600))
    }
}

/** Up to three faces, overlapping. */
@Composable
private fun Faces(group: ReinventedStrandGroupDto) {
    val people = group.people.ifEmpty { group.items.mapNotNull { it.follower } }.take(3)
    Box(modifier = Modifier.size(width = (32 + 16 * (people.size - 1).coerceAtLeast(0)).dp, height = 32.dp)) {
        people.forEachIndexed { i, person ->
            MomentFace(person, 32.dp, Modifier.offset(x = (16 * i).dp).border(2.dp, PantopusColors.appSurface, CircleShape))
        }
    }
}

/** "Today", "Yesterday", then "Nov 26" (the server's day is the author's own, in Pacific time). */
private fun strandDay(day: String?): String {
    val date = day?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return "Earlier"
    val today = LocalDate.now(ZoneId.of("America/Los_Angeles"))
    return when (date) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> date.format(DateTimeFormatter.ofPattern("MMM d", Locale.US))
    }
}

private const val SEEN_AFTER_MS = 1_500L
