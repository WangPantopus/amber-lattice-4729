@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.bring

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanBringDto
import app.pantopus.android.data.api.models.plans.PlanBringItemDto
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * The bring list on the host's page (Plans for the holidays, board 4, A6 item 3): "{4} of {6} taken", a row an item
 * with its note and, on the right, who is bringing it or "Still open"; the last row "Add something" opens A9.
 */
@Composable
fun PlanBringHostCard(
    bring: PlanBringDto,
    onOpen: () -> Unit,
    /** The green line at the top after the host's list was saved with a thing newly theirs. */
    claimed: PlanBringClaimed? = null,
) {
    BringCard(title = "Bring list", count = "${bring.taken} of ${bring.items.size} taken", tag = "planBringHostCard") {
        claimed?.let { ClaimedLine(it) }
        bring.items.forEachIndexed { index, item ->
            if (index > 0) PlanDivider()
            BringRow(item) { ClaimEnd(item) }
        }
        if (bring.items.isNotEmpty()) PlanDivider()
        AddRow(title = "Add something", onClick = onOpen, tag = "planBringHostAdd")
    }
}

/**
 * The bring list on a guest's page (board 20, A8 item 2): "{n} still open", a name on the right or "I'll bring it",
 * this person's own item "You're bringing it" with "Give back", then "Bring something else" (a one-line field and
 * "Add") when guests may add. [notice] is the line under the list ("Sam got to that one first."). [claimed] is the
 * green line at the top after "I'll bring it" or "Bring something else" went through: what, and who can see it.
 */
@Suppress("LongParameterList")
@Composable
fun PlanBringGuestCard(
    bring: PlanBringDto,
    busy: Boolean,
    notice: String?,
    onClaim: (PlanBringItemDto) -> Unit,
    onGiveBack: (PlanBringItemDto) -> Unit,
    onAdd: (String) -> Unit,
    claimed: PlanBringClaimed? = null,
    modifier: Modifier = Modifier,
) {
    var adding by remember { mutableStateOf<String?>(null) }
    BringCard(title = "Bring list", count = "${bring.openCount} still open", tag = "planBringGuestCard", modifier = modifier) {
        claimed?.let { ClaimedLine(it) }
        bring.items.forEachIndexed { index, item ->
            if (index > 0) PlanDivider()
            val claim = item.claim
            BringRow(item, sub = if (claim?.mine == true) "You're bringing it" else item.note) {
                when {
                    claim?.mine == true -> TextAction("Give back", enabled = !busy, tag = "planBringGiveBack") { onGiveBack(item) }
                    claim != null -> ClaimEnd(item)
                    else -> OutlineAction("I'll bring it", enabled = !busy, tag = "planBringClaim") { onClaim(item) }
                }
            }
        }
        if (bring.guestsCanAdd && bring.items.size < BringDraft.MAX_ITEMS) {
            if (bring.items.isNotEmpty()) PlanDivider()
            val typed = adding
            if (typed == null) {
                AddRow(title = "Bring something else", onClick = { adding = "" }, tag = "planBringSomethingElse")
            } else {
                val add = {
                    if (typed.isNotBlank()) {
                        onAdd(typed.trim())
                        adding = null
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                ) {
                    Box(modifier = Modifier.weight(1f).testTag("planBringSomethingElseField")) {
                        PlanTextArea(
                            value = typed,
                            onValue = { adding = it.take(BringDraft.MAX_LABEL) },
                            placeholder = "What you'll bring",
                            label = "Bring something else",
                            singleLine = true,
                            keyboardOptions = sentenceDone,
                            keyboardActions =
                                KeyboardActions(
                                    onDone = {
                                        add()
                                        defaultKeyboardAction(ImeAction.Done)
                                    },
                                ),
                        )
                    }
                    OutlineAction("Add", enabled = !busy && typed.isNotBlank(), tag = "planBringSomethingElseAdd") { add() }
                }
            }
        }
    }
    notice?.let {
        Text(
            text = it,
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.testTag("planBringNotice"),
        )
    }
}

@Composable
private fun BringCard(
    title: String,
    count: String,
    tag: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp, vertical = 10.dp).testTag(tag)) {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s1), verticalAlignment = Alignment.CenterVertically) {
            Text(text = title, style = semibold, color = PantopusColors.appText, modifier = Modifier.weight(1f))
            Text(text = count, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        content()
    }
}

