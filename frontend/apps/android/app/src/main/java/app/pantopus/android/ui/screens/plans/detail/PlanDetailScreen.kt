@file:Suppress("MagicNumber", "LongParameterList", "LongMethod", "CyclomaticComplexMethod")

package app.pantopus.android.ui.screens.plans.detail

import android.Manifest
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.ai.AIScreenContext
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.PlanCannotAsk
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanState
import app.pantopus.android.data.plans.PlanViewerStanding
import app.pantopus.android.data.plans.hasPrivatePart
import app.pantopus.android.data.plans.isBusiness
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.isPicking
import app.pantopus.android.data.plans.isPlaydate
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.placeShownToInvitee
import app.pantopus.android.data.plans.planState
import app.pantopus.android.data.plans.saidMaybe
import app.pantopus.android.data.plans.seriesContinues
import app.pantopus.android.data.plans.standing
import app.pantopus.android.ui.components.ErrorState
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.RefreshOnStoreChange
import app.pantopus.android.ui.components.ToastController
import app.pantopus.android.ui.components.ToastHost
import app.pantopus.android.ui.screens.place.HubVerificationTarget
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.guests.PlanGuestsUi
import app.pantopus.android.ui.screens.plans.map.PlanRowsSkeleton
import app.pantopus.android.ui.screens.plans.map.askWord
import app.pantopus.android.ui.screens.plans.repeat.PlanSeriesActions
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.rememberReduceMotion
import kotlinx.coroutines.launch

/** The report reasons a plan offers (the posts report queue's vocabulary), in iOS's order. */
private val reportReasons =
    listOf(
        "safety" to "Something unsafe",
        "harassment" to "Harassment",
        "inappropriate" to "Inappropriate",
        "spam" to "Spam or a scam",
        "misinformation" to "Not a real plan",
        "other" to "Something else",
    )

/**
 * One plan, as the person looking stands with it: before you're in (J1, J2), requested (J5), on the waitlist (J6),
 * you're in (J7), didn't work out (J8), a playdate you can't see yet (J9), or your own plan as its host (H9).
 */
