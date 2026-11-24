@file:Suppress("LongMethod", "MagicNumber", "LongParameterList")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.sheetKeyboardRules
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Links for one purpose (board 21's last section, contract v1.3; founder 9.1, 2026-11-23): each link shows its own
 * parts, can end on a date and can be switched off. The owner sees how often it was opened and the last day, never by
 * whom. A link's key is the owner's: the app never shows it in full on screen (Copy link and Send carry it).
 */

private const val NAME_MOST = 60

/** The short words for a link's parts on its row: "Work, Known for, Record". */
private fun partsSummary(parts: Map<String, Boolean>): String {
    val on = parts.filterValues { it }.keys
    val words =
        listOfNotNull(
            "Says".takeIf { "says" in on },
            "Get to know".takeIf { "prompts" in on },
            "Shelf".takeIf { "shelf" in on },
            "City".takeIf { "city" in on },
            "Work".takeIf { "work" in on },
            "Known for".takeIf { "known_for" in on },
            "Record".takeIf { on.any { it.startsWith("record_") } },
            "Met in person".takeIf { "met" in on },
            "Doors".takeIf { "doors" in on },
            "Reviews".takeIf { "reviews" in on },
        )
    return if (words.isEmpty()) "Portrait, name and rings only" else words.joinToString(", ")
}

private val DAY = DateTimeFormatter.ofPattern("MMMM d", Locale.US)
private val DAY_YEAR = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US)

private fun day(date: LocalDate): String = date.format(if (date.year == LocalDate.now().year) DAY else DAY_YEAR)

/** "ends December 31 · opened 3 times", or why it doesn't open. */
private fun linkStatus(link: ShareLink): String {
    val opened =
        when (link.opens) {
            0 -> "not opened yet"
            1 -> "opened once"
            else -> "opened ${link.opens} times"
        }
    val state =
        when {
            link.switchedOff -> "switched off"
            !link.live && link.endsOn != null -> "ended ${day(link.endsOn)}"
            link.endsOn != null -> "ends ${day(link.endsOn)}"
            else -> null
        }
    return listOfNotNull(state, opened).joinToString(" · ")
}

