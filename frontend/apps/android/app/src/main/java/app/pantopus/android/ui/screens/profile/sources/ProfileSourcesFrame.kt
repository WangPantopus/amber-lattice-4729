@file:Suppress("LongMethod", "LongParameterList", "MagicNumber", "CyclomaticComplexMethod")
@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.moments.components.momentsRing
import app.pantopus.android.ui.screens.profile.ProfileAvatar
import app.pantopus.android.ui.screens.profile.ProfileIconButton
import app.pantopus.android.ui.screens.profile.profileLargeText
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.SkyPalette
import kotlinx.coroutines.delay
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * The profile with sources, drawn from the server's blocks (boards 1–4, 12, 13). The page's chrome (the header card,
 * the tab bar, the bars) is the app's; everything in it is the server's, in its order (contract §0). The actions under
 * the name, the sheets and the owner's extras are today's (`PublicProfileScreen`), passed in as slots, so Connect,
 * Message, the Connect sheet, Edit profile, Preview as, tips, the account list and Log out work exactly as they do.
 */

/** The card the boards draw every block on (`.card`). */
internal fun Modifier.sourcesCard(shape: Shape = RoundedCornerShape(20.dp)): Modifier =
    this
        .fillMaxWidth()
        .clip(shape)
        .background(PantopusColors.appSurface)
        .border(1.dp, PantopusColors.appBorder, shape)

/** The page's insets (`.pad`): 16 dp at the sides, 12 dp between cards. */
private val PAGE_SIDE = 16.dp
private val PAGE_GAP = 12.dp

/** Block kinds that lead the first tab, above the tab bar (DECISIONS 11-23, boards 1, 2, 4). */
private fun ProfileBlock.leads(): Boolean =
    this is ProfileBlock.Says || this is ProfileBlock.KnownFor || this is ProfileBlock.InCommon || this is ProfileBlock.Doors

/** The header card's lines: the first tab's untitled `lines` block that comes first (`key_lines`). */
private fun ProfilePageTab.keyLines(): ProfileBlock.Lines? =
    (blocks.firstOrNull { it !is ProfileBlock.Notice } as? ProfileBlock.Lines)?.takeIf {
        it.title == null || it.id == "key_lines"
    }

/** What the page around the blocks needs from today's screen. */
internal class SourcesFrameSlots(
    /** The bar over the page on the first tab (today's visitor bar with Share, the owner's ✕ + Share, a preview's banner). */
    val topBar: @Composable () -> Unit,
    /** Under the name: today's actions for this relationship, the owner's Edit profile + Preview as and tips, or a preview's note. */
    val headerActions: @Composable () -> Unit,
    /** The pinned posts row (today's), where the `pinned_posts` block stands. */
    val pinnedPosts: @Composable () -> Unit,
    /** After the last block of the first tab: the owner's "Your account" and Log out; nothing for anyone else. */
    val pageEnd: @Composable () -> Unit = {},
    /**
     * The owner's own Work tools after Work's blocks ("Add or remove pieces", where today's Work tab had Add portfolio
     * item). With it, the owner always has a Work tab, as today; null for anyone else.
     */
    val workEnd: (@Composable () -> Unit)? = null,
    /**
     * Phase 2: the owner's way in at the top of Work (their offers and "Add a piece", board 10). With it, too, the
     * owner always has a Work tab; null for anyone else.
     */
    val workStart: (@Composable () -> Unit)? = null,
    /** The bar's share button on Work and Record; null leaves it out. */
    val onShare: (() -> Unit)?,
    val onBack: () -> Unit,
)

/**
 * The page. [selectedTab] is a tab key; an unknown or missing one falls back to the first tab. [month] is the month
 * opened on the Record chart (its lit year and wedge).
 */