@Composable
fun PlanDetailScreen(
    onBack: () -> Unit,
    onOpenPlan: (String) -> Unit,
    onOpenRequests: (String) -> Unit,
    onChange: (String) -> Unit,
    onHost: (kind: String?, again: String?) -> Unit,
    onOpenChat: (roomId: String, title: String, planId: String) -> Unit,
    onOpenVerification: (HubVerificationTarget) -> Unit,
    onSeeAllPlans: () -> Unit,
    /** Ask Pantopus about this plan (AI assistant phase 1); null hides the button. */
    onAskPantopus: ((AIScreenContext) -> Unit)? = null,
    /** A repeating plan's next date, opened in place of the date its host just skipped (Plans step 2). */
    onOpenNextDate: (String) -> Unit = onOpenPlan,
    /** Who's coming (Plans for the holidays, A5), from the host's counts and people line. */
    onOpenGuests: (String) -> Unit = {},
    /** The bring list for the host (Plans for the holidays, A9). */
    onOpenBring: (String) -> Unit = {},
    /** Business track B5: the guest's check (C1, C2). */
    onOpenCheck: (String) -> Unit = {},
    /** Business track B5: the business's guest list with money (C3). */
    onOpenChecks: (String) -> Unit = {},
    viewModel: PlanDetailViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val toast = remember { ToastController() }
    val scope = rememberCoroutineScope()
    val openVerification: () -> Unit = { scope.launch { onOpenVerification(viewModel.verificationTarget()) } }
    LifecycleResumeEffect(Unit) {
        viewModel.onScreen(true)
        viewModel.load()
        onPauseOrDispose { viewModel.onScreen(false) }
    }
    // A plan push marks Plans out of date: read again, so "You're in" reveals while the page is open.
    RefreshOnStoreChange(viewModel::load)
    LaunchedEffect(ui.notice) {
        ui.notice?.let {
            toast.info(it)
            viewModel.noticeShown()
        }
    }
    // A skipped date's next one (Plans step 2) opens in its place.
    LaunchedEffect(ui.nextPlanId) {
        val next = ui.nextPlanId ?: return@LaunchedEffect
        viewModel.nextDateOpened()
        onOpenNextDate(next)
    }
    // "Bring a friend" (Plans step 1): the guest's one link goes out from their own phone, with the words to send.
    val context = LocalContext.current
    LaunchedEffect(ui.friendLink) {
        val link = ui.friendLink ?: return@LaunchedEffect
        val send =
            Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, "${link.message} ${link.url}")
        runCatching {
            context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        viewModel.friendLinkShared()
    }
    Box(modifier = Modifier.fillMaxSize().testTag("planDetail")) {
        when (val state = ui.state) {
            PlanDetailUiState.Loading -> PlanLoading(onBack)
            is PlanDetailUiState.Failed ->
                PlanPlainScaffold(onBack = onBack) {
                    ErrorState(headline = "Couldn't load this plan", message = state.message, onRetry = viewModel::load)
                }
            PlanDetailUiState.Gone -> PlanGone(onBack = onBack, onSeeAll = onSeeAllPlans)
            is PlanDetailUiState.PlaydateLocked ->
                PlaydateLocked(
                    city = state.city,
                    invitedBy = state.invitedBy,
                    onClose = onBack,
                    onVerify = openVerification,
                    onSeeOthers = onSeeAllPlans,
                )
            is PlanDetailUiState.Ready ->
                PlanReady(
                    plan = state.plan,
                    ui = ui,
                    viewModel = viewModel,
                    onBack = onBack,
                    onOpenPlan = onOpenPlan,
                    onOpenRequests = { onOpenRequests(state.plan.id) },
                    onOpenGuests = { onOpenGuests(state.plan.id) },
                    onOpenBring = { onOpenBring(state.plan.id) },
                    onOpenCheck = { onOpenCheck(state.plan.id) },
                    onOpenChecks = { onOpenChecks(state.plan.id) },
                    onChange = { onChange(state.plan.id) },
                    onHost = onHost,
                    onOpenChat = { room -> onOpenChat(room, PlanFormat.shortTitle(state.plan), state.plan.id) },
                    onVerify = openVerification,
                    onSeeAllPlans = onSeeAllPlans,
                    onAskPantopus = onAskPantopus,
                )
        }
        ToastHost(controller = toast, modifier = Modifier.align(Alignment.TopCenter))
    }
}

