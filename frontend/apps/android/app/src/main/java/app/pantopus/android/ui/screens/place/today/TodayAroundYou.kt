package app.pantopus.android.ui.screens.place.today

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.models.saved_places.AroundYouItemDto
import app.pantopus.android.data.api.models.saved_places.AroundYouSectionDto
import app.pantopus.android.ui.components.Toast
import app.pantopus.android.ui.components.ToastAppearance
import app.pantopus.android.ui.components.rememberShareTextWithCompletion
import app.pantopus.android.ui.components.toastDurationMillis
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.feed.pulse.PulseRepostChooserSheet
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.screens.profile.ProfilePostCardActions
import app.pantopus.android.ui.screens.profile.ProfilePostCards
import app.pantopus.android.ui.screens.profile.ProfilePostOptionsSheet
import app.pantopus.android.ui.screens.profile.ProfilePostReportDialog
import app.pantopus.android.ui.screens.root.ScrollAwayHeaderPage
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlin.math.roundToLong

/*
 * Today's two halves (founder decision 2026-11-14): "At home" is Today as it was; "Around you" lists local headlines
 * for the same place, each the outlet's own with its name, opened at the outlet. The switch is the big two-part one
 * Pulse draws for List | Map, and it shows only when the server has something for this place, so an area without
 * local sources sees Today unchanged. Each headline is a post by the Pantopus curator account, drawn with the Pulse
 * card (emoji reactions, Save, the post menu; a tap opens its post page with the reply threads); "Read at <outlet>"
 * opens the story. A server from before the posts sends rows, drawn as the first build drew them. Parity twin of iOS
 * `TodayAroundYou.swift`.
 * Topics and scrolling back (founder, 2026-11-24): a row of chips over the page (All, Talked about, Events, Kids &
 * schools, Sports, …; the server says which this place has), each a list that keeps loading as it is scrolled for as
 * long as there are stories; under All the first page's sections are followed by every earlier story
 * (`TodayAroundYouLists.kt`). A server from before the lists sends no chips, and the page is as it was.
 */

/** Something to show for this place: Today offers the switch. */
val AroundYouDto?.showsSwitch: Boolean
    get() = this != null && available && sections.isNotEmpty()

/** The big two-part switch under Today's title, drawn as Pulse's List | Map. */
@Composable
fun TodayHalfSwitch(
    active: TodayHalf,
    onSelect: (TodayHalf) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.appSurfaceSunken)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(Radii.pill))
                .padding(3.dp)
                .testTag("todayHalfToggle")
                .selectableGroup(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TodayHalf.entries.forEach { half ->
            val selected = half == active
            val tint = if (selected) PantopusColors.appTextInverse else PantopusColors.appTextSecondary
            Row(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 40.dp)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(if (selected) PantopusColors.primary600 else PantopusColors.appSurfaceSunken)
                        .selectable(selected = selected, role = Role.RadioButton) { onSelect(half) }
                        .testTag("todayHalfSegment_${half.key}"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                PantopusIconImage(icon = half.icon, contentDescription = null, size = 17.dp, tint = tint)
                Text(text = half.label, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = tint)
            }
        }
    }
}

private val noCards: StateFlow<List<PulsePostCardContent>> = MutableStateFlow(emptyList())
private val noPost: StateFlow<String?> = MutableStateFlow(null)
private val noList: StateFlow<AroundYouLists.State> = MutableStateFlow(AroundYouLists.State())

/**
 * Around you on the Today tab: the page, its posts' "Post options" (Share…, Report post) and report reasons as on a
 * profile, the Repost chooser as in Pulse, and the feedback a tap leaves. [controller] holds the cards and what the
 * viewer's taps did to them; a tap on a card opens its post page ([onOpenPost]); "Repost with your words" opens the
 * Pulse composer with the headline quoted ([onQuotePost]; null leaves that row out).
 */