/**
 * What a person just said they'd bring ([label], as the list shows it) and whose plan it is ([hostFirst]); [byHost]
 * when it is the host saying so on their own plan.
 */
data class PlanBringClaimed(
    val label: String,
    val hostFirst: String,
    val byHost: Boolean = false,
) {
    /** "You're bringing bread." The first letter is lowercased when the second one is ("Bread" → "bread", "IPA" stays). */
    val bringing: String
        get() {
            val thing = label.trim()
            val lower = thing.length > 1 && thing[1].isLowerCase()
            return "You're bringing ${if (lower) thing.replaceFirstChar { it.lowercase() } else thing}."
        }

    /** "Jo and the other guests can see it."; on the host's own plan "Your guests can see it." */
    val seenBy: String get() = if (byHost) "Your guests can see it." else "$hostFirst and the other guests can see it."
}

/** The green line at the top of the bring list: "You're bringing bread. Jo and the other guests can see it." */
@Composable
private fun ClaimedLine(claimed: PlanBringClaimed) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = Spacing.s1)
                .clip(shape)
                .background(PantopusColors.successBg)
                .border(1.dp, PantopusColors.successLight, shape)
                .padding(horizontal = Spacing.s3, vertical = 10.dp)
                .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }
                .testTag("plan.bring.claimed"),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(
            icon = PantopusIcon.Check,
            contentDescription = null,
            size = 18.dp,
            tint = PantopusColors.success,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(
            text =
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(claimed.bringing) }
                    append(" ")
                    append(claimed.seenBy)
                },
            style = PantopusTextStyle.small,
            color = PantopusColors.success,
            modifier = Modifier.weight(1f),
        )
    }
}

/** One item: its name and the line under it (its note, or "You're bringing it"), then [end] on the right. */
@Composable
private fun BringRow(
    item: PlanBringItemDto,
    sub: String? = item.note,
    end: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(text = item.label, style = semibold, color = PantopusColors.appText)
            sub?.takeIf(String::isNotBlank)?.let {
                Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            }
        }
        end()
    }
}

/** Who is bringing it, with their first letter ("You" for the person looking), or "Still open". */
@Composable
private fun ClaimEnd(item: PlanBringItemDto) {
    val claim = item.claim
    if (claim == null) {
        Text(
            text = "Still open",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextSecondary,
            modifier =
                Modifier
                    .clip(RoundedCornerShape(Radii.pill))
                    .background(PantopusColors.appSurfaceSunken)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
        )
        return
    }
    val name = if (claim.mine) "You" else claim.name
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PlanAvatar(name = name, seed = claim.name, size = 28.dp)
        Text(text = name, style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
    }
}

@Composable
private fun TextAction(
    title: String,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        text = title,
        style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
        color = if (enabled) PantopusColors.primary600 else PantopusColors.appTextMuted,
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(Radii.pill))
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s2, vertical = 11.dp)
                .testTag(tag),
    )
}

@Composable
private fun OutlineAction(
    title: String,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        text = title,
        style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
        color = if (enabled) PantopusColors.primary600 else PantopusColors.appTextMuted,
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(Radii.lg))
                .border(1.dp, if (enabled) PantopusColors.primary600 else PantopusColors.appBorder, RoundedCornerShape(Radii.lg))
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .testTag(tag),
    )
}

/** "+ Add something" / "+ Bring something else". */
@Composable
private fun AddRow(
    title: String,
    onClick: () -> Unit,
    tag: String,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(vertical = Spacing.s2)
                .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 18.dp, tint = PantopusColors.primary600)
        Text(text = title, style = semibold, color = PantopusColors.primary600)
    }
}

private val semibold = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)

/** A one-line field that starts sentences with a capital and ends with Done. */
private val sentenceDone = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done)