@Composable
private fun PlanReady(
    plan: PlanDto,
    ui: PlanDetailUi,
    viewModel: PlanDetailViewModel,
    onBack: () -> Unit,
    onOpenPlan: (String) -> Unit,
    onOpenRequests: () -> Unit,
    onOpenGuests: () -> Unit,
    onOpenBring: () -> Unit,
    onOpenCheck: () -> Unit,
    onOpenChecks: () -> Unit,
    onChange: () -> Unit,
    onHost: (String?, String?) -> Unit,
    onOpenChat: (String) -> Unit,
    onVerify: () -> Unit,
    onSeeAllPlans: () -> Unit,
    onAskPantopus: ((AIScreenContext) -> Unit)? = null,
) {
    val standing = plan.standing
    // Invited again after a no or a removal: the invitation, not "Didn't work out". A paid spot's hold that ran out
    // (business track B2) may join again: the plan, not "Didn't work out".
    val notThisTime = standing == PlanViewerStanding.DECLINED || standing == PlanViewerStanding.REMOVED
    if (notThisTime && plan.openInvite == null && !plan.holdRanOut) {
        PlanNotThisTime(
            plan = plan,
            others = ui.others,
            onBack = onBack,
            onOpenPlan = onOpenPlan,
            onSeeAll = onSeeAllPlans,
            onHost = { kind -> onHost(kind, null) },
        )
        return
    }
    val context = LocalContext.current
    val reduceMotion = rememberReduceMotion()
    // "You're bringing bread. …" over the bring list goes away when the person leaves this page.
    DisposableEffect(viewModel) { onDispose { viewModel.bringClaimShown() } }
    // The holidays' one person pays for the group: a page opened from a spot link reads its offer first (PlanSpotOffer.kt).
    val spotVm: PlanSpotViewModel = hiltViewModel(key = "planSpot-${plan.id}")
    val spot by spotVm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.id) { spotVm.readOffer() }
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            if (results.values.any { it }) viewModel.useMyLocation()
        }
    // J1 "Share your location to join": the person's fix counts as a location for 5 minutes; hosts only ever see
    // a distance band.
    val askLocation: () -> Unit = {
        if (viewModel.hasLocationPermission()) {
            viewModel.useMyLocation()
        } else {
            permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }
    var confirmLeave by remember { mutableStateOf<LeaveKind?>(null) }
    var inviting by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirmBlock by remember { mutableStateOf(false) }
    val hosting = standing == PlanViewerStanding.HOSTING
    val menu =
        if (hosting) {
            emptyList()
        } else {
            listOf(
                PlanMenuItem("Report this plan") { reporting = true },
                PlanMenuItem("Block ${plan.hostFirst}", danger = true) { confirmBlock = true },
            )
        }
    val closed = plan.planState == PlanState.CANCELLED || plan.planState == PlanState.ENDED
    PlanPageScaffold(
        header = {
            // The map, or an online plan's tile (Plans step 3).
            PlanPageHeader(plan = plan, reveal = ui.reveal, reduceMotion = reduceMotion, onRevealDone = viewModel::revealShown)
        },
        onBack = onBack,
        scope = scopeChip(plan),
        scopeIcon = if (plan.isBusiness) PantopusIcon.MapPin else PantopusIcon.Lock,
        // A private plan is never shared by link (Plans step 1): its host invites, a guest may bring a friend.
        onShare = if (plan.shareUrl != null && !closed && !plan.isPrivate) ({ context.sharePlan(plan) }) else null,
        menu = menu,
        footer =
            footerFor(
                plan,
                ui,
                closed,
                viewModel,
                onSeeAllPlans,
                onVerify,
                askLocation,
                // While a spot link's offer is being read, live, or couldn't be read: its own action, never the paid "Join".
                spotFooter =
                    spotFooter(spot, onClaim = { spotVm.claim(viewModel::load) }, onRetry = spotVm::retry)
                        .takeIf { spot.spot.holdsFooter },
            ) { confirmLeave = it },
        onAsk = onAskPantopus?.let { ask -> { ask(AIScreenContext.plan(plan.id, PlanFormat.shortTitle(plan), hosting)) } },
    ) {
        when {
            hosting ->
                PlanHostBody(
                    plan = plan,
                    requests = ui.requests,
                    viewerId = ui.viewerId,
                    busy = ui.busy || (ui.state as? PlanDetailUiState.Ready)?.fresh != true,
                    onOpenRequests = onOpenRequests,
                    onInvite = { inviting = true },
                    onMessageGuests = { plan.chatRoomId?.let(onOpenChat) },
                    onChange = onChange,
                    onCancel = viewModel::openCancel,
                    onRemove = { person -> person.requestId?.let(viewModel::removeGuest) },
                    // Business track B1: staff mark a guest's free thing used.
                    onMarkUsed = { person -> person.requestId?.let(viewModel::markDealUsed) },
                    series =
                        PlanSeriesActions(
                            onSkip = viewModel::skipDate,
                            onChange = onChange,
                            onStop = viewModel::stopRepeating,
                            busy = ui.busy || (ui.state as? PlanDetailUiState.Ready)?.fresh != true,
                        ),
                    guests = ui.guests,
                    onOpenGuests = onOpenGuests,
                    onOpenBring = onOpenBring,
                    checks = PlanChecksEntry(ui.checks, onOpenChecks),
                    onExtrasChanged = viewModel::load,
                    // The holidays' board 29: Host again, then the invite sheet on this plan's people.
                    onPlanNext =
                        if (viewModel.offersSamePeopleNext(plan)) {
                            {
                                viewModel.planNextWithSamePeople()
                                onHost(null, plan.id)
                            }
                        } else {
                            null
                        },
                )
            closed -> PlanClosedBody(plan, onOpenChat = plan.chatRoomId?.let { room -> { onOpenChat(room) } })
            standing == PlanViewerStanding.IN && plan.hasPrivatePart -> {
                PlanInBody(
                    plan = plan,
                    reveal = ui.reveal,
                    reduceMotion = reduceMotion,
                    busy = ui.busy,
                    viewerId = ui.viewerId,
                    onStillComing = { coming -> if (coming) viewModel.stillComing(true) else confirmLeave = LeaveKind.Plan },
                    onOpenChat = { plan.chatRoomId?.let(onOpenChat) },
                    // Plans for the holidays (A8): "Change" opens the answer sheet with the guest's numbers.
                    onChangeAnswer = viewModel::openAsk,
                    // Business track B5: "Pay at {business}", or the paid check and its receipt.
                    payHere = PlanPayHereEntry(ui.myCheck, onOpenCheck),
                    bring =
                        PlanBringActions(
                            busy = ui.bringBusy,
                            notice = ui.bringNotice,
                            claimed = ui.bringClaimed,
                            onClaim = viewModel::claimBring,
                            onGiveBack = viewModel::giveBackBring,
                            onAdd = viewModel::addBring,
                        ),
                    onExtrasChanged = viewModel::load,
                )
                PlanFriendInviteRow(
                    plan = plan,
                    friend = PlanFriendInvite(invited = ui.friendInvited, making = ui.makingFriendLink, onBring = viewModel::bringFriend),
                )
            }
            standing == PlanViewerStanding.REQUESTED -> PlanRequestedBody(plan)
            standing == PlanViewerStanding.WAITLISTED -> PlanWaitlistBody(plan)
            // A private plan's invitation goes under its title (board Invited, Plans step 1).
            // Plans for the holidays (A8): someone who said maybe sees a quiet "You said maybe" with "Change".
            // The holidays' find a date (board 24): the times to tick take the answer's place while the host is picking.
            plan.isPicking -> PlanBeforeInBody(plan, afterTitle = { PlanDatesGuest(plan) })
            plan.isPrivate && plan.saidMaybe ->
                PlanBeforeInBody(plan, afterTitle = { PlanMaybeBanner(plan, onChange = viewModel::openAsk) })
            plan.isPrivate && plan.openInvite != null -> PlanBeforeInBody(plan, afterTitle = { PlanPrivateInviteBanner(plan) })
            else -> {
                plan.openInvite?.let { invite -> PlanInviteBanner(plan, invite) }
                // The holidays' one person pays for the group: opened from a spot link, "{Chris} got you a spot".
                PlanBeforeInBody(plan, afterTitle = { PlanSpotCard(spot) })
            }
        }
    }
    if (ui.askOpen && plan.paysToJoin) {
        // Business track B2 (P1): a priced plan's "Join" pays for the spot through the shipped payment sheet.
        PlanPayHost(plan = plan, onClose = viewModel::closeAsk, onDone = viewModel::paidDone)
    } else if (ui.askOpen) {
        PlanAskSheet(
            plan = plan,
            draft = ui.ask,
            onEdit = viewModel::editAsk,
            onSend = viewModel::sendAsk,
            onClose = viewModel::closeAsk,
            invited = plan.openInvite?.needsHostOk == false && plan.standing != PlanViewerStanding.REQUESTED,
            // Plans for the holidays (A7): Maybe and Can't make it beside I'm in.
            onMaybe = viewModel::maybeInvite,
            onDecline = {
                viewModel.closeAsk()
                viewModel.declineInvite()
            },
        )
    }
    // The holidays' board 29: a plan just posted to invite a past plan's people opens its invite sheet on them.
    val pastFrom = ui.invitePastFrom?.takeIf { hosting && (ui.state as? PlanDetailUiState.Ready)?.fresh == true }
    if (inviting || pastFrom != null) {
        PlanInviteSheet(
            plan = plan,
            pastFrom = pastFrom,
            onDismiss = {
                inviting = false
                viewModel.invitePastShown()
                viewModel.load()
            },
        )
    }
    if (ui.cancelOpen) {
        PlanCancelSheet(
            plan = plan,
            requests = ui.requests,
            note = ui.cancelNote,
            onNote = viewModel::editCancelNote,
            onCancel = viewModel::cancelPlan,
            onKeep = viewModel::closeCancel,
            // A repeating plan with dates after this one asks which (Plans step 2): this date, or the rest too.
            onCancelDate = if (plan.seriesContinues) viewModel::cancelThisDate else null,
        )
    }
    confirmLeave?.let { kind ->
        LeaveDialog(kind, plan, onConfirm = {
            confirmLeave = null
            if (kind == LeaveKind.Plan && plan.myRequest?.reconfirmNeeded == true) {
                viewModel.stillComing(false)
            } else {
                viewModel.withdraw(done = kind.done(plan))
            }
        }, onDismiss = { confirmLeave = null })
    }
    // Asks first, as on iOS: blocking hides both people's plans, requests and messages.
    if (confirmBlock) {
        PlanConfirmDialog(
            title = "Block ${plan.hostFirst}?",
            body = "You won't see each other's plans, requests or messages.",
            action = "Block",
            onConfirm = {
                confirmBlock = false
                viewModel.blockHost()
            },
            onDismiss = { confirmBlock = false },
        )
    }
    if (reporting) {
        ReportDialog(onReport = { reason ->
            reporting = false
            viewModel.report(reason)
        }, onDismiss = { reporting = false })
    }
}