@Composable
internal fun ProfileSourcesFrame(
    page: ProfilePage,
    selectedTab: String?,
    onSelectTab: (String) -> Unit,
    slots: SourcesFrameSlots,
    actions: SourcesBlockActions,
    month: RecordMonth? = null,
) {
    val ownerWork = slots.workEnd != null || slots.workStart != null
    val tabs = remember(page.tabs, ownerWork) { tabsWithOwnerWork(page, ownerWork) }
    val tab = tabs.firstOrNull { it.key == selectedTab } ?: tabs.firstOrNull()
    val first = tab == null || tab == tabs.firstOrNull()
    val scroll = rememberScrollState()
    LaunchedEffect(tab?.key) { if (!first) scroll.scrollTo(0) }
    // Where the first tab's tab bar sits in the page: once it scrolls under the top bar, a copy stays there (as on iPhone).
    var tabBarY by remember { mutableIntStateOf(-1) }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PantopusColors.appBg)
                .testTag("profileSources"),
    ) {
        if (first) {
            slots.topBar()
        } else {
            CompactBar(header = page.header, onBack = slots.onBack, onShare = slots.onShare)
            SourcesTabBar(tabs = tabs, selected = tab?.key, onSelect = onSelectTab)
        }
        Box(Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(scroll),
            ) {
                if (first) {
                    FirstTab(
                        page = page,
                        tab = tab,
                        tabs = tabs,
                        onSelectTab = onSelectTab,
                        slots = slots,
                        actions = actions,
                        onTabBarPlaced = { tabBarY = it },
                    )
                } else if (tab != null) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(start = PAGE_SIDE, end = PAGE_SIDE, top = PAGE_GAP, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(PAGE_GAP),
                    ) {
                        if (tab.key == WORK_TAB) slots.workStart?.invoke()
                        SourcesBlocks(blocks = tab.blocks, page = page, actions = actions, slots = slots, month = month)
                        if (tab.key == WORK_TAB) slots.workEnd?.invoke()
                        // Board 12 ends the record with how to read its lines.
                        if (tab.blocks.any { it is ProfileBlock.RecordChart }) HowToReadLines(firstName = page.header.firstName)
                        page.footer?.let { FooterLine(it) }
                    }
                }
                Spacer(Modifier.height(40.dp))
            }
            val tabBarPassed = tabBarY >= 0 && scroll.value > tabBarY
            if (first && tabs.size > 1 && tabBarPassed) {
                SourcesTabBar(tabs = tabs, selected = tab?.key, onSelect = onSelectTab, modifier = Modifier.align(Alignment.TopCenter))
            }
        }
    }
}

private const val WORK_TAB = "work"

/** The server's tabs, plus an empty Work tab right after the first one for an owner whose page has none yet. */
private fun tabsWithOwnerWork(
    page: ProfilePage,
    ownerWork: Boolean,
): List<ProfilePageTab> {
    if (!ownerWork || page.tabs.any { it.key == WORK_TAB } || page.tabs.isEmpty()) return page.tabs
    return listOf(page.tabs.first(), ProfilePageTab(WORK_TAB, "Work", emptyList())) + page.tabs.drop(1)
}

@Composable
private fun FirstTab(
    page: ProfilePage,
    tab: ProfilePageTab?,
    tabs: List<ProfilePageTab>,
    onSelectTab: (String) -> Unit,
    slots: SourcesFrameSlots,
    actions: SourcesBlockActions,
    onTabBarPlaced: (Int) -> Unit,
) {
    val keyLines = tab?.keyLines()
    // Notices (things waiting for the owner that this app can't show yet) stand right under the header card.
    val notices = tab?.blocks.orEmpty().filterIsInstance<ProfileBlock.Notice>()
    val rest = tab?.blocks.orEmpty().filterNot { it is ProfileBlock.Notice }.let { if (keyLines != null) it.drop(1) else it }
    val leading = rest.takeWhile { it.leads() }
    val after = rest.drop(leading.size)
    val record = tabs.firstOrNull { it.key == "record" }
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = PAGE_SIDE, end = PAGE_SIDE, top = PAGE_GAP),
        verticalArrangement = Arrangement.spacedBy(PAGE_GAP),
    ) {
        HeaderCard(
            page = page,
            keyLines = keyLines,
            onOpenRecord = record?.let { { onSelectTab(it.key) } },
            headerActions = slots.headerActions,
            actions = actions,
        )
        SourcesBlocks(blocks = notices, page = page, actions = actions, slots = slots)
        SourcesBlocks(blocks = leading, page = page, actions = actions, slots = slots)
    }
    if (tabs.size > 1) {
        Spacer(Modifier.height(16.dp))
        SourcesTabBar(
            tabs = tabs,
            selected = tab?.key,
            onSelect = onSelectTab,
            modifier = Modifier.onGloballyPositioned { onTabBarPlaced(it.positionInParent().y.toInt()) },
        )
    }
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = PAGE_SIDE, end = PAGE_SIDE, top = PAGE_GAP),
        verticalArrangement = Arrangement.spacedBy(PAGE_GAP),
    ) {
        SourcesBlocks(blocks = after, page = page, actions = actions, slots = slots)
        page.footer?.let { FooterLine(it) }
    }
    Spacer(Modifier.height(28.dp))
    slots.pageEnd()
}

