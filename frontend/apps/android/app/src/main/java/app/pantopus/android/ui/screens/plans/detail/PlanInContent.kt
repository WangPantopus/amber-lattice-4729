@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanPersonDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.isBusiness
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.isPlaydate
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.data.plans.takesKids
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.LocalPlanOpenProfile
import app.pantopus.android.ui.screens.plans.bring.PlanBringGuestCard
import app.pantopus.android.ui.screens.plans.colors
import app.pantopus.android.ui.screens.plans.components.PlanAvatarStack
import app.pantopus.android.ui.screens.plans.components.PlanBanner
import app.pantopus.android.ui.screens.plans.components.PlanBannerTone
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanLockLine
import app.pantopus.android.ui.screens.plans.components.PlanPrivateChip
import app.pantopus.android.ui.screens.plans.components.PlanStackButton
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.map.planH2
import app.pantopus.android.ui.screens.plans.repeat.PlanRepeatLine
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * J7: you're in. The exact place, the host's note, the people going and the group chat, only for people who are
 * in. [reveal] slides "You're in" up 8 dp and fades it in (300 to 450 ms of the reveal; a crossfade under Reduce
 * Motion).
 */
@Suppress("LongParameterList")
@Composable
internal fun ColumnScope.PlanInBody(
    plan: PlanDto,
    reveal: Boolean,
    reduceMotion: Boolean,
    busy: Boolean,
    viewerId: String?,
    onStillComing: (Boolean) -> Unit,
    onOpenChat: () -> Unit,
    /** Plans for the holidays (A8): "Change" on the banner opens the answer sheet (A7); null leaves it out. */
    onChangeAnswer: (() -> Unit)? = null,
    /** Plans for the holidays (A8 item 2): the bring list's actions; null leaves the list out. */
    bring: PlanBringActions? = null,
) {
    val context = LocalContext.current
    if (plan.myRequest?.reconfirmNeeded == true) StillComingCard(plan, busy, onStillComing)
    if (plan.isOnline) {
        // Board Online: the kind and "Online", the title, when and "Online · hosted from Camas", then "You're in" and
        // the link's card. No place, no map, no directions (Plans step 3).
        PlanTitleBlock(plan)
        InBanner(plan, reveal, reduceMotion, onChangeAnswer)
        PlanOnlineLinkCard(plan, hosting = false)
    } else {
        InBanner(plan, reveal, reduceMotion, onChangeAnswer)
        InPlaceTitle(plan)
    }
    // Business track B1 (D2): before a group deal settles (or after it fell short) D1's card; then "Your deal".
    plan.deal?.let { deal ->
        if (deal.isGroup && !deal.isUnlocked) PlanDealCard(plan, deal, onShare = rememberDealShare(plan))
        deal.mine?.let { mine -> PlanYourDealCard(plan, deal, mine) }
    }
    plan.place?.note?.takeIf(String::isNotBlank)?.let { note -> HostNote(plan, note) }
    val list = plan.bring
    if (list != null && bring != null) {
        PlanBringGuestCard(
            bring = list,
            busy = bring.busy,
            notice = bring.notice,
            onClaim = { bring.onClaim(it.id) },
            onGiveBack = { bring.onGiveBack(it.id) },
            onAdd = bring.onAdd,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        if (!plan.isOnline) {
            PlanStackButton(title = "Directions", icon = PantopusIcon.Navigation, onClick = {
                context.openDirections(plan)
            }, modifier = Modifier.weight(1f))
        }
        PlanStackButton(
            title = "Calendar",
            icon = PantopusIcon.Calendar,
            onClick = { context.addToCalendar(plan) },
            modifier = Modifier.weight(1f),
            spoken = "Add to calendar",
        )
        if (plan.chatRoomId != null) {
            PlanStackButton(title = "Group chat", icon = PantopusIcon.MessageCircle, onClick = onOpenChat, modifier = Modifier.weight(1f))
        }
    }
    PeopleLine(plan, viewerId)
}

/** J7's title, the exact place (with its address) and when. */
@Composable
private fun InPlaceTitle(plan: PlanDto) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (plan.isPrivate) PlanPrivateChip()
        Text(text = plan.title, style = planH2, color = PantopusColors.appText, modifier = Modifier.semantics { heading() })
        plan.place?.let { place ->
            Row(
                modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
            ) {
                PantopusIconImage(
                    icon = if (plan.placeKind == "home") PantopusIcon.Home else PantopusIcon.MapPin,
                    contentDescription = null,
                    size = Spacing.s4,
                    tint = PantopusColors.appTextSecondary,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    text =
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(place.name ?: "The place") }
                            place.address?.takeIf(String::isNotBlank)?.let { address ->
                                append(" · ")
                                append(address)
                            }
                        },
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextStrong,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        PlanInfoLine(PantopusIcon.Calendar, PlanFormat.whenLine(plan, long = true))
        PlanRepeatLine(PlanRepeatWords.cardLine(plan.repeat))
    }
}