/** What a person is about to walk away from. */
internal enum class LeaveKind { Request, Waitlist, Plan }

/** The line once it went through (as on iOS): "Request withdrawn", "You left the waitlist", "We told Sam". */
private fun LeaveKind.done(plan: PlanDto): String =
    when (this) {
        LeaveKind.Request -> "Request withdrawn"
        LeaveKind.Waitlist -> "You left the waitlist"
        LeaveKind.Plan -> "We told ${plan.hostFirst}"
    }

/** J1/J2 promise the place over the map; J5, J6, J8 and a closed plan carry no chip (the boards, as on iOS). */
private fun scopeChip(plan: PlanDto): String? {
    val browsing = plan.standing == PlanViewerStanding.NONE || plan.standing == PlanViewerStanding.LEFT
    val closed = plan.planState == PlanState.CANCELLED || plan.planState == PlanState.ENDED
    return when {
        // A business's plan meets at its own public address (board G3): the street address over the map.
        plan.isBusiness -> if (closed || !browsing) null else plan.place?.address ?: plan.place?.name
        // A private plan shows the person invited its place by name already (Plans step 1).
        plan.hasPrivatePart || plan.placeShownToInvitee || !browsing || closed -> null
        // An online plan's link goes only to people who are in (Plans step 3).
        plan.isOnline -> "The link is shared when you're in"
        plan.isPlaydate -> "Exact place and time shared when you're in"
        else -> "Exact place shared when you're in"
    }
}

