@file:Suppress("MagicNumber", "LongParameterList", "LongMethod")

package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.plans.PlanBringDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanHostInvitesDto
import app.pantopus.android.data.api.models.plans.PlanInviteListDto
import app.pantopus.android.data.api.models.plans.PlanPersonDto
import app.pantopus.android.data.api.models.plans.PlanRequestsResponse
import app.pantopus.android.data.plans.KidsAgeBand
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.PlanState
import app.pantopus.android.data.plans.isAtHome
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planState
import app.pantopus.android.data.plans.repeats
import app.pantopus.android.ui.components.DestructiveButton
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PantopusTextField
import app.pantopus.android.ui.components.sheetKeyboardRules
import app.pantopus.android.ui.screens.plans.LocalPlanOpenProfile
import app.pantopus.android.ui.screens.plans.bring.PlanBringClaimed
import app.pantopus.android.ui.screens.plans.bring.PlanBringHostCard
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanAvatarStack
import app.pantopus.android.ui.screens.plans.components.PlanBanner
import app.pantopus.android.ui.screens.plans.components.PlanBannerTone
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanPrivateChip
import app.pantopus.android.ui.screens.plans.components.PlanSpotsMeter
import app.pantopus.android.ui.screens.plans.components.PlanStatusChip
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.PlanWell
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.guests.PlanGuestCounts
import app.pantopus.android.ui.screens.plans.guests.PlanGuestCountsRow
import app.pantopus.android.ui.screens.plans.guests.PlanGuestsUi
import app.pantopus.android.ui.screens.plans.guests.guestCounts
import app.pantopus.android.ui.screens.plans.map.planH2
import app.pantopus.android.ui.screens.plans.map.planH3
import app.pantopus.android.ui.screens.plans.opensPlanProfile
import app.pantopus.android.ui.screens.plans.repeat.PlanRepeatLine
import app.pantopus.android.ui.screens.plans.repeat.PlanSeriesActions
import app.pantopus.android.ui.screens.plans.repeat.PlanSeriesHostCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/**
 * The host's bring list. [claimed] is the thing the host's last save of the list made theirs: the green line shows over
 * the list only while that thing is still the host's on the list the page shows.
 */
@Composable
private fun HostBringList(
    bring: PlanBringDto,
    hostFirst: String,
    claimed: String?,
    onOpen: () -> Unit,
) {
    val mine = claimed?.takeIf { label -> bring.items.any { it.claim?.mine == true && it.label.trim() == label } }
    PlanBringHostCard(bring, onOpen = onOpen, claimed = mine?.let { PlanBringClaimed(it, hostFirst, byHost = true) })
}

