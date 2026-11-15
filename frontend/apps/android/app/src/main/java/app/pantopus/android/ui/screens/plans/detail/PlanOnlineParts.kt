@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.detail

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.PlanOnlineLink
import app.pantopus.android.data.plans.PlanState
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.data.plans.planState
import app.pantopus.android.ui.screens.plans.colors
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanLockLine
import app.pantopus.android.ui.screens.plans.components.PlanOnlineHero
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusElevations
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.pantopusShadow
import kotlinx.coroutines.delay

/*
 * An online plan's page once you're in, or as its host (Plans step 3, board Online): the link's card and the footer's
 * "Join", which opens the link in the browser. Pantopus never runs the call.
 */

/**
 * The top of a plan page: the map ([PlanMiniMap]), or for an online plan (board Online) the kind's soft color and the
 * video glyph, for everyone alike: an online plan has no place, area or pin to show.
 */
@Composable
internal fun PlanPageHeader(
    plan: PlanDto,
    reveal: Boolean,
    reduceMotion: Boolean,
    onRevealDone: () -> Unit,
) {
    if (!plan.isOnline) {
        PlanMiniMap(plan = plan, reveal = reveal, reduceMotion = reduceMotion, onRevealDone = onRevealDone)
        return
    }
    PlanOnlineHero(plan.planKind ?: PlanKind.WATCH_PARTY, modifier = Modifier.fillMaxWidth().height(PLAN_MAP_HEIGHT), lowered = 26.dp)
    // No pin to reveal: the reveal ends after as long as the map's takes (450 ms, 150 under Reduce Motion), so "You're
    // in" (300 ms wait, 150 ms fade) has slid in by then.
    val done by rememberUpdatedState(onRevealDone)
    LaunchedEffect(reveal) {
        if (!reveal) return@LaunchedEffect
        delay(if (reduceMotion) ONLINE_REVEAL_REDUCED_MS else ONLINE_REVEAL_MS)
        done()
    }
}

/** As long as [PlanMiniMap]'s reveal (its `REVEAL_MS`, and 150 ms under Reduce Motion). */
private const val ONLINE_REVEAL_MS = 450L
private const val ONLINE_REVEAL_REDUCED_MS = 150L

/** The link an online plan joins with, when this viewer may read it (the host and people who are in), else null. */
internal val PlanDto.joinLink: String?
    get() = place?.link?.takeIf { isOnline && PlanOnlineLink.parse(it) != null }

/** The link's site ("meet.google.com"), as the server names it, else as the phone reads it. */
internal val PlanDto.joinHost: String?
    get() = place?.linkHost?.takeIf(String::isNotBlank) ?: PlanOnlineLink.parse(place?.link)?.host

/**
 * The link's card (board Online): its site on the kind's soft tile with the link glyph, who added it, and that only
 * people who are in see it. The host reads "The link you added". Nothing for a plan that isn't online, has no link for
 * this viewer, or is over.
 */
@Composable
internal fun PlanOnlineLinkCard(
    plan: PlanDto,
    hosting: Boolean,
) {
    if (plan.planState == PlanState.CANCELLED || plan.planState == PlanState.ENDED) return
    val host = plan.joinHost ?: return
    val kind = plan.planKind ?: return
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .padding(14.dp)
                .semantics(mergeDescendants = true) {}
                .testTag("planOnlineLinkCard"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            PlanIconTile(PantopusIcon.Link, kind.colors.tint, kind.colors.accent, size = 40.dp, glyph = 20.dp, corner = 12.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = host, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
                Text(
                    text = if (hosting) "The link you added" else "The link ${plan.hostFirst} added",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            }
        }
        PlanLockLine("Only people who are in see the link")
    }
}

/**
 * The footer of an online plan for its host and the people who are in (board Online): "Join", which opens the link in
 * the browser, and "Opens meet.google.com. Pantopus doesn't run the call."; [leave] adds "Can't make it" for a guest.
 * Null when the plan isn't online or its link isn't there for this viewer, so the page keeps its own footer.
 */
internal fun onlineJoinFooter(
    plan: PlanDto,
    onUnopened: () -> Unit,
    leave: (() -> Unit)? = null,
    busy: Boolean = false,
): (@Composable ColumnScope.() -> Unit)? {
    val link = plan.joinLink ?: return null
    val host = plan.joinHost
    return {
        val context = LocalContext.current
        PlanJoinButton(onClick = { if (!context.openPlanLink(link)) onUnopened() })
        PlanFooterCaption(host?.let { "Opens $it. Pantopus doesn't run the call." } ?: "Pantopus doesn't run the call.")
        leave?.let { PlanTextButton(title = "Can't make it", onClick = it, danger = true, enabled = !busy) }
    }
}

/** "Join" (board Online's footer): the primary button with the video glyph. [tag] is its test id. */
@Composable
internal fun PlanJoinButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tag: String = "planJoinOnline",
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = 50.dp)
                .alpha(if (enabled) 1f else 0.5f)
                .pantopusShadow(PantopusElevations.primary, shape)
                .clip(shape)
                .background(PantopusColors.primary600)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s4, vertical = 10.dp)
                .testTag(tag)
                .clearAndSetSemantics {
                    contentDescription = JOIN
                    role = Role.Button
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
    ) {
        PantopusIconImage(icon = PantopusIcon.Video, contentDescription = null, size = 20.dp, tint = PantopusColors.appTextInverse)
        Text(text = JOIN, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appTextInverse)
    }
}

private const val JOIN = "Join"

/**
 * Opens an online plan's link in the browser (or the app the link belongs to). Only a link the phone also reads as one
 * the server allows (https, a real host name) is opened; false when it can't be, so the page can say so.
 */
internal fun Context.openPlanLink(link: String): Boolean {
    val parsed = PlanOnlineLink.parse(link) ?: return false
    return try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(parsed.link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }
}

/** What the page says when the link couldn't be opened (no browser, say). */
internal const val PLAN_LINK_UNOPENED = "Couldn't open the link. Check that a browser is installed."