private fun footerFor(
    plan: PlanDto,
    ui: PlanDetailUi,
    closed: Boolean,
    viewModel: PlanDetailViewModel,
    onSeeAll: () -> Unit,
    onVerify: () -> Unit,
    onLocation: () -> Unit,
    spotFooter: (@Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit)?,
    confirm: (LeaveKind) -> Unit,
): (@Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit)? {
    val standing = plan.standing
    val ready = (ui.state as? PlanDetailUiState.Ready)?.fresh == true
    val busy = ui.busy || !ready
    return when {
        // An online plan's host joins the call from here too (Plans step 3); nothing else for a host, as before.
        // Plans for the holidays (A6 item 5): "Remind the {n} who haven't answered" while anyone can be reminded.
        standing == PlanViewerStanding.HOSTING ->
            if (closed) null else onlineJoinFooter(plan, viewModel::linkUnopened) ?: remindFooter(ui, viewModel)
        closed -> {
            { GhostButton(title = "See other plans", onClick = onSeeAll, modifier = Modifier.height(50.dp)) }
        }
        // Board Online: "Join" for someone in, with "Can't make it" under it.
        standing == PlanViewerStanding.IN ->
            onlineJoinFooter(plan, viewModel::linkUnopened, leave = { confirm(LeaveKind.Plan) }, busy = busy)
                ?: leaveFooter(busy, confirm, dealReady = plan.dealReady)
        // Business track B2: a held spot being paid for: "Join" opens P1 again, with the same payment.
        standing == PlanViewerStanding.PAYING -> {
            {
                PrimaryButton(
                    title = askWord(plan),
                    onClick = viewModel::openAsk,
                    isEnabled = !busy,
                    modifier = Modifier.height(50.dp).testTag("planPayAgain"),
                )
            }
        }
        standing == PlanViewerStanding.REQUESTED -> {
            {
                GhostButton(
                    title = "Change who's coming",
                    onClick = viewModel::openAsk,
                    modifier = Modifier.height(50.dp),
                    isEnabled = !busy,
                )
                PlanTextButton(title = "Withdraw request", onClick = { confirm(LeaveKind.Request) }, danger = true, enabled = !busy)
            }
        }
        standing == PlanViewerStanding.WAITLISTED -> {
            {
                GhostButton(title = "Leave the waitlist", onClick = {
                    confirm(LeaveKind.Waitlist)
                }, modifier = Modifier.height(50.dp), isEnabled = !busy)
                waitlistCaption(plan)?.let { PlanFooterCaption(it) }
            }
        }
        // The holidays' one person pays for the group: a spot link's free "I'm in" (or "Try again"), never the paid "Join".
        spotFooter != null -> spotFooter
        // The holidays' find a date (board 24): "Save my times" in place of the answer buttons while the host is picking.
        plan.isPicking -> datesFooter(plan, viewModel::load)
        plan.openInvite != null &&
            (plan.viewer?.canAsk == true || plan.viewer?.cannotAskReason == PlanCannotAsk.FULL_USE_WAITLIST) ->
            inviteFooterContent(plan, requireNotNull(plan.openInvite), busy, viewModel)
        else -> askFooterContent(askFooter(plan), viewModel, onVerify, onLocation, ready)
    }
}

