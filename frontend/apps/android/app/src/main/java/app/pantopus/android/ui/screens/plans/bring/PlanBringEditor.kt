@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.bring

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.closesKeyboardOnTapOrScroll
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanSwitchRow
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * The bring list, for the host (Plans for the holidays, board 19, spec A9): what is needed, who is bringing each, an X
 * to remove, "Add something", tap a row to rename it or add a note (and "I'm bringing this"), "Guests can add their
 * own", then Done. The same screen edits a plan not posted yet (the host form) and a posted one; [onDone] saves.
 */
@Suppress("LongParameterList", "LongMethod")
@Composable
fun PlanBringEditor(
    draft: BringDraft,
    onChange: (BringDraft) -> Unit,
    onDone: () -> Unit,
    onBack: () -> Unit,
    saving: Boolean = false,
    error: String? = null,
) {
    var adding by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<BringDraftItem?>(null) }
    var removing by remember { mutableStateOf<BringDraftItem?>(null) }
    val add = {
        if (adding.isNotBlank() && draft.canAdd) {
            onChange(draft.add(adding))
            adding = ""
        }
    }
    PlanPlainScaffold(
        onBack = onBack,
        title = "Bring list",
        modifier = Modifier.testTag("planBringEditor"),
        footer = {
            error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
            PrimaryButton(
                title = "Done",
                onClick = onDone,
                isLoading = saving,
                isEnabled = !saving,
                modifier = Modifier.fillMaxWidth().testTag("planBringDone"),
            )
            Text(
                text = "${draft.items.size} ${if (draft.items.size == 1) "thing" else "things"} · up to ${BringDraft.MAX_ITEMS}",
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            )
        },
    ) {
        Text(
            text = "List what's needed. Guests pick what they'll bring, in the app or in a browser.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )
        if (draft.items.isNotEmpty()) {
            Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp, vertical = Spacing.s1)) {
                draft.items.forEachIndexed { index, item ->
                    if (index > 0) PlanDivider()
                    BringEditRow(
                        item = item,
                        onEdit = { editing = item },
                        onRemove = { if (item.claimName != null) removing = item else onChange(draft.remove(item.key)) },
                    )
                }
            }
        }
        PlanField(label = "Add something") {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                Box(modifier = Modifier.weight(1f).testTag("planBringAddField")) {
                    PlanTextArea(
                        value = adding,
                        onValue = { adding = it.take(BringDraft.MAX_LABEL) },
                        placeholder = "Cranberry sauce",
                        label = "Add something",
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                        // Return adds too, then puts the keyboard away (the app's keyboard rule for a Done that adds).
                        keyboardActions =
                            KeyboardActions(
                                onDone = {
                                    add()
                                    defaultKeyboardAction(ImeAction.Done)
                                },
                            ),
                    )
                }
                AddButton(enabled = adding.isNotBlank() && draft.canAdd, onClick = add)
            }
        }
        Text(
            text = "Tap a name to change it or add a short note, like \"Two, please\".",
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
        )
        PlanSwitchRow(
            title = "Guests can add their own",
            caption = "\"I'll bring something else\"",
            checked = draft.guestsCanAdd,
            onChecked = { on -> onChange(draft.copy(guestsCanAdd = on)) },
            modifier = Modifier.testTag("planBringGuestsCanAdd"),
        )
    }
    editing?.let { item ->
        BringEditDialog(
            item = item,
            onSave = { changed ->
                onChange(draft.replace(changed))
                editing = null
            },
            onDismiss = { editing = null },
        )
    }
    removing?.let { item ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove ${item.label}?") },
            text = { Text("${item.claimName} was bringing it.") },
            confirmButton = {
                TextButton(onClick = {
                    onChange(draft.remove(item.key))
                    removing = null
                }) { Text("Remove", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Keep it") } },
        )
    }
}

/** "Two, please · Sam is bringing it", "You're bringing it", "Still open". */
internal fun bringWho(item: BringDraftItem): String {
    val who =
        when {
            item.mine -> "You're bringing it"
            item.claimName != null -> "${item.claimName} is bringing it"
            else -> "Still open"
        }
    return listOfNotNull(item.note.trim().takeIf(String::isNotEmpty), who).joinToString(" · ")
}

@Composable
private fun BringEditRow(
    item: BringDraftItem,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("planBringEditRow"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .clickable(role = Role.Button, onClickLabel = "Change ${item.label}", onClick = onEdit)
                    .padding(vertical = Spacing.s2)
                    .semantics(mergeDescendants = true) {},
        ) {
            Text(text = item.label, style = semibold, color = PantopusColors.appText)
            Text(text = bringWho(item), style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        Box(
            modifier =
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(Radii.pill))
                    .clickable(role = Role.Button, onClick = onRemove)
                    .clearAndSetSemantics {
                        contentDescription = "Remove ${item.label}"
                        role = Role.Button
                    },
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 18.dp, tint = PantopusColors.appText)
        }
    }
}

@Composable
private fun AddButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(Radii.lg))
                .background(if (enabled) PantopusColors.primary600 else PantopusColors.appSurfaceSunken)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .clearAndSetSemantics {
                    contentDescription = "Add to the list"
                    role = Role.Button
                }.testTag("planBringAdd"),
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(
            icon = PantopusIcon.Plus,
            contentDescription = null,
            size = 20.dp,
            tint = if (enabled) PantopusColors.appTextInverse else PantopusColors.appTextMuted,
        )
    }
}

/** A row's name and note (up to 80 characters), and "I'm bringing this" while nobody else is. */
@Composable
private fun BringEditDialog(
    item: BringDraftItem,
    onSave: (BringDraftItem) -> Unit,
    onDismiss: () -> Unit,
) {
    var label by remember(item.key) { mutableStateOf(item.label) }
    var note by remember(item.key) { mutableStateOf(item.note) }
    var mine by remember(item.key) { mutableStateOf(item.mine) }
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.closesKeyboardOnTapOrScroll(),
        title = { Text(item.label) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                PlanTextArea(
                    value = label,
                    onValue = { label = it.take(BringDraft.MAX_LABEL) },
                    placeholder = "Name",
                    label = "Name",
                    singleLine = true,
                )
                PlanTextArea(
                    value = note,
                    onValue = { note = it.take(BringDraft.MAX_NOTE) },
                    placeholder = "Two, please",
                    label = "Note",
                    singleLine = true,
                )
                if (item.claimName == null) {
                    PlanSwitchRow(title = "I'm bringing this", caption = null, checked = mine, onChecked = { mine = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = label.isNotBlank(),
                onClick = { onSave(item.copy(label = label.trim(), note = note.trim(), mine = mine && item.claimName == null)) },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private val semibold = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