@Composable
@Suppress("LongParameterList")
internal fun TodayAroundYouHost(
    page: AroundYouDto,
    top: Dp,
    nowMs: Long,
    controller: ProfilePostCards?,
    toast: String?,
    onDismissToast: () -> Unit,
    onOpenPost: (String) -> Unit,
    onQuotePost: ((String) -> Unit)? = null,
    /** The lists behind the first page (the chips); null leaves the page as it was before them. */
    lists: AroundYouLists? = null,
    /** "Reply" and the reply preview on a card: its post page with the reply box ready to type in. */
    onReplyPost: (String) -> Unit = onOpenPost,
) {
    val cards by (controller?.cards ?: noCards).collectAsStateWithLifecycle()
    val listState by (lists?.state ?: noList).collectAsStateWithLifecycle()
    val optionsId by (controller?.optionsPostId ?: noPost).collectAsStateWithLifecycle()
    val reportingId by (controller?.reportingPostId ?: noPost).collectAsStateWithLifecycle()
    val shareText = rememberShareTextWithCompletion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(toast) {
        if (toast != null) {
            delay(toastDurationMillis(toast, minimumMillis = 2_000))
            onDismissToast()
        }
    }
    Box(modifier = Modifier.fillMaxSize()) {
        TodayAroundYouPage(
            page = page,
            top = top,
            nowMs = nowMs,
            cards = cards,
            actions =
                controller?.let { posts ->
                    ProfilePostCardActions(
                        onOpen = onOpenPost,
                        onReact = posts::tapReaction,
                        onChooseReaction = posts::chooseReaction,
                        onOptions = posts::openOptions,
                        onToggleSave = posts::toggleSave,
                        // ↻ opens the Repost chooser, as on a Pulse card (Repost / Repost with your words).
                        onToggleRepost = posts::openRepostChooser,
                    )
                } ?: ProfilePostCardActions(onOpen = onOpenPost),
            lists = lists?.let { AroundYouListsUi(listState, onSelect = it::select, onMore = it::loadMore, onReply = onReplyPost) },
        )
        toast?.let { message ->
            Toast(
                text = message,
                appearance =
                    ToastAppearance(
                        background = PantopusColors.appText.copy(alpha = 0.9f),
                        foreground = PantopusColors.appTextInverse,
                        textStyle = PantopusTextStyle.small,
                    ),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 100.dp),
            )
        }
    }
    if (controller == null) return
    optionsId?.let { id ->
        cards.firstOrNull { it.id == id }?.let { card ->
            ProfilePostOptionsSheet(
                card = card,
                onShare = {
                    controller.dismissOptions()
                    controller.shareExternally(card.id) { url, onCompleted ->
                        lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && shareText(url, onCompleted)
                    }
                },
                onReport = { controller.beginReport(card.id) },
                onDismiss = { controller.dismissOptions() },
            )
        }
    }
    AroundYouRepostChooser(controller, cards, onQuotePost)
    reportingId?.let { id ->
        ProfilePostReportDialog(onReport = { reason -> controller.report(id, reason) }, onDismiss = { controller.cancelReport() })
    }
}

/** ↻ on an Around you card: Repost (or Undo repost) and Repost with your words, as on a Pulse card. */
@Composable
private fun AroundYouRepostChooser(
    controller: ProfilePostCards,
    cards: List<PulsePostCardContent>,
    onQuotePost: ((String) -> Unit)?,
) {
    val chooserId by controller.repostChooserPostId.collectAsStateWithLifecycle()
    val card = chooserId?.let { id -> cards.firstOrNull { it.id == id } } ?: return
    PulseRepostChooserSheet(
        isReposted = card.actions.isReposted,
        onToggleRepost = { controller.toggleRepost(card.id) },
        onQuote =
            onQuotePost?.let { quote ->
                {
                    controller.prepareQuote(card.id)
                    quote(card.id)
                }
            },
        onDismiss = { controller.dismissRepostChooser() },
    )
}

/**
 * The Around you page: under each section's name, its headlines as Pulse cards ([cards], from the page's posts), or,
 * from a server before the posts, a card of the first build's rows.
 */