/** Board 24's footer, read again after saving. */
private fun datesFooter(
    plan: PlanDto,
    onSaved: () -> Unit,
): @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit = { PlanDatesFooter(plan, onSaved) }

/**
 * The host's reminder (Plans for the holidays, board 4): "Remind the {3} who haven't answered" and "One reminder each,
 * by the way they were invited"; "Reminded today" once used. Null when nobody can be reminded (the shipped page then).
 */
private fun remindFooter(
    ui: PlanDetailUi,
    viewModel: PlanDetailViewModel,
): (@Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit)? {
    val list = ui.guests ?: return null
    val plan = (ui.state as? PlanDetailUiState.Ready)?.plan ?: return null
    val guests = PlanGuestsUi(plan = plan, list = list, remindedToday = ui.remindedToday)
    val n = guests.remindable
    val reminded = guests.remindedTodayNow
    if (!guests.showsRemind) return null
    return {
        PrimaryButton(
            title =
                when {
                    reminded -> "Reminded today"
                    n == 1 -> "Remind the 1 who hasn't answered"
                    else -> "Remind the $n who haven't answered"
                },
            onClick = viewModel::remind,
            isLoading = ui.reminding,
            isEnabled = !ui.reminding && !reminded,
            modifier = Modifier.height(50.dp).testTag("planRemind"),
        )
        PlanFooterCaption("One reminder each, by the way they were invited")
    }
}