/** H9: your plan, as host. */
@Composable
internal fun ColumnScope.PlanHostBody(
    plan: PlanDto,
    requests: PlanRequestsResponse?,
    viewerId: String?,
    busy: Boolean,
    onOpenRequests: () -> Unit,
    onInvite: () -> Unit,
    onMessageGuests: () -> Unit,
    onChange: () -> Unit,
    onCancel: () -> Unit,
    onRemove: (PlanPersonDto) -> Unit,
    series: PlanSeriesActions? = null,
    /** Plans for the holidays (A6): the host's answers, for the people line; null while they load. */
    guests: PlanInviteListDto? = null,
    /** Opens Who's coming (A5). */
    onOpenGuests: () -> Unit = {},
    /** Opens the bring list (A9). */
    onOpenBring: () -> Unit = {},
    /** The thing the host's last save of the bring list made theirs ("Bread"), for the line over the list; null: none. */
    bringClaimed: String? = null,
    /** Business track B1: staff mark a guest's free thing used. */
    onMarkUsed: (PlanPersonDto) -> Unit = {},
    /** Business track B5: the guest list with money (C3), on a plan that takes the bill here. */
    checks: PlanChecksEntry? = null,
    /** The holidays' extras changed the plan (a date picked): read it again. */
    onExtrasChanged: () -> Unit = {},
    /** The holidays' board 29: "Plan the next one with the same people" on a plan that is over; null leaves it out. */
    onPlanNext: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val closed = plan.planState == PlanState.CANCELLED || plan.planState == PlanState.ENDED
    HostHeading(plan)
    if (closed) HostClosedBanner(plan)
    // The holidays' find a date (board 25): while picking, the count and "Pick a date".
    PlanDatesHostCard(plan, onPicked = onExtrasChanged)
    // Business track B1: the business's deal as guests see it (its count and time left, or how it settled).
    PlanDealCardOf(plan)
    HostSeries(plan, closed, series)
    // An online plan's link, as the people in see it (Plans step 3); "Join" is in the footer. Nothing once it's over.
    PlanOnlineLinkCard(plan, hosting = true)
    val pending = requests?.pending.orEmpty()
    val waiting = requests?.waitlisted.orEmpty()
    val waitingCount = requests?.waitlisted?.size ?: plan.waitlistCount
    val count = maxOf(plan.requestsCount ?: 0, pending.size)
    if (!closed && count > 0) {
        RequestsCard(count, pending.mapNotNull { it.user?.displayName }, onOpenRequests)
    } else if (!closed && waitingCount > 0) {
        // Nobody to answer, but people are waiting for a spot: the host can still see who (H10's waitlist).
        WaitlistCard(waitingCount, waiting.mapNotNull { it.user?.displayName }, onOpenRequests)
    }
    InviteCard(plan, closed, onOpen = onInvite)
    // Business track B5: the three totals, opening the guest list with money (C3).
    PlanChecksCard(plan, checks)
    // Plans for the holidays (A6): the three counts and the people line with their numbers, both opening Who's coming,
    // in place of the going list (Who's coming has every guest, with or without an account, and Remove).
    HostPeople(plan, guests, onOpenGuests) {
        GoingSection(plan, viewerId, busy, closed, asked = count > 0 || waitingCount > 0, onRemove = onRemove, onMarkUsed = onMarkUsed)
    }
    // Plans for the holidays (A6 item 3): the bring list, while the plan has one and is still on.
    plan.bring?.takeIf { !closed }?.let { HostBringList(it, plan.hostFirst, bringClaimed, onOpenBring) }
    // The holidays' chip in (extras section 3): the same card with the count; who paid is on Who's coming.
    PlanChipInIfAny(plan)
    // The holidays' gift exchange: the count and "Draw names now"; never a name but the host's own, should they join.
    PlanGiftIfAny(plan, isHost = true)
    // The holidays' photos afterwards (extras section 5, board 29), on a plan that is over.
    PlanPhotosIfAny(plan)
    PlanNextWithSamePeople(onPlanNext)
    if (closed && plan.chatRoomId != null) {
        // The chat stays to read once the plan is over (as on iOS).
        GhostButton(title = "Read the group chat", onClick = onMessageGuests)
    }
    if (!closed) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Plans for the holidays (A6 item 4): "Share link" first, opening the invite sheet's one link for everyone.
            if (plan.showsShareLink) {
                GhostButton(title = "Share link", onClick = onInvite, modifier = Modifier.weight(1f).testTag("planShareLink"))
            }
            if (plan.chatRoomId != null) {
                GhostButton(title = "Message guests", onClick = onMessageGuests, modifier = Modifier.weight(1f))
            }
            // No Share for a private plan: the Invite row above invites each person (Plans step 1).
            if (!plan.isPrivate) GhostButton(title = "Share", onClick = { context.sharePlan(plan) }, modifier = Modifier.weight(1f))
        }
        Column {
            PlanTextButton(title = changeTitle(plan), onClick = onChange, enabled = !busy)
            PlanTextButton(title = "Cancel plan", onClick = onCancel, danger = true, enabled = !busy)
        }
    }
}