@Composable
@Suppress("LongParameterList")
internal fun TodayAroundYouPage(
    page: AroundYouDto,
    top: Dp,
    nowMs: Long,
    modifier: Modifier = Modifier,
    cards: List<PulsePostCardContent> = emptyList(),
    actions: ProfilePostCardActions = ProfilePostCardActions(),
    lists: AroundYouListsUi? = null,
) {
    if (page.hasPosts) {
        AroundYouPostsList(page, top, nowMs, cards, actions, lists, modifier)
        return
    }
    val context = LocalContext.current
    val open: (String) -> Unit = { link ->
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(link))
        } catch (_: ActivityNotFoundException) {
            // No browser on this phone: the headline stays readable.
        }
    }
    val scroll = rememberScrollState()
    ScrollAwayHeaderPage(scroll)
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(top = top)
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp, bottom = 40.dp)
                .testTag("aroundYouPanel"),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        page.area?.let { area ->
            Text(
                "From local news outlets around $area. Each headline opens the story where it was published.",
                fontSize = 13.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
        page.sections.forEach { section -> AroundYouSection(section, nowMs, open) }
    }
}

@Composable
internal fun SectionHeading(
    title: String,
    modifier: Modifier = Modifier,
) {
    Text(
        title.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.77.sp,
        color = PantopusColors.appTextSecondary,
        modifier = modifier.semantics { heading() },
    )
}

@Composable
private fun AroundYouSection(
    section: AroundYouSectionDto,
    nowMs: Long,
    open: (String) -> Unit,
) {
    Column(
        modifier = Modifier.testTag("aroundYouSection_${section.id}"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SectionHeading(section.title, Modifier.padding(horizontal = 4.dp))
        Column(modifier = Modifier.fillMaxWidth().placeCard()) {
            section.items.forEachIndexed { index, item ->
                if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorderSubtle))
                AroundYouRow(item, nowMs, open)
            }
        }
    }
}

@Composable
private fun AroundYouRow(
    item: AroundYouItemDto,
    nowMs: Long,
    open: (String) -> Unit,
) {
    val link = item.url?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
    // A story says when it was first seen; a tip (no link) is not news and carries no time.
    val meta = listOfNotNull(item.source, link?.let { seenAgo(item.seenAt, nowMs) }).joinToString(" · ")
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .then(
                    if (link != null) {
                        Modifier.clickable(
                            role = Role.Button,
                            onClickLabel = "Open the story at ${item.source ?: "its outlet"}",
                        ) { open(link) }
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .testTag("aroundYouItem"),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
            if (meta.isNotEmpty()) Text(meta, fontSize = 12.sp, color = PantopusColors.appTextSecondary)
        }
        if (link != null) {
            PantopusIconImage(
                icon = PantopusIcon.ExternalLink,
                contentDescription = null,
                size = 16.dp,
                tint = PantopusColors.appTextMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

private const val MINUTES_PER_HOUR = 60
private const val HOURS_PER_DAY = 24
private const val SECONDS_PER_MINUTE = 60.0

/** "3 hr ago", "Yesterday", "2 days ago": how long since the story was first seen; null when the time can't be read. */
internal fun seenAgo(
    iso: String,
    nowMs: Long,
): String? {
    val seen =
        try {
            Instant.parse(iso)
        } catch (_: DateTimeParseException) {
            return null
        }
    val minutes =
        (Duration.between(seen, Instant.ofEpochMilli(nowMs)).seconds / SECONDS_PER_MINUTE).roundToLong().coerceAtLeast(0)
    val hours = (minutes / MINUTES_PER_HOUR.toDouble()).roundToLong()
    val days = (hours / HOURS_PER_DAY.toDouble()).roundToLong()
    return when {
        minutes < 2 -> "Just now"
        minutes < MINUTES_PER_HOUR -> "$minutes min ago"
        hours < HOURS_PER_DAY -> "$hours hr ago"
        days == 1L -> "Yesterday"
        else -> "$days days ago"
    }
}