/** Board 21: "Links for one purpose", each link a row, then "Make a link for one purpose". */
@Composable
internal fun ShareLinksSection(
    share: ProfileShareState,
    saving: Set<String>,
    onSetEnabled: (Boolean) -> Unit,
    onOpen: (ShareLink) -> Unit,
    onMake: () -> Unit,
) {
    val enabled = share.linksEnabled ?: return
    Column(Modifier.fillMaxWidth().padding(top = 6.dp).testTag("profileSources.share.links"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SourcesOverline("Links for one purpose", modifier = Modifier.padding(horizontal = 4.dp))
        Column(Modifier.sourcesCard()) {
            ShareSwitchRow(
                title = "Use links for one purpose",
                note = if (enabled) null else "Off, none of your links open.",
                on = enabled,
                enabled = "links_enabled" !in saving,
                tag = "profileSources.share.links_enabled",
                onToggle = onSetEnabled,
            )
            if (enabled) {
                share.links.forEach { link ->
                    SourcesDivider()
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .clickable(role = Role.Button) { onOpen(link) }
                                .padding(horizontal = 16.dp, vertical = 12.dp)
                                .testTag("profileSources.share.link.${link.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(link.name, style = SourcesType.rowTitle.copy(color = if (link.live) PantopusColors.appText else PantopusColors.appTextMuted))
                            Text("${partsSummary(link.parts)} · ${linkStatus(link)}", style = SourcesType.caption)
                        }
                        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                    }
                }
                SourcesDivider()
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Button, onClick = onMake)
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .testTag("profileSources.share.makeLink"),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 18.dp, tint = PantopusColors.primary600)
                    Text("Make a link for one purpose", style = SourcesType.rowTitle.copy(color = PantopusColors.primary600))
                }
            }
        }
        Text(
            "Each link shows its own parts, can end on a date, and can be switched off. You see how often it was opened, never by whom.",
            style = SourcesType.caption,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

/** When a link ends: no end, or a week, a month or three months from today; an existing date stays offered. */
private enum class EndChoice(
    val label: String,
    val days: Long?,
) {
    None("No end date", null),
    Week("In a week", 7),
    Month("In a month", 30),
    Quarter("In 3 months", 91),
}

/**
 * Make a link for one purpose, or open one (no board of its own: drawn with board 21's rows and switches). A new link
 * takes a name, its parts and when it ends. An existing one offers Copy link, Send, See it as a visitor, its parts and
 * end (each saved at once), Switch off or on, and Delete.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun ShareLinkSheet(
    link: ShareLink?,
    share: ProfileShareState,
    saving: Boolean,
    onCreate: (name: String, parts: Map<String, Boolean>, endsOn: LocalDate?) -> Unit,
    onUpdate: (parts: Map<String, Boolean>?, endsOn: LocalDate?, clearEnd: Boolean, switchedOff: Boolean?) -> Unit,
    onDelete: () -> Unit,
    onCopy: (ShareLink) -> Unit,
    onSend: (ShareLink) -> Unit,
    onPreview: (ShareLink) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by rememberSaveable { mutableStateOf("") }
    var draftParts by remember { mutableStateOf(emptyMap<String, Boolean>()) }
    var draftEnd by rememberSaveable { mutableStateOf(EndChoice.None) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    val parts = link?.parts ?: draftParts
    // Only parts with something in them have a switch, as on the main link (contract §6 `has_content`).
    val shown = PART_WORDS.keys.filter { key -> share.parts.any { it.key == key && it.hasContent } }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PantopusColors.appBg,
        modifier = Modifier.sheetKeyboardRules().testTag("profileSources.share.linkSheet"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = link?.name ?: "Make a link for one purpose",
                style = SourcesType.h3,
                modifier = Modifier.semantics { heading() },
            )
            if (link == null) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(NAME_MOST) },
                    label = { Text("What it's for") },
                    placeholder = { Text("For the Hartley job") },
                    singleLine = true,
                    supportingText = { Text("Only you see this name. ${name.length} of $NAME_MOST") },
                    modifier = Modifier.fillMaxWidth().testTag("profileSources.share.linkName"),
                )
            } else {
                Text(linkStatus(link).replaceFirstChar { it.uppercase() }, style = SourcesType.caption)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
                    LinkButton("Copy link", primary = true, enabled = link.live, modifier = Modifier.weight(1f)) { onCopy(link) }
                    LinkButton("Send", primary = false, enabled = link.live, modifier = Modifier.weight(1f)) { onSend(link) }
                    LinkButton("See it", primary = false, enabled = link.key != null, modifier = Modifier.weight(1f)) { onPreview(link) }
                }
            }
            Column(Modifier.sourcesCard()) {
                SourcesOverline("What it shows", modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp))
                FixedShareRow("Portrait, name and rings", "Always shown", divider = false)
                shown.forEach { key ->
                    SourcesDivider()
                    val words = PART_WORDS.getValue(key)
                    ShareSwitchRow(
                        title = words.title,
                        note = words.note,
                        on = parts[key] == true,
                        enabled = !saving,
                        tag = "profileSources.share.linkPart.$key",
                        onToggle = { on ->
                            if (link == null) draftParts = draftParts + (key to on) else onUpdate(mapOf(key to on), null, false, null)
                        },
                    )
                }
            }
            Column(Modifier.sourcesCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SourcesOverline("When it ends")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    link?.endsOn?.let { end ->
                        EndChip("Ends ${day(end)}", selected = true, enabled = false) {}
                    }
                    EndChoice.entries.forEach { choice ->
                        val selected = if (link == null) draftEnd == choice else (choice == EndChoice.None && link.endsOn == null)
                        EndChip(choice.label, selected = selected, enabled = !saving) {
                            val date = choice.days?.let { LocalDate.now().plusDays(it) }
                            if (link == null) {
                                draftEnd = choice
                            } else {
                                onUpdate(null, date, date == null, null)
                            }
                        }
                    }
                }
            }
            if (link == null) {
                LinkButton("Make the link", primary = true, enabled = name.isNotBlank() && !saving, modifier = Modifier.fillMaxWidth()) {
                    onCreate(name, shown.associateWith { draftParts[it] == true }, draftEnd.days?.let { LocalDate.now().plusDays(it) })
                }
            } else {
                Column(Modifier.sourcesCard()) {
                    ShareSwitchRow(
                        title = "Link works",
                        note = if (link.switchedOff) "Switched off. Anyone who opens it finds nothing." else null,
                        on = !link.switchedOff,
                        enabled = !saving,
                        tag = "profileSources.share.linkWorks",
                        onToggle = { on -> onUpdate(null, null, false, !on) },
                    )
                }
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable(role = Role.Button, enabled = !saving) { confirmDelete = true }
                            .testTag("profileSources.share.linkDelete"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Delete this link", style = SourcesType.title.copy(color = PantopusColors.error))
                }
            }
        }
    }
    if (confirmDelete && link != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete “${link.name}”?") },
            text = { Text("Anyone who opens it will find nothing. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Keep it") } },
        )
    }
}

@Composable
private fun LinkButton(
    title: String,
    primary: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (primary && enabled) PantopusColors.primary600 else PantopusColors.appSurface)
                .then(if (primary && enabled) Modifier else Modifier.border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(12.dp)))
                .clickable(role = Role.Button, enabled = enabled, onClick = onClick)
                .padding(horizontal = 8.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            style =
                SourcesType.title.copy(
                    color =
                        when {
                            !enabled -> PantopusColors.appTextMuted
                            primary -> PantopusColors.appTextInverse
                            else -> PantopusColors.appText
                        },
                ),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun EndChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(50))
                .clickable(role = Role.RadioButton, enabled = enabled, onClick = onClick)
                .semantics { this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(if (selected) PantopusColors.appText else PantopusColors.appSurfaceSunken)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                label,
                style =
                    SourcesType.caption.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = if (selected) PantopusColors.appTextInverse else PantopusColors.appTextStrong,
                    ),
            )
        }
    }
}