/**
 * Who is coming, on the host's page: the counts and the people line (Plans for the holidays, A6) on a private plan
 * whose card carries `answers`; otherwise the shipped going list ([going]). A public plan keeps it (as on iPhone).
 */
@Composable
private fun HostPeople(
    plan: PlanDto,
    guests: PlanInviteListDto?,
    onOpenGuests: () -> Unit,
    going: @Composable () -> Unit,
) {
    val counts = plan.hostCounts
    if (counts != null) HostAnswers(counts, PlanGuestsUi(plan = plan, list = guests), onOpenGuests) else going()
}

/** The host's counts (Plans for the holidays, A6) on a private plan whose card carries `answers`; null otherwise. */
private val PlanDto.hostCounts: PlanGuestCounts? get() = guestCounts()?.takeIf { isPrivate }

/** "Share link" leads the buttons (A6 item 4) on such a plan while its host can invite. */
private val PlanDto.showsShareLink: Boolean get() = hostCounts != null && invites?.canInvite == true

/**
 * The host's answers (Plans for the holidays, board 4, A6 item 2): the three counts, then the people coming with their
 * numbers ("Dana + 2 kids, Sam, Priya + 1 and 2 more") and a chevron. Either opens Who's coming.
 */
@Composable
private fun HostAnswers(
    counts: PlanGuestCounts,
    guests: PlanGuestsUi,
    onOpen: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("planHostAnswers"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Open who's coming", onClick = onOpen)) {
            PlanGuestCountsRow(counts)
        }
        val line = guests.comingLine
        if (line != null) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button, onClickLabel = "Open who's coming", onClick = onOpen)
                        .semantics(mergeDescendants = true) {}
                        .testTag("planHostPeopleLine"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                PlanAvatarStack(names = guests.coming.take(4).map { it.name to (it.userId ?: it.key) })
                Text(text = line, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary, modifier = Modifier.weight(1f))
                PantopusIconImage(
                    icon = PantopusIcon.ChevronRight,
                    contentDescription = null,
                    size = 16.dp,
                    tint = PantopusColors.appTextMuted,
                )
            }
        }
    }
}

/**
 * A repeating plan that is still open (board Regulars, Plans step 2): the series, Skip, Change and Stop repeating,
 * whatever the switch says.
 */
@Composable
private fun HostSeries(
    plan: PlanDto,
    closed: Boolean,
    series: PlanSeriesActions?,
) {
    if (closed || series == null || !plan.repeats) return
    PlanSeriesHostCard(plan, series)
}

/** H9's way to H11: "Change the time or place", or for an online plan "Change the time or link" (as on iPhone). */
private fun changeTitle(plan: PlanDto): String = if (plan.isOnline) "Change the time or link" else "Change the time or place"

/** "You're hosting" (and "Private", Plans step 1), the title, and when and where. */
@Composable
private fun HostHeading(plan: PlanDto) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PlanStatusChip(
                text = if (plan.planState == PlanState.CANCELLED) "Cancelled" else "You're hosting",
                icon = PantopusIcon.Flag,
                iconTint = PantopusColors.primary600,
            )
            // A private plan says so: only the people the host invites see it.
            if (plan.isPrivate) PlanPrivateChip()
        }
        Text(text = plan.title, style = planH2, color = PantopusColors.appText, modifier = Modifier.semantics { heading() })
        // An online plan says "Online" also while its private parts are being read again (it has no place to name).
        val where =
            when {
                plan.isAtHome -> "Your place"
                plan.isOnline -> PlanFormat.ONLINE
                else -> plan.place?.name ?: plan.area?.label
            }
        Text(
            text = listOfNotNull(PlanFormat.whenLine(plan, long = true), where).joinToString(" · "),
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextStrong,
        )
        PlanRepeatLine(PlanRepeatWords.cardLine(plan.repeat))
    }
}