/** Says and Known for share one card when they stand together (board 1); every other block is its own card. */
@Composable
private fun SourcesBlocks(
    blocks: List<ProfileBlock>,
    page: ProfilePage,
    actions: SourcesBlockActions,
    slots: SourcesFrameSlots,
    month: RecordMonth? = null,
) {
    var i = 0
    while (i < blocks.size) {
        val block = blocks[i]
        val next = blocks.getOrNull(i + 1)
        if (block is ProfileBlock.Says && next is ProfileBlock.KnownFor) {
            SaysAndKnownForCard(says = block, knownFor = next, actions = actions)
            i += 2
        } else if (block is ProfileBlock.WorkRings && next is ProfileBlock.Pieces && !next.pinned) {
            // Board 7: the work line and the list of pieces are one card, with the year chips and All / Did / Built.
            WorkLineCard(
                rings = block,
                list = next,
                known = page.workPieces(),
                firstName = page.header.firstName,
                open = { link -> link?.takeIf { actions.interactive }?.let { { actions.onOpenLink(it) } } },
            )
            i += 2
        } else {
            SourcesBlock(block = block, page = page, actions = actions, slots = slots, month = month)
            i += 1
        }
    }
}

/** The header card (board 1): the sky band, the mark around the portrait, the name, the actions, the record and the key lines. */
@Composable
private fun HeaderCard(
    page: ProfilePage,
    keyLines: ProfileBlock.Lines?,
    onOpenRecord: (() -> Unit)?,
    headerActions: @Composable () -> Unit,
    actions: SourcesBlockActions,
) {
    val header = page.header
    // At the largest text sizes the city and "Seen as" chips leave the band for a row under the name (PRF: nothing cut off).
    val large = profileLargeText()
    Column(
        modifier = Modifier.sourcesCard(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val place = header.place
        val mark: @Composable () -> Unit = {
            ProfileRingMark(
                rings = header.rings,
                contentDescription = "${header.firstName}'s rings: ${yearsOnRecord(header.rings.years.size)}",
            ) {
                ProfileAvatar(
                    name = header.name,
                    photoUrl = header.portraitUrl,
                    seed = header.userId,
                    size = 80.dp,
                    // The portrait sits inside the whole mark: the Moments ring only, no outer mark ring.
                    modifier =
                        Modifier.momentsRing(
                            header.userId.takeIf { page.previewAs == null },
                            stroke = 2.dp,
                            gap = 1.5.dp,
                            withMark = false,
                        ),
                )
            }
        }
        if (place != null) {
            // The mark sits half over the band (board 1: a 132 band, a 176 mark 88 into it).
            Box(Modifier.fillMaxWidth().height(132.dp + 88.dp)) {
                Box(Modifier.align(Alignment.TopCenter)) { SkyBand(place = place, seenAs = header.seenAs, chips = !large) }
                Box(Modifier.align(Alignment.BottomCenter)) { mark() }
            }
        } else {
            header.seenAs?.takeIf { !large }?.let { seen ->
                Row(Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 10.dp), horizontalArrangement = Arrangement.End) {
                    SeenAsChip(seen, onSky = false)
                }
            }
            mark()
        }
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 20.dp, top = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = header.name,
                style = SourcesType.name,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() }.testTag("profileSources.name"),
            )
            header.headline?.let {
                Text(text = it, style = SourcesType.secondary.copy(fontSize = 15.sp, lineHeight = 21.sp), textAlign = TextAlign.Center)
            }
            if (large && (place != null || header.seenAs != null)) {
                FlowRow(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    place?.let { PlaceChip(it) }
                    header.seenAs?.let { SeenAsChip(it, onSky = false) }
                }
            }
            if (page.isOwner) {
                header.accountName?.takeIf { it != header.name }?.let { account ->
                    Text(
                        text = "Your account name, $account, stays private.",
                        style = SourcesType.caption,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp).testTag("profileSources.accountName"),
                    )
                }
            }
        }
        Box(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp)) { headerActions() }
        if (page.summary.totalMonths > 0) {
            RecordWell(
                summary = page.summary,
                onOpenRecord = onOpenRecord,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp),
            )
        }
        if (keyLines != null) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                keyLines.lines.forEach { line -> InkLineRow(line = line, onOpen = line.link?.let { { actions.onOpenLink(it) } }) }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

/**
 * The sky over the person's city right now (board 1): its colours by the time of day, a line of trees, the city and
 * its running clock on the left, how the viewer sees the page on the right. Only when the city reaches this viewer.
 */