/**
 * "Bring a friend" on a private plan whose host allows it (Plans step 1): [invited] once the guest made their link on
 * this visit, [making] while it is being made.
 */
internal data class PlanFriendInvite(
    val invited: Boolean,
    val making: Boolean,
    val onBring: () -> Unit,
)

/**
 * "Bring a friend" (Plans step 1): for a guest whose host lets guests bring one friend to a private plan, under J7. It
 * opens the share sheet with a one-person link; after that, or when the card says it was used, the row reads "You
 * invited a friend".
 */
@Composable
internal fun PlanFriendInviteRow(
    plan: PlanDto,
    friend: PlanFriendInvite,
) {
    val state = plan.viewer?.friendInvite ?: return
    if (!plan.isPrivate) return
    val done = state.used || friend.invited
    if (!done && !state.canInvite) return
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .then(
                    if (done) Modifier else Modifier.clickable(enabled = !friend.making, role = Role.Button, onClick = friend.onBring),
                ).padding(14.dp)
                .semantics(mergeDescendants = true) {}
                .testTag("planBringFriend"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(
            if (done) PantopusIcon.Check else PantopusIcon.UserPlus,
            if (done) PantopusColors.successBg else PantopusColors.primary100,
            if (done) PantopusColors.success else PantopusColors.primary700,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (done) "You invited a friend" else "Bring a friend",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text =
                    if (done) {
                        "${plan.hostFirst} sees who you invited. Each guest can bring one friend."
                    } else {
                        "${plan.hostFirst} lets each guest bring one. Send a link from your phone; it works for one person."
                    },
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
            )
        }
        if (!done) {
            PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
        }
    }
}