/** A cancelled plan says who was told and the host's note; an ended one says so (as on iOS). */
@Composable
private fun HostClosedBanner(plan: PlanDto) {
    if (plan.planState == PlanState.CANCELLED) {
        PlanBanner(
            title = "You cancelled this plan",
            subtitle = "Everyone who was in or waiting was told. The pin is off the map.",
            icon = PantopusIcon.XCircle,
            tone = PlanBannerTone.Neutral,
        )
        plan.cancelNote?.trim()?.takeIf(String::isNotEmpty)?.let { note ->
            Text(text = "Your note: “$note”", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    } else {
        // The holidays' photos afterwards (board 29): "This was Saturday, Nov 21" / "12 people came", when it has them.
        val photos = plan.photos
        PlanBanner(
            title = photos?.banner ?: "This plan has ended",
            subtitle = photos?.cameText,
            icon = PantopusIcon.CheckCircle,
            tone = PlanBannerTone.Neutral,
        )
    }
}

@Composable
private fun RequestsCard(
    count: Int,
    names: List<String>,
    onOpen: () -> Unit,
) {
    val who =
        when (names.size) {
            // The names aren't loaded yet (as on iOS).
            0 -> if (count == 1) "Someone asked to join" else "$count people asked to join"
            1 -> "${names[0]} asked to join"
            2 -> "${names[0]} and ${names[1]} asked to join"
            else -> "${names[0]}, ${names[1]} and ${names.size - 2} more asked to join"
        }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(14.dp)
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(PantopusIcon.Bell, PantopusColors.primary100, PantopusColors.primary700)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (count == 1) "1 request" else "$count requests",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(text = who, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

/** "Invite friends": people they know, by email or by text (PlanInviteSheet), with how it stands (as on iOS). */
@Composable
private fun InviteCard(
    plan: PlanDto,
    closed: Boolean,
    onOpen: () -> Unit,
) {
    val invites = plan.invites?.takeIf { !closed && it.canInvite } ?: return
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(14.dp)
                .semantics(mergeDescendants = true) {}
                .testTag("planInviteCard"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(PantopusIcon.UserPlus, PantopusColors.primary100, PantopusColors.primary700)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Invite friends",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = PlanInviteHostLines.summary(invites, plan.isAtHome),
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
                maxLines = 2,
            )
        }
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

/** The host's invitation summary (the same on iOS). */
internal object PlanInviteHostLines {
    /** "3 waiting · 1 said yes", or what inviting does before anyone is invited. */
    fun summary(
        invites: PlanHostInvitesDto,
        atHome: Boolean,
    ): String {
        val parts =
            listOfNotNull(
                invites.invited.takeIf { it > 0 }?.let { "$it waiting" },
                invites.saidYes.takeIf { it > 0 }?.let { "$it said yes" },
                invites.cantMakeIt.takeIf { it > 0 }?.let { "$it can't make it" },
            )
        if (parts.isNotEmpty()) return parts.joinToString(" · ")
        return if (atHome) {
            "People on Pantopus, by email or text. They see your address once they say they're in."
        } else {
            "People on Pantopus, by email or text. They're in as soon as they say yes."
        }
    }
}

@Composable
private fun WaitlistCard(
    count: Int,
    names: List<String>,
    onOpen: () -> Unit,
) {
    val who =
        when (names.size) {
            0 -> if (count == 1) "Someone is waiting for a spot" else "$count people are waiting for a spot"
            1 -> "${names[0]} is waiting for a spot"
            2 -> "${names[0]} and ${names[1]} are waiting for a spot"
            else -> "${names.take(2).joinToString(", ")} and ${names.size - 2} more are waiting for a spot"
        }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(14.dp)
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(PantopusIcon.List, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Waitlist · $count",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(text = who, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

@Composable
private fun GoingSection(
    plan: PlanDto,
    viewerId: String?,
    busy: Boolean,
    closed: Boolean,
    asked: Boolean,
    onRemove: (PlanPersonDto) -> Unit,
    onMarkUsed: (PlanPersonDto) -> Unit = {},
) {
    val guests = plan.people.orEmpty().filter { !it.isHost && it.userId != viewerId }
    // A cancelled or ended plan with nobody in has no "going" to show.
    if (closed && guests.isEmpty()) return
    val taken = plan.spots - plan.spotsLeft
    Column {
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.s1), verticalAlignment = Alignment.CenterVertically) {
            PlanOverline("Going · $taken of ${plan.spots}", modifier = Modifier.weight(1f))
            Text(
                text =
                    when {
                        plan.spotsLeft <= 0 -> "Full"
                        plan.spotsLeft == 1 -> "1 spot left"
                        else -> "${plan.spotsLeft} spots left"
                    },
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
            )
        }
        PlanSpotsMeter(spots = plan.spots, taken = taken, modifier = Modifier.padding(bottom = 6.dp))
        if (guests.isEmpty()) {
            Text(
                text =
                    when {
                        plan.people == null -> "Guest details aren't available yet."
                        asked -> "Nobody's in yet."
                        else -> "Nobody yet. We'll tell you when someone asks."
                    },
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(top = Spacing.s2),
            )
        }
        guests.forEachIndexed { index, person ->
            // Nobody can be removed from a plan that's over (as on iOS, which drops the list there).
            GuestRow(
                person,
                first = index == 0,
                atHome = plan.isAtHome,
                busy = busy,
                onRemove = onRemove.takeUnless { closed },
                deal = GuestDeal(plan, onMarkUsed.takeUnless { closed }),
            )
        }
    }
}

@Composable
private fun GuestRow(
    person: PlanPersonDto,
    first: Boolean,
    atHome: Boolean,
    busy: Boolean,
    onRemove: ((PlanPersonDto) -> Unit)?,
    deal: GuestDeal? = null,
) {
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    val name = person.displayName ?: "Someone"
    val title = if (person.partySize > 1) "$name + ${person.partySize - 1}" else name
    val kids =
        person.kidsCount?.let { count ->
            listOfNotNull("$count ${if (count == 1) "kid" else "kids"}", KidsAgeBand.rangeLabel(person.kidsAgeBands))
                .joinToString(", ")
        }
    val subtitle = guestSubtitle(person, name, kids, deal)
    Column(modifier = Modifier.fillMaxWidth()) {
        if (!first) PlanDivider()
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            // The guest's photo and name open their profile; the options stay on the button beside them.
            Row(
                modifier = Modifier.weight(1f).opensPlanProfile(person.userId, LocalPlanOpenProfile.current),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                PlanAvatar(name = name, seed = person.userId, avatarUrl = person.avatarUrl, userId = person.userId)
                Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                    Text(
                        text = title,
                        style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                        color = PantopusColors.appText,
                    )
                    Text(text = subtitle, style = PantopusTextStyle.small.copy(fontSize = 13.sp), color = PantopusColors.appTextSecondary)
                }
            }
            if (deal != null && person.requestId != null) PlanMarkUsed(person, deal, busy)
            if (person.requestId != null && onRemove != null) {
                Box {
                    PlanRoundButton(
                        icon = PantopusIcon.MoreHorizontal,
                        label = "Options for ${PlanFormat.firstName(name)}",
                        onClick = { if (!busy) menu = true },
                        glass = false,
                    )
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("Remove from plan", color = PantopusColors.error) },
                            onClick = {
                                menu = false
                                confirm = true
                            },
                        )
                    }
                }
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Remove ${PlanFormat.firstName(name)}?") },
            text = {
                Text(
                    if (atHome) {
                        "${PlanFormat.firstName(name)} has already seen the address. They lose the plan, the note and the chat from now on."
                    } else {
                        "They lose the plan, the exact place, the note and the chat from now on."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    onRemove?.invoke(person)
                }) { Text("Remove", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Not now") } },
        )
    }
}

/** A Going row's second line (board H9, as on iOS): "Verified · about 1 mi · you hosted Alex before". */
private fun guestSubtitle(
    person: PlanPersonDto,
    name: String,
    kids: String?,
    deal: GuestDeal?,
): String =
    listOfNotNull(
        if (person.onMyWay) "On the way" else null,
        if (person.verifiedAddress) "Verified" else null,
        PlanFormat.distance(person.distanceBand),
        kids,
        when {
            person.hostedBefore == true -> "you hosted ${PlanFormat.firstName(name)} before"
            person.newToPantopus == true -> "new to Pantopus"
            else -> null
        },
        if (person.reconfirmNeeded == true) "asked “Still coming?”" else null,
        // Business track B1: "Used 8:40 PM" once staff marked the guest's free thing used.
        deal?.usedLine(person),
        // Business track B2: what the guest paid ("Paid $18.00").
        person.paid?.text?.let { "Paid $it" },
    ).joinToString(" · ").replaceFirstChar { it.titlecase() }.ifBlank { "Going" }

/** H12: cancel the plan, with an optional note to everyone. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PlanCancelSheet(
    plan: PlanDto,
    requests: PlanRequestsResponse?,
    note: String,
    onNote: (String) -> Unit,
    onCancel: () -> Unit,
    onKeep: () -> Unit,
    onCancelDate: (() -> Unit)? = null,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // People in count with their parties ("Chris + 1" is two), as on H9 and H11; everyone asking or waiting is told too.
    val inCount = plan.people.orEmpty().filter { !it.isHost }.sumOf { it.partySize.coerceAtLeast(1) }
    val asked = requests?.let { it.pending.size + it.waitlisted.size } ?: ((plan.requestsCount ?: 0) + plan.waitlistCount)
    ModalBottomSheet(
        onDismissRequest = onKeep,
        sheetState = sheet,
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.sheetKeyboardRules(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4).padding(bottom = Spacing.s6).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s4),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "Cancel this plan?",
                    style = planH3,
                    color = PantopusColors.appText,
                    modifier = Modifier.semantics { heading() },
                )
                Text(text = cancelSentence(inCount, asked), style = PantopusTextStyle.body, color = PantopusColors.appTextSecondary)
            }
            PantopusTextField(
                label = "Add a note · optional",
                value = note,
                onValueChange = onNote,
                placeholder = "Sorry, something came up.",
            )
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                if (onCancelDate != null) {
                    // A repeating plan (Plans step 2): this date only (the next one is posted now), or the rest too.
                    DestructiveButton(
                        title = "Cancel this date",
                        onClick = onCancelDate,
                        modifier = Modifier.height(50.dp).testTag("planCancelThisDate"),
                    )
                    DestructiveButton(
                        title = "Cancel and stop repeating",
                        onClick = onCancel,
                        modifier = Modifier.height(50.dp).testTag("planCancelStopRepeating"),
                    )
                } else {
                    DestructiveButton(title = "Cancel plan", onClick = onCancel, modifier = Modifier.height(50.dp))
                }
                GhostButton(title = "Keep plan", onClick = onKeep, modifier = Modifier.height(50.dp))
            }
            PlanWell {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
                    Text(
                        text = "Removing one guest instead?",
                        style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                        color = PantopusColors.appText,
                    )
                    Text(
                        text =
                            "Open their row on your plan. If the plan is at your place, they've already seen the address; " +
                                "they lose the plan, the note and the chat from then on.",
                        style = PantopusTextStyle.small,
                        color = PantopusColors.appTextSecondary,
                    )
                }
            }
        }
    }
}

private fun cancelSentence(
    inCount: Int,
    asked: Int,
): String {
    val people =
        buildList {
            if (inCount > 0) add(if (inCount == 1) "the 1 person who's in" else "the $inCount people who are in")
            if (asked > 0) add(if (asked == 1) "the 1 who asked" else "the $asked who asked")
        }
    val tell = if (people.isEmpty()) "Nobody has joined yet." else "We'll tell ${people.joinToString(" and ")}."
    return "$tell The pin comes off the map and the chat closes."
}