@Composable
private fun SkyBand(
    place: ProfilePlace,
    seenAs: String?,
    chips: Boolean,
) {
    val phase =
        when (place.sky) {
            "dawn" -> SkyPalette.Phase.DAWN
            "evening" -> SkyPalette.Phase.DUSK
            "night" -> SkyPalette.Phase.NIGHT
            else -> SkyPalette.Phase.DAY
        }
    val sky = SkyPalette.sky(phase, SkyPalette.Weather.CLEAR)
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(132.dp)
                .semantics(mergeDescendants = true) { }
                .testTag("profileSources.sky"),
    ) {
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics { }) {
            drawRect(Brush.verticalGradient(listOf(sky.top, sky.mid, sky.bottom)))
            if (phase == SkyPalette.Phase.NIGHT) {
                listOf(0.08f to 0.2f, 0.22f to 0.12f, 0.37f to 0.3f, 0.61f to 0.16f, 0.78f to 0.26f, 0.9f to 0.1f).forEach { (x, y) ->
                    drawCircle(
                        PantopusColors.appTextInverse.copy(alpha = 0.8f),
                        radius = 1.2.dp.toPx(),
                        center = Offset(size.width * x, size.height * y),
                    )
                }
            }
            // A line of firs along the bottom, darker than the horizon.
            val ground = Color(red = sky.bottom.red * 0.35f, green = sky.bottom.green * 0.42f, blue = sky.bottom.blue * 0.4f)
            val trees = Path()
            val base = size.height
            var x = -6.dp.toPx()
            var n = 0
            while (x < size.width + 12.dp.toPx()) {
                val h = (14 + (n * 37 % 11)).dp.toPx()
                val w = (8 + (n * 23 % 5)).dp.toPx()
                trees.moveTo(x, base)
                trees.lineTo(x + w / 2, base - h)
                trees.lineTo(x + w, base)
                trees.close()
                x += w * 0.8f
                n++
            }
            drawPath(trees, ground)
        }
        if (chips) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Box(Modifier.weight(1f, fill = false)) { PlaceChip(place) }
                seenAs?.let {
                    Spacer(Modifier.size(8.dp))
                    SeenAsChip(it, onSky = true)
                }
            }
        }
    }
}

/** "Camas, WA · 7:12 PM": the city and its clock, light on dark. */
@Composable
private fun PlaceChip(place: ProfilePlace) {
    val clock = rememberCityClock(place)
    val label = listOfNotNull(place.label, clock).joinToString(" · ")
    Box(
        modifier =
            Modifier
                .clip(RoundedCornerShape(50))
                .background(PantopusColors.appText)
                .padding(horizontal = 10.dp, vertical = 6.dp)
                .testTag("profileSources.place"),
    ) {
        Text(text = label, style = SourcesType.caption.copy(fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextInverse))
    }
}

/** "Seen as a connection": how this page was drawn for the viewer. */
@Composable
private fun SeenAsChip(
    text: String,
    onSky: Boolean,
) {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(50))
                .background(if (onSky) PantopusColors.appSurface else PantopusColors.appSurfaceSunken)
                .padding(horizontal = 10.dp, vertical = 6.dp)
                .testTag("profileSources.seenAs"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PantopusIconImage(icon = PantopusIcon.Eye, contentDescription = null, size = 13.dp, tint = PantopusColors.appText)
        Text(text = text, style = SourcesType.caption.copy(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText))
    }
}

/** The city's clock, kept running from its time zone; the server's time when there is no zone. */
@Composable
private fun rememberCityClock(place: ProfilePlace): String? {
    val zone = remember(place.zone) { place.zone?.let { runCatching { ZoneId.of(it) }.getOrNull() } }
    var now by remember(zone) { mutableStateOf(zone?.let { ZonedDateTime.now(it) }) }
    LaunchedEffect(zone) {
        if (zone == null) return@LaunchedEffect
        while (true) {
            now = ZonedDateTime.now(zone)
            delay((60 - (now?.second ?: 0)) * 1_000L)
        }
    }
    return now?.format(CLOCK) ?: place.time
}

private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.US)

/** "12 years on record · Open the record", the meter, and the three inks in words (board 1). */
@Composable
private fun RecordWell(
    summary: ProfileSummary,
    onOpenRecord: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(PantopusColors.appSurfaceSunken)
                .then(
                    if (onOpenRecord != null) {
                        Modifier.clickable(onClickLabel = "Open the record", role = Role.Button, onClick = onOpenRecord)
                    } else {
                        Modifier
                    },
                ).padding(horizontal = 14.dp, vertical = 12.dp)
                .testTag("profileSources.recordWell"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(yearsOnRecord(summary.years), style = SourcesType.title, modifier = Modifier.weight(1f))
            if (onOpenRecord != null) Text("Open the record", style = SourcesType.link)
        }
        InkMeter(summary)
        InkCounts(summary)
    }
}

