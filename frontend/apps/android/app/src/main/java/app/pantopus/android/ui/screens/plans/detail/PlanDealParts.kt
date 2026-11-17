package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanDealDto
import app.pantopus.android.data.api.models.plans.PlanDealMineDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanPersonDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.screens.plans.components.PlanBusinessShape
import app.pantopus.android.ui.screens.plans.components.PlanDealTag
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.map.planH3
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the business track, B1: a business's deal on its plan's page (07-screens D1 and D2, pictures
 * 07 and 08). Every sentence is the server's (`text`, `condition_text`, `group.left_text`, `if_short_text`,
 * `state_text`, `mine.*`); the app adds only the counts it was sent ("8 in · 4 more to unlock") and the labels the
 * screens name ("Group deal", "Your deal", "Ready").
 */

/** A group deal (as opposed to one for everyone who joins). */
internal val PlanDealDto.isGroup: Boolean get() = scope == DEAL_GROUP

/** A group deal that is still counting. */
internal val PlanDealDto.isOpen: Boolean get() = isGroup && state == DEAL_OPEN

/** A group deal that reached its number. */
internal val PlanDealDto.isUnlocked: Boolean get() = isGroup && state == DEAL_UNLOCKED

/** The guest's deal is ready to use, so leaving gives it up (D2 item 5). */
internal val PlanDto.dealReady: Boolean get() = deal?.mine?.state == MINE_READY

/**
 * D1, the deal card under the business's name: the tag ("Deal" or "Group deal") and the time left, the deal's sentence,
 * a group deal's condition, bar and counts, and what happens if it falls short (or how it settled). [onShare] adds
 * "Share: every friend who joins counts" (an open group deal, for a guest).
 */
@Composable
internal fun PlanDealCard(
    plan: PlanDto,
    deal: PlanDealDto,
    onShare: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("planDealCard"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().planCard().padding(Spacing.s4).semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlanDealTag(text = if (deal.isGroup) "Group deal" else "Deal")
                Spacer(modifier = Modifier.weight(1f))
                deal.group?.leftText?.takeIf { deal.isOpen }?.let { left ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PantopusIconImage(
                            icon = PantopusIcon.Clock,
                            contentDescription = null,
                            size = 16.dp,
                            tint = PantopusColors.appTextSecondary,
                        )
                        Text(text = left, style = PantopusTextStyle.small, color = PantopusColors.appTextStrong)
                    }
                }
            }
            Text(text = deal.text, style = planH3.copy(fontWeight = FontWeight.Bold), color = PantopusColors.appText)
            deal.conditionText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextStrong) }
            DealProgress(deal)
            val line = if (deal.isOpen) deal.ifShortText else deal.stateText
            line?.let {
                Text(
                    text = it,
                    style = PantopusTextStyle.small,
                    color = if (deal.isUnlocked) PantopusColors.success else PantopusColors.appTextSecondary,
                )
            }
        }
        if (onShare != null && deal.isOpen && plan.shareUrl != null) {
            GhostButton(
                title = "Share: every friend who joins counts",
                onClick = onShare,
                modifier = Modifier.height(50.dp).testTag("planDealShare"),
            )
        }
    }
}

/** The plan's deal card when it has a deal (the host's page: no Share there, the page has its own). */
@Composable
internal fun PlanDealCardOf(plan: PlanDto) {
    plan.deal?.let { deal -> PlanDealCard(plan, deal) }
}

/** A group deal's bar and counts while it is open or unlocked: "8 in · 4 more to unlock". */
@Composable
private fun DealProgress(deal: PlanDealDto) {
    val group = deal.group ?: return
    if (!deal.isOpen && !deal.isUnlocked) return
    val size = group.size.coerceAtLeast(1)
    val fraction = if (deal.isUnlocked) 1f else group.isIn.coerceIn(0, size).toFloat() / size
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.appSurfaceSunken)
                .clearAndSetSemantics {},
    ) {
        if (fraction > 0f) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth(fraction)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(if (deal.isUnlocked) PantopusColors.success else PantopusColors.primary600),
            )
        }
    }
    if (deal.isOpen) {
        Text(
            text =
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)) { append("${group.isIn} in") }
                    if (group.left > 0) append(" · ${group.left} more to unlock")
                },
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
        )
    }
}

/**
 * D2's "Your deal" (picture 08), for a guest who is in: "Ready" (or "Used {8:40 PM}", or "Not unlocked yet"), what
 * they get (something free reads the guest's first name with it), the business and the time, and how to claim it.
 * Nothing when the deal fell short with nothing smaller (`none`).
 */