/** J7's footer: "Can't make it", with "Leaving gives up your deal" while a business's deal is ready (business track D2). */
private fun leaveFooter(
    busy: Boolean,
    confirm: (LeaveKind) -> Unit,
    dealReady: Boolean = false,
): @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit =
    {
        PlanTextButton(title = "Can't make it", onClick = { confirm(LeaveKind.Plan) }, danger = true, enabled = !busy)
        if (dealReady) PlanFooterCaption("Leaving gives up your deal")
    }

/** J1 and J2's footer: "Ask to join" (or why not) and its caption. */
private fun askFooterContent(
    footer: AskFooter,
    viewModel: PlanDetailViewModel,
    onVerify: () -> Unit,
    onLocation: () -> Unit,
    ready: Boolean,
): @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit =
    {
        PrimaryButton(
            title = footer.label,
            onClick = {
                when (footer.action) {
                    AskAction.Ask -> viewModel.openAsk()
                    AskAction.Verify -> onVerify()
                    AskAction.Location -> onLocation()
                    AskAction.None -> Unit
                }
            },
            isEnabled = ready && footer.enabled && footer.action != AskAction.None,
            modifier = Modifier.height(50.dp),
        )
        footer.caption?.let { PlanFooterCaption(it) }
    }

@Composable
private fun LeaveDialog(
    kind: LeaveKind,
    plan: PlanDto,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val (title, body, action) =
        when (kind) {
            LeaveKind.Request -> Triple("Withdraw your request?", "${plan.hostFirst} won't see it anymore.", "Withdraw")
            LeaveKind.Waitlist -> Triple("Leave the waitlist?", "You'll lose your place in line.", "Leave")
            LeaveKind.Plan ->
                Triple(
                    "Can't make it?",
                    "We'll tell ${plan.hostFirst}, and your spot goes to the next person waiting. " +
                        "You'll lose ${if (plan.isOnline) "the link" else "the exact place"}, the note and the chat." +
                        // Business track B2: what leaving now gives back, in the server's words.
                        plan.paid?.leaveText?.let { " $it" }.orEmpty(),
                    "I can't make it",
                )
        }
    PlanConfirmDialog(title = title, body = body, action = action, onConfirm = onConfirm, onDismiss = onDismiss)
}

/** A plan's yes-or-not-now question: the action in red, "Not now" to keep things as they are. */
@Composable
private fun PlanConfirmDialog(
    title: String,
    body: String,
    action: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(action, color = PantopusColors.error) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } },
    )
}

@Composable
private fun ReportDialog(
    onReport: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report this plan") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
                Text("Pantopus reviews every report. The host isn't told who reported.")
                reportReasons.forEach { (key, label) -> PlanTextButton(title = label, onClick = { onReport(key) }) }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun PlanLoading(onBack: () -> Unit) {
    PlanPlainScaffold(onBack = onBack) {
        PlanRowsSkeleton(rows = 3)
    }
}

@Composable
private fun PlanGone(
    onBack: () -> Unit,
    onSeeAll: () -> Unit,
) {
    PlanPlainScaffold(onBack = onBack) {
        Column(modifier = Modifier.padding(top = Spacing.s8), verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            Text(
                text = "This plan isn't available",
                style = app.pantopus.android.ui.screens.plans.map.planH3,
                color = PantopusColors.appText,
            )
            Text(
                text = "It may have ended, been cancelled, or be just for people closer by.",
                style = app.pantopus.android.ui.theme.PantopusTextStyle.body,
                color = PantopusColors.appTextSecondary,
            )
            GhostButton(title = "See other plans", onClick = onSeeAll, modifier = Modifier.height(50.dp))
        }
    }
}