/** The tab bar (`.tabs`): the person's first name, Work, Record, as the server sends them; 48 dp tall. */
@Composable
internal fun SourcesTabBar(
    tabs: List<ProfilePageTab>,
    selected: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (tabs.size < 2) return
    Column(modifier.fillMaxWidth().background(PantopusColors.appSurface)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorder))
        Row(Modifier.fillMaxWidth()) {
            tabs.forEach { tab ->
                val on = tab.key == (selected ?: tabs.first().key)
                Box(
                    modifier =
                        Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Tab) { onSelect(tab.key) }
                            .semantics {
                                this.selected = on
                                role = Role.Tab
                            }.testTag("profileSources.tab.${tab.key}"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = tab.title,
                        style =
                            SourcesType.rowTitle.copy(
                                color = if (on) PantopusColors.primary600 else PantopusColors.appTextSecondary,
                            ),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp),
                    )
                    if (on) {
                        Box(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .height(2.dp)
                                .background(PantopusColors.profileRecordNow),
                        )
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorder))
    }
}

/** The bar over Work and Record (board 12): Back, the person's small portrait and name, Share. */
@Composable
private fun CompactBar(
    header: ProfilePageHeader,
    onBack: () -> Unit,
    onShare: (() -> Unit)?,
) {
    Row(
        modifier =
            Modifier.fillMaxWidth().background(
                PantopusColors.appSurface,
            ).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileIconButton(
            icon = PantopusIcon.ChevronLeft,
            label = "Back",
            onClick = onBack,
            iconSize = 26.dp,
            testTag = "profileSources.back",
        )
        Row(
            modifier = Modifier.weight(1f).semantics(mergeDescendants = true) { heading() },
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .border(1.5.dp, PantopusColors.appText, CircleShape)
                    .padding(1.5.dp),
            ) {
                ProfileAvatar(name = header.name, photoUrl = header.portraitUrl, seed = header.userId, size = 26.dp)
            }
            Text(text = header.name, style = SourcesType.title.copy(color = PantopusColors.appText), maxLines = 2)
        }
        if (onShare != null) {
            ProfileIconButton(icon = PantopusIcon.Share, label = "Share ${header.firstName}'s page", onClick = onShare, iconSize = 20.dp)
        } else {
            Spacer(Modifier.size(48.dp))
        }
    }
}

/** "<First name> chose what this page shows." Every page opened by a link ends with it (rule 4.3). */
@Composable
private fun FooterLine(text: String) {
    Text(
        text = text,
        style = SourcesType.caption,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("profileSources.footer"),
    )
}

/** The visitor's bar on the first tab (board 1): Back; Share and ⋯ on the right. */
@Composable
internal fun SourcesVisitorBar(
    firstName: String,
    onBack: () -> Unit,
    onShare: (() -> Unit)?,
    onMore: (() -> Unit)?,
) {
    Row(
        modifier = Modifier.fillMaxWidth().background(PantopusColors.appSurface).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileIconButton(
            icon = PantopusIcon.ChevronLeft,
            label = "Back",
            onClick = onBack,
            iconSize = 26.dp,
            testTag = "publicProfileBack",
        )
        Spacer(Modifier.weight(1f))
        if (onShare != null) {
            ProfileIconButton(
                icon = PantopusIcon.Share,
                label = "Share $firstName's page",
                onClick = onShare,
                iconSize = 20.dp,
                testTag = "profileSources.share",
            )
        }
        if (onMore != null) {
            ProfileIconButton(
                icon = PantopusIcon.MoreHorizontal,
                label = "More: share, follow, block or report",
                onClick = onMore,
                iconSize = 24.dp,
                testTag = "publicProfileMore",
            )
        }
    }
}

/** A small round tile with an icon (`.tile`), in a lane's colours or the quiet grey. */
@Composable
internal fun SourcesTile(
    icon: PantopusIcon,
    background: Color,
    tint: Color,
    size: Dp = 36.dp,
) {
    Box(
        modifier = Modifier.size(size).clip(RoundedCornerShape(9.dp)).background(background).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 18.dp, tint = tint)
    }
}

/** Says a description for TalkBack on a decorative drawing that carries meaning. */
internal fun Modifier.described(text: String): Modifier = semantics { contentDescription = text }