@Composable
internal fun PlanYourDealCard(
    plan: PlanDto,
    deal: PlanDealDto,
    mine: PlanDealMineDto,
) {
    if (mine.state == MINE_NONE) return
    val usedAt = PlanFormat.clockAt(mine.usedAt, plan.timezone)
    val what = mine.short ?: deal.short ?: deal.text
    // Something free names the guest (K8, D2): "{Dana}: a free appetizer for the table".
    val headline = mine.name?.takeIf(String::isNotBlank)?.let { "$it: ${what.replaceFirstChar(Char::lowercaseChar)}" } ?: what
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .padding(Spacing.s4)
                .testTag("planYourDeal")
                .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlanOverline("Your deal", modifier = Modifier.weight(1f))
            when {
                mine.state == MINE_USED -> DealPill(text = usedAt?.let { "Used $it" } ?: "Used", ok = false, tag = "planDealUsed")
                mine.state == MINE_WAITING -> DealPill(text = "Not unlocked yet", ok = false, tag = null)
                else -> DealPill(text = "Ready", ok = true, tag = null)
            }
        }
        Text(text = headline, style = planH3.copy(fontWeight = FontWeight.Bold), color = PantopusColors.appText)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            PlanBusinessShape(size = 36.dp, avatarUrl = plan.business?.avatarUrl)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = PlanFormat.hostName(plan),
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(text = PlanFormat.whenLine(plan), style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            }
        }
        mine.text?.takeIf { mine.state != MINE_WAITING }?.let { how ->
            PlanDivider()
            Text(text = how, style = PantopusTextStyle.small, color = PantopusColors.appTextStrong)
        }
    }
}

/** "Ready" in the ok color, or a quiet pill ("Used 8:40 PM", "Not unlocked yet"). */
@Composable
private fun DealPill(
    text: String,
    ok: Boolean,
    tag: String?,
) {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(Radii.pill))
                .background(if (ok) PantopusColors.successLight else PantopusColors.appSurfaceSunken)
                .padding(horizontal = 10.dp, vertical = 3.dp)
                .then(if (tag != null) Modifier.testTag(tag) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        if (ok) PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 12.dp, tint = PantopusColors.success)
        Text(
            text = text,
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
            color = if (ok) PantopusColors.success else PantopusColors.appTextSecondary,
            maxLines = 1,
        )
    }
}

/** A plan's page shares its link (the system share sheet) from the deal card. */
@Composable
internal fun rememberDealShare(plan: PlanDto): () -> Unit {
    val context = LocalContext.current
    return { context.sharePlan(plan) }
}

/** What a Going row needs for "Mark used" (business track B1, staff): the plan's deal and zone, and the action. */
internal class GuestDeal(
    val plan: PlanDto,
    val onMarkUsed: ((PlanPersonDto) -> Unit)?,
) {
    /** "Used 8:40 PM" for a guest whose free thing was marked used; null otherwise. */
    fun usedLine(person: PlanPersonDto): String? {
        val deal = person.deal?.takeIf { it.state == MINE_USED } ?: return null
        return PlanFormat.clockAt(deal.usedAt, plan.timezone)?.let { "Used $it" } ?: "Used"
    }
}

/**
 * "Mark used" on a Going row while the guest's free thing is ready (07-screens "Mark used"); the "…" with Remove stays
 * beside it. Asks first: "Mark Dana's deal used?" with the deal's words and "This can't be undone."
 */
@Composable
internal fun PlanMarkUsed(
    person: PlanPersonDto,
    deal: GuestDeal,
    busy: Boolean,
) {
    val onMark = deal.onMarkUsed ?: return
    if (person.deal?.state != MINE_READY) return
    var confirm by remember { mutableStateOf(false) }
    val first = PlanFormat.firstName(person.displayName ?: "Someone")
    val what = deal.plan.deal?.let { it.short ?: it.text }
    Box(
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.appSurfaceSunken)
                .clickable(enabled = !busy, role = Role.Button) { confirm = true }
                .padding(horizontal = Spacing.s3)
                .testTag("planDealMarkUsed")
                .clearAndSetSemantics {
                    contentDescription = "Mark $first's deal used"
                    role = Role.Button
                },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Mark used",
            style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
            maxLines = 1,
        )
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Mark $first's deal used?") },
            text = { Text(listOfNotNull(what?.let { "$it." }, "This can't be undone.").joinToString(" ")) },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    onMark(person)
                }) { Text("Mark used") }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Not now") } },
        )
    }
}

private const val DEAL_GROUP = "group"
private const val DEAL_OPEN = "open"
private const val DEAL_UNLOCKED = "unlocked"
private const val MINE_READY = "ready"
private const val MINE_USED = "used"
private const val MINE_WAITING = "waiting"
private const val MINE_NONE = "none"