@Composable
private fun InBanner(
    plan: PlanDto,
    reveal: Boolean,
    reduceMotion: Boolean,
    onChangeAnswer: (() -> Unit)? = null,
) {
    val progress = remember { Animatable(if (reveal) 0f else 1f) }
    LaunchedEffect(reveal) {
        if (!reveal) {
            // No reveal, or it just ended (an online plan's header ends it on its own clock): the banner shows in full,
            // even when its own fade was still waiting to start.
            progress.snapTo(1f)
            return@LaunchedEffect
        }
        progress.snapTo(0f)
        if (!reduceMotion) kotlinx.coroutines.delay(300)
        progress.animateTo(1f, tween(150))
    }
    val mine = plan.myRequest
    // "Sam said yes · just now" (board J7), "· 12 min ago" later; a rule's yes gets its time too, as on iOS. An online
    // plan points at its link (board Online): "Sam let you in. The link is below."
    val rule = mine?.decidedBy == "rule"
    val said = if (rule) "You got in right away" else "${plan.hostFirst} said yes"
    // Plans for the holidays (board 20, A8): the guest's numbers, "2 adults, 1 kid", with "Change".
    val counts = if (onChangeAnswer != null && plan.answersWithCounts(invited = false)) myCounts(plan) else null
    val subtitle =
        when {
            counts != null -> counts
            plan.isOnline && rule -> "You got in right away. The link is below."
            plan.isOnline -> "${plan.hostFirst} let you in. The link is below."
            else -> listOfNotNull(said, PlanFormat.ago(mine?.decidedAt)).joinToString(" · ")
        }
    // Business track B1 (D2 item 1): a group deal that unlocked takes the banner's words; no second banner.
    val unlocked = plan.deal?.takeIf { it.isUnlocked }?.stateText
    PlanBanner(
        title = unlocked ?: "You're in",
        subtitle = if (unlocked != null) "Everyone who's in gets the deal" else subtitle,
        icon = PantopusIcon.Check,
        tone = PlanBannerTone.Ok,
        trailing = if (counts != null && onChangeAnswer != null) ({ PlanBannerChange(onChangeAnswer) }) else null,
        modifier =
            Modifier.graphicsLayer {
                alpha = progress.value
                translationY = if (reduceMotion) 0f else (1f - progress.value) * 8.dp.toPx()
            },
    )
}

/** What a guest can do on the bring list (A8 item 2), and the line under it. */
internal data class PlanBringActions(
    val busy: Boolean,
    val notice: String?,
    val onClaim: (String) -> Unit,
    val onGiveBack: (String) -> Unit,
    val onAdd: (String) -> Unit,
)

/** "2 adults, 1 kid" with kids welcome, else "Just you" or "3 people": the person's own answer (A8). */
internal fun myCounts(plan: PlanDto): String {
    val adults = plan.myRequest?.partySize ?: 1
    val kids = plan.myRequest?.kidsCount ?: 0
    return when {
        plan.takesKids -> PlanFormat.people(adults, kids)
        adults <= 1 -> "Just you"
        else -> "$adults people"
    }
}

/** "Change" on a banner (A8): opens the answer sheet. */
@Composable
internal fun PlanBannerChange(onClick: () -> Unit) {
    Text(
        text = "Change",
        style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
        color = PantopusColors.primary600,
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(Radii.pill))
                .clickable(role = Role.Button, onClickLabel = "Change your answer", onClick = onClick)
                .padding(horizontal = Spacing.s2, vertical = 11.dp)
                .testTag("planAnswerChange"),
    )
}

/** "You said maybe" (A8): a quiet banner with "Change"; no bring list and no place for someone who said maybe. */
@Composable
internal fun PlanMaybeBanner(
    plan: PlanDto,
    onChange: () -> Unit,
) {
    PlanBanner(
        title = "You said maybe",
        subtitle = "${plan.hostFirst} sees your answer",
        icon = PantopusIcon.HelpCircle,
        tone = PlanBannerTone.Neutral,
        modifier = Modifier.testTag("planMaybeBanner"),
        trailing = { PlanBannerChange(onChange) },
    )
}

@Composable
private fun HostNote(
    plan: PlanDto,
    note: String,
) {
    val kind = plan.planKind
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.xl))
                .background(kind?.colors?.tint ?: PantopusColors.appSurfaceSunken)
                .padding(14.dp)
                .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        PlanLockLine("From ${plan.hostFirst}, only for people who are in")
        Text(text = note, style = PantopusTextStyle.body, color = PantopusColors.appText)
    }
}

/** One person in "who's going": "Sam (host)", "you + 1", "Alex + 1"; a business hosting is named in full, never its first word. */
private fun personWords(
    person: PlanPersonDto,
    plan: PlanDto,
    viewerId: String?,
    you: String,
): String {
    val first = if (person.isHost && plan.isBusiness) plan.hostFirst else PlanFormat.firstName(person.displayName)
    return when {
        viewerId != null && person.userId == viewerId -> you
        person.isHost -> "$first (host)"
        person.partySize > 1 -> "$first + ${person.partySize - 1}"
        else -> first
    }
}

/** "Sam (host), you + 1, Alex + 1, Jordan and 2 more", with their initials: parties and up to 4 names, as on iOS. */
@Composable
private fun PeopleLine(
    plan: PlanDto,
    viewerId: String?,
) {
    val people = plan.people.orEmpty()
    if (people.isEmpty()) return
    val myParty = plan.myRequest?.partySize ?: 1
    val you = if (plan.isPlaydate || myParty <= 1) "you" else "you + ${myParty - 1}"
    val names = people.map { person -> personWords(person, plan, viewerId, you) }.toMutableList()
    // The server lists everyone in; if this phone's account isn't among them yet, "you" still goes after the host.
    if (you !in names) names.add(if (people.firstOrNull()?.isHost == true) 1 else 0, you)
    val shown = names.take(4)
    val rest = names.size - shown.size
    val nameList =
        when {
            rest > 0 -> shown.joinToString(", ") + " and $rest more"
            shown.size > 1 -> shown.dropLast(1).joinToString(", ") + " and " + shown.last()
            else -> shown.joinToString()
        }
    // Plans for the holidays (A8 item 3): with kids welcome the line ends "· 3 kids".
    val kids = plan.headcount?.kids?.takeIf { plan.takesKids && it > 0 }
    val line = if (kids != null) "$nameList · $kids ${if (kids == 1) "kid" else "kids"}" else nameList
    // Each photo opens that person's profile; TalkBack offers the same as actions on the line.
    val openProfile = LocalPlanOpenProfile.current
    val shownPeople = people.take(4)
    Row(
        modifier =
            Modifier.semantics(mergeDescendants = true) {
                if (openProfile != null) customActions = profileActions(shownPeople, openProfile)
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanAvatarStack(names = shownPeople.map { it.displayName to it.userId }, onOpen = openProfile)
        Text(text = line, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary, modifier = Modifier.weight(1f))
    }
}

/** TalkBack's "Open Sam's profile" actions for the people on a line, one for each person with an account. */
private fun profileActions(
    people: List<PlanPersonDto>,
    open: (String) -> Unit,
): List<CustomAccessibilityAction> =
    people.mapNotNull { person ->
        person.userId?.let { id ->
            CustomAccessibilityAction("Open ${person.displayName ?: "their"}'s profile") {
                open(id)
                true
            }
        }
    }

/** "Sam moved the watch party. Still coming?" with its two answers (the in-app side of the H11 push, in its words). */
@Composable
private fun StillComingCard(
    plan: PlanDto,
    busy: Boolean,
    onAnswer: (Boolean) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.xl))
                .background(PantopusColors.warningBg)
                .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val host = plan.hostFirst
        val noun = PlanFormat.noun(plan)
        // An online plan's new place is its link, in the server's push words (Plans step 3, as on iPhone).
        val placeTitle = if (plan.isOnline) "$host changed the link" else "$host changed the place"
        val newPlace = if (plan.isOnline) "It has a new link now." else "It's at a new place now."
        val atNewPlace = if (plan.isOnline) "with a new link" else "at a new place"
        val (title, message) =
            when (plan.myRequest?.reconfirmReason) {
                "place" -> placeTitle to "$newPlace Still coming?"
                "both" -> "$host changed the $noun" to "Now ${PlanFormat.dayAt(plan)}, $atNewPlace. Still coming?"
                else -> "$host moved the $noun" to "Now ${PlanFormat.dayAt(plan)}. Still coming?"
            }
        Text(
            text = title,
            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
        )
        Text(
            text = message,
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextStrong,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton(title = "Can't make it", onClick = { onAnswer(false) }, modifier = Modifier.weight(1f), isEnabled = !busy)
            PrimaryButton(title = "Still coming", onClick = { onAnswer(true) }, modifier = Modifier.weight(1f), isLoading = busy)
        }
    }
}
