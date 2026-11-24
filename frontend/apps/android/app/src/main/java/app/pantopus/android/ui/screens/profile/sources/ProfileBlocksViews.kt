@file:Suppress("LongMethod", "LongParameterList", "MagicNumber", "TooManyFunctions")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.profile.InCommonLine
import app.pantopus.android.ui.screens.profile.ProfileAvatar
import app.pantopus.android.ui.screens.profile.ProfileInCommon
import app.pantopus.android.ui.screens.profile.ProfilePrompt
import app.pantopus.android.ui.screens.profile.inCommonLines
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import coil.compose.SubcomposeAsyncImage

/** What the blocks do when tapped. In a preview nothing acts ([interactive] false): it shows the page, it doesn't use it. */
internal class SourcesBlockActions(
    val onOpenLink: (ProfilePageLink) -> Unit = {},
    /** A month on the Record chart; null on a page that can't open months. */
    val onOpenMonth: ((RecordMonth) -> Unit)? = null,
    /** `more_closer`'s Ask to connect; null when the viewer can't ask (already asked, a preview). */
    val onConnect: (() -> Unit)? = null,
    /** Leave your card (phase 3); null leaves the button out. */
    val onLeaveCard: (() -> Unit)? = null,
    /** The signed-in viewer, for "You and …" words ("You're going to Maria's …"). */
    val viewerId: String? = null,
    val interactive: Boolean = true,
)

/** One block, in its card. A block the app can't draw here draws nothing. */
@Composable
internal fun SourcesBlock(
    block: ProfileBlock,
    page: ProfilePage,
    actions: SourcesBlockActions,
    slots: SourcesFrameSlots,
    month: RecordMonth?,
) {
    val open: (ProfilePageLink?) -> (() -> Unit)? = { link -> link?.takeIf { actions.interactive }?.let { { actions.onOpenLink(it) } } }
    when (block) {
        is ProfileBlock.Lines -> LinesCard(block, open)
        is ProfileBlock.Says -> CardColumn(tag = "profileSources.says") { SaysContent(block) }
        is ProfileBlock.KnownFor -> CardColumn(tag = "profileSources.knownFor") { KnownForContent(block, open) }
        is ProfileBlock.InCommon -> InCommonCard(block, page, actions)
        is ProfileBlock.Doors -> DoorsCard(block, actions, open)
        is ProfileBlock.Shelf -> ShelfCard(block)
        is ProfileBlock.Prompts -> PromptsCard(block)
        is ProfileBlock.PinnedPosts -> slots.pinnedPosts()
        is ProfileBlock.Rows -> RowsCard(block, open)
        is ProfileBlock.MoreCloser -> MoreCloserCard(block, actions)
        is ProfileBlock.RecordChart -> RecordChartCard(block, page.header.firstName, actions, month)
        is ProfileBlock.CanDo -> CanDoCard(block)
        is ProfileBlock.Pieces -> if (block.pinned) PinnedPieces(block, open) else PieceList(block, open)
        is ProfileBlock.WorkRings -> WorkRingsCard(block, page.header.firstName)
        is ProfileBlock.Owns -> OwnsCard(block, open)
    }
}

/** A card with the boards' inner padding (16 20 18) and 12 between its parts. */
@Composable
private fun CardColumn(
    tag: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier.sourcesCard().padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 18.dp).testTag(tag),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) { content() }
}

/** A block's title row: the over-line, and a quiet note or a link on the right. */
@Composable
private fun BlockTitle(
    title: String?,
    color: Color = PantopusColors.appTextSecondary,
    trailing: String? = null,
    more: ProfileMore? = null,
    onMore: (() -> Unit)? = null,
) {
    if (title == null && trailing == null && more == null) return
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        title?.let { SourcesOverline(it, modifier = Modifier.weight(1f), color = color) } ?: Spacer(Modifier.weight(1f))
        trailing?.let { Text(it, style = SourcesType.caption) }
        if (more != null) {
            Box(
                modifier =
                    Modifier
                        .heightIn(min = 48.dp)
                        .then(if (onMore != null) Modifier.clickable(role = Role.Button, onClick = onMore) else Modifier)
                        .padding(start = 8.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Text(more.text, style = SourcesType.link)
            }
        }
    }
}

/** A Record group's over-line takes its lane's colour (board 12); elsewhere titles are the quiet grey. */
private fun laneTitleColor(id: String): Color =
    when (id) {
        "record_home" -> PantopusColors.home
        "record_work" -> PantopusColors.magic
        "record_others" -> PantopusColors.personal
        else -> PantopusColors.appTextSecondary
    }

@Composable
private fun LinesCard(
    block: ProfileBlock.Lines,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    CardColumn(tag = "profileSources.lines.${block.id}") {
        BlockTitle(title = block.title, color = laneTitleColor(block.id), more = block.more, onMore = open(block.more?.link))
        block.lines.forEach { line ->
            val who = line.who
            if (who != null) WrittenLine(line, who, open) else InkLineRow(line = line, onOpen = open(line.link))
        }
    }
}

/**
 * A line someone wrote about the person (a review, contract v1.2): the words, then the writer by name and portrait
 * where they allow it (a tap opens their page), else by what they did, and when. The line itself opens what it is tied
 * to (a review's gig).
 */
@Composable
private fun WrittenLine(
    line: ProfileLine,
    who: ProfileWho,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    val onLine = open(line.link)
    val onWriter = open(who.userId?.let { ProfilePageLink.Profile(it, who.username) })
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.testTag("profileSources.writtenLine")) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .then(if (onLine != null) Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onLine) else Modifier)
                    .semantics(mergeDescendants = true) { },
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.width(16.dp).padding(top = 5.5.dp, start = 3.dp)) { InkGlyph(line.ink) }
            Column(Modifier.weight(1f)) {
                Text(text = line.text, style = if (line.ink == ProfileInk.Said) SourcesType.said else SourcesType.body)
                Text(text = inkHow(line.ink, line.how), style = SourcesType.caption, modifier = Modifier.padding(top = 2.dp))
            }
        }
        Row(
            modifier =
                Modifier
                    .padding(start = 26.dp)
                    .then(if (onWriter != null) Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onWriter) else Modifier)
                    .semantics(mergeDescendants = true) { },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (who.name != null || who.portraitUrl != null) {
                ProfileAvatar(name = who.name.orEmpty(), photoUrl = who.portraitUrl, seed = who.userId, size = 22.dp)
            }
            Text(text = listOfNotNull(who.name, who.did, line.whenText).joinToString(" · "), style = SourcesType.caption)
        }
    }
}

/** Says (board 1): the person's one line in their serif, large, with "Said · when". */
@Composable
private fun SaysContent(block: ProfileBlock.Says) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics(mergeDescendants = true) { }) {
        block.title?.let { SourcesOverline(it) }
        Text(text = block.line.text, style = SourcesType.said.copy(fontSize = 20.sp, lineHeight = 27.sp, color = PantopusColors.appText))
        Text(text = inkHow(block.line.ink, block.line.how), style = SourcesType.caption)
    }
}

/** Known for (board 1, phase 3): what others wrote, each with who (or what they did) and when. */
@Composable
private fun KnownForContent(
    block: ProfileBlock.KnownFor,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    BlockTitle(title = block.title, more = block.more, onMore = open(block.more?.link))
    block.lines.forEach { item ->
        Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics(mergeDescendants = true) { }) {
            Text(text = item.line.text, style = SourcesType.body)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (item.whoName != null || item.whoPortrait != null) {
                    ProfileAvatar(name = item.whoName.orEmpty(), photoUrl = item.whoPortrait, seed = item.whoUserId, size = 22.dp)
                }
                val who = listOfNotNull(item.whoName, item.whoDid, item.whenText).joinToString(" · ")
                Text(text = listOf(item.line.ink.word, who).filter { it.isNotEmpty() }.joinToString(" · "), style = SourcesType.caption)
            }
        }
    }
}

/** Says and Known for in one card with a rule between them, as board 1 draws them. */
@Composable
internal fun SaysAndKnownForCard(
    says: ProfileBlock.Says,
    knownFor: ProfileBlock.KnownFor,
    actions: SourcesBlockActions,
) {
    val open: (ProfilePageLink?) -> (() -> Unit)? = { link -> link?.takeIf { actions.interactive }?.let { { actions.onOpenLink(it) } } }
    CardColumn(tag = "profileSources.says") {
        SaysContent(says)
        SourcesDivider()
        KnownForContent(knownFor, open)
    }
}

/** "You and Maria" (board 1): today's in-common words (shared with web and iOS) in the board's rows. */
@Composable
private fun InCommonCard(
    block: ProfileBlock.InCommon,
    page: ProfilePage,
    actions: SourcesBlockActions,
) {
    val viewer = actions.viewerId ?: return
    val lines = inCommonLines(ProfileInCommon(block.body, page.header.userId, viewer), page.header.firstName)
    if (lines.isEmpty()) return
    Column(Modifier.sourcesCard().testTag("profileSources.inCommon")) {
        block.title?.let { SourcesOverline(it, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp)) }
        lines.forEachIndexed { index, line ->
            if (index > 0) SourcesDivider()
            val target = line.target?.takeIf { actions.interactive }
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(
                            if (target != null) {
                                Modifier.clickable(role = Role.Button) {
                                    actions.onOpenLink(
                                        when (target) {
                                            is app.pantopus.android.ui.screens.profile.InCommonTarget.Plan -> ProfilePageLink.Plan(target.id)
                                            is app.pantopus.android.ui.screens.profile.InCommonTarget.SupportTrain ->
                                                ProfilePageLink.SupportTrain(target.id)
                                        },
                                    )
                                }
                            } else {
                                Modifier
                            },
                        ).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (line.kind) {
                    InCommonLine.Kind.Plans -> SourcesTile(PantopusIcon.Calendar, PantopusColors.personalBg, PantopusColors.personal)
                    InCommonLine.Kind.SupportTrains -> SourcesTile(PantopusIcon.Heart, PantopusColors.homeBg, PantopusColors.home)
                    InCommonLine.Kind.Connections -> SourcesTile(PantopusIcon.Users, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong)
                    InCommonLine.Kind.Skills -> SourcesTile(PantopusIcon.Hand, PantopusColors.businessBg, PantopusColors.business)
                }
                Column(Modifier.weight(1f)) {
                    Text(text = line.text, style = SourcesType.rowTitle.copy(fontWeight = FontWeight.Normal))
                    line.detail?.let { Text(text = it, style = SourcesType.caption) }
                }
                if (target != null) {
                    PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                }
            }
        }
    }
}

private fun doorTile(key: String): Triple<PantopusIcon, Color, Color> =
    when (key) {
        "hire", "see_work" -> Triple(PantopusIcon.Hammer, PantopusColors.businessBg, PantopusColors.business)
        "ask" -> Triple(PantopusIcon.MessageCircle, PantopusColors.personalBg, PantopusColors.personal)
        "borrow" -> Triple(PantopusIcon.ArrowRightLeft, PantopusColors.homeBg, PantopusColors.home)
        "invite" -> Triple(PantopusIcon.Calendar, PantopusColors.personalBg, PantopusColors.personal)
        else -> Triple(PantopusIcon.Mail, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong)
    }

/** Doors (board 1, phase 3): the person's chosen ways in, then Leave your card. */
@Composable
private fun DoorsCard(
    block: ProfileBlock.Doors,
    actions: SourcesBlockActions,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    Column(Modifier.sourcesCard().testTag("profileSources.doors")) {
        block.title?.let { SourcesOverline(it, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp)) }
        block.doors.forEachIndexed { index, door ->
            if (index > 0) SourcesDivider()
            val onOpen = open(door.link)
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val (icon, bg, tint) = doorTile(door.key)
                SourcesTile(icon, bg, tint)
                Column(Modifier.weight(1f)) {
                    Text(text = door.text, style = SourcesType.rowTitle)
                    door.note?.let { Text(text = it, style = SourcesType.caption) }
                }
                if (onOpen != null) {
                    PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                }
            }
        }
        // Leave your card does something only from phase 3: until then neither the button nor its note shows.
        val leave = block.leaveCardText?.takeIf { actions.onLeaveCard != null }
        if (leave != null || block.signInNote != null) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (leave != null) {
                    val onLeave = actions.onLeaveCard?.takeIf { actions.interactive }
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(12.dp))
                                .then(if (onLeave != null) Modifier.clickable(role = Role.Button, onClick = onLeave) else Modifier),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = leave, style = SourcesType.title)
                    }
                    block.leaveCardNote?.let { Text(it, style = SourcesType.caption, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
                }
                block.signInNote?.let { Text(it, style = SourcesType.caption, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            }
        }
    }
}

/** The shelf (board 1, phase 3): up to five objects on a wooden plank, each with its caption in the person's words. */
@Composable
private fun ShelfCard(block: ProfileBlock.Shelf) {
    Column(
        modifier = Modifier.sourcesCard().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 14.dp).testTag("profileSources.shelf"),
    ) {
        block.title?.let { SourcesOverline(it, modifier = Modifier.padding(horizontal = 8.dp)) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 6.dp, end = 6.dp, top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            block.objects.forEach { obj ->
                Box(Modifier.weight(1f).height(96.dp).semantics { contentDescription = obj.caption }, contentAlignment = Alignment.BottomCenter) {
                    obj.pictureUrl?.let { url ->
                        SubcomposeAsyncImage(
                            model = url,
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            alignment = Alignment.BottomCenter,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(9.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(PantopusColors.profileShelfPlank)
                .clearAndSetSemantics { },
        ) {
            Box(Modifier.fillMaxWidth().height(3.dp).background(PantopusColors.profileShelfEdge))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 6.dp, end = 6.dp, top = 10.dp).clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            block.objects.forEach { obj ->
                // Plain words: a caption carries no ink, and ink is never told by style alone (rules 4.1, 16).
                Text(
                    text = obj.caption,
                    style = SourcesType.caption.copy(color = PantopusColors.appTextStrong, lineHeight = 15.sp),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Get to know (board 1): each question (the app's catalog words) and the answer in the person's serif. */
@Composable
private fun PromptsCard(block: ProfileBlock.Prompts) {
    val hows = block.prompts.map { inkHow(it.line.ink, it.line.how) }
    val oneHow = hows.distinct().singleOrNull()
    CardColumn(tag = "profileSources.prompts") {
        block.title?.let { SourcesOverline(it) }
        block.prompts.forEachIndexed { index, prompt ->
            val question = ProfilePrompt.of(prompt.key)?.text?.removeSuffix("…") ?: return@forEachIndexed
            Column(Modifier.semantics(mergeDescendants = true) { }) {
                Text(text = question, style = SourcesType.caption)
                Text(text = prompt.answer, style = SourcesType.said)
                if (oneHow == null) Text(text = hows[index], style = SourcesType.caption, modifier = Modifier.padding(top = 2.dp))
            }
        }
        oneHow?.let { Text(text = it, style = SourcesType.caption) }
    }
}

/** Plain rows that open the person's Moments and posts (board 1). */
@Composable
private fun RowsCard(
    block: ProfileBlock.Rows,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    Column(Modifier.sourcesCard().testTag("profileSources.rows")) {
        block.title?.let { SourcesOverline(it, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp)) }
        block.rows.forEachIndexed { index, row ->
            if (index > 0) SourcesDivider()
            val onOpen = open(row.link)
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .testTag("profileSources.row.${row.key}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(text = row.title, style = SourcesType.rowTitle)
                    row.detail?.let { Text(text = it, style = SourcesType.caption) }
                }
                if (onOpen != null) {
                    PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                }
            }
        }
    }
}

/** "Maria shows more to her connections" (board 2): inside the app only, with Ask to connect. */
@Composable
private fun MoreCloserCard(
    block: ProfileBlock.MoreCloser,
    actions: SourcesBlockActions,
) {
    Row(
        modifier = Modifier.sourcesCard().padding(16.dp).testTag("profileSources.moreCloser"),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SourcesTile(PantopusIcon.Users, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            block.title?.let { Text(text = it, style = SourcesType.rowTitle, modifier = Modifier.semantics { heading() }) }
            Text(text = block.text, style = SourcesType.secondary)
            val connect = actions.onConnect?.takeIf { block.connect && actions.interactive }
            if (connect != null) {
                Box(
                    modifier =
                        Modifier
                            .padding(top = 8.dp)
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(PantopusColors.appSurfaceSunken)
                            .clickable(role = Role.Button, onClick = connect)
                            .padding(horizontal = 16.dp)
                            .testTag("profileSources.askToConnect"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "Ask to connect", style = SourcesType.secondary.copy(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText))
                }
            }
        }
    }
}

/** The Record chart (board 12): the full rings, the key in words, and the server's note. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecordChartCard(
    block: ProfileBlock.RecordChart,
    firstName: String,
    actions: SourcesBlockActions,
    month: RecordMonth?,
) {
    val lanes = ProfileLane.entries.filter { it in block.lanes }
    val laneWords = lanes.joinToString(", ") { it.label.lowercase() }
    val description =
        "$firstName's rings in full. Each ring is a year, from ${block.rings.from} at the centre to ${block.rings.now.year} outside, " +
            "January at the top. Lines for $laneWords. Thick lines are seen, thin lines are signed, dotted lines are said."
    val onOpenMonth = actions.onOpenMonth?.takeIf { actions.interactive }
    Column(
        modifier = Modifier.sourcesCard().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 16.dp).testTag("profileSources.recordChart.card"),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(block.title.orEmpty(), style = SourcesType.title, modifier = Modifier.weight(1f).semantics { heading() })
            block.subtitle?.let { Text(it, style = SourcesType.caption) }
        }
        ProfileRecordChart(
            rings = block.rings,
            lanes = block.lanes,
            contentDescription = description,
            modifier = Modifier.padding(top = 6.dp),
            selected = month,
            onOpenMonth =
                onOpenMonth?.let { openMonth ->
                    { picked: RecordMonth -> if (block.rings.hasShownMonth(picked, block.lanes)) openMonth(picked) }
                },
            latestMonth =
                RecordMonth(block.rings.now.year, block.rings.now.monthValue - 1).let { now ->
                    now.takeIf { block.rings.hasShownMonth(it, block.lanes) } ?: block.rings.adjacentShownMonth(now, block.lanes, -1)
                },
        )
        Column(Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ProfileInk.entries.forEach { ink -> InkKey(ink) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                lanes.forEach { lane ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(lane.color))
                        Text(lane.label, style = SourcesType.caption)
                    }
                }
            }
            block.note?.let { Text(it, style = SourcesType.caption) }
        }
    }
}

/** Whether [month] has anything in a lane this viewer may see (only then does a tap open it; contract §3.7). */
internal fun ProfileRings.hasShownMonth(
    month: RecordMonth,
    lanes: Set<ProfileLane>,
): Boolean {
    val index = years.indexOf(month.year)
    if (index < 0) return false
    return lanes.any { lane -> lane(lane)[index].getOrNull(month.month) != null }
}

/** One ink's stroke sample and its word, for the chart's key. */
@Composable
private fun InkKey(ink: ProfileInk) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.width(18.dp).height(8.dp).clearAndSetSemantics { }) {
            val y = size.height / 2
            when (ink) {
                ProfileInk.Seen -> drawLine(PantopusColors.appText, Offset(0f, y), Offset(size.width, y), strokeWidth = 5.dp.toPx())
                ProfileInk.Signed -> drawLine(PantopusColors.appText, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.5.dp.toPx())
                ProfileInk.Said ->
                    drawLine(
                        PantopusColors.appTextMuted,
                        Offset(0f, y),
                        Offset(size.width, y),
                        strokeWidth = 2.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())),
                    )
            }
        }
        Text(ink.word, style = SourcesType.caption)
    }
}

/** Can do (board 7): each skill with its count of pieces and a meter of their inks; a skill with none is a Said line. */
@Composable
private fun CanDoCard(block: ProfileBlock.CanDo) {
    val most = block.skills.maxOfOrNull { it.pieces }?.coerceAtLeast(1) ?: 1
    Column(Modifier.sourcesCard().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 6.dp).testTag("profileSources.canDo")) {
        BlockTitle(title = block.title, trailing = block.subtitle)
        Spacer(Modifier.height(6.dp))
        block.skills.forEachIndexed { index, skill ->
            if (index > 0) SourcesDivider()
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) { },
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                if (skill.pieces > 0) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(skill.name, style = SourcesType.title, modifier = Modifier.weight(1f))
                        Text(inkHow(skill.line.ink, skill.line.how), style = SourcesType.caption)
                    }
                    Box(Modifier.fillMaxWidth(skill.pieces.toFloat() / most)) {
                        InkMeter(ProfileSummary(years = 0, seenMonths = skill.seen, signedMonths = skill.signed, saidMonths = skill.said))
                    }
                } else {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            skill.name,
                            style = if (skill.line.ink == ProfileInk.Said) SourcesType.said else SourcesType.title,
                            modifier = Modifier.weight(1f),
                        )
                        Text(inkHow(skill.line.ink, skill.line.how), style = SourcesType.caption, textAlign = TextAlign.End)
                    }
                }
            }
        }
    }
}

private fun pieceKindWord(kind: String?): String? =
    when (kind) {
        "did" -> "Did"
        "built" -> "Built"
        "owns" -> "Owns"
        else -> null
    }

private fun pieceMedia(piece: WorkPiece): String? =
    listOfNotNull(
        piece.photos.takeIf { it > 0 }?.let { if (it == 1) "1 photo" else "$it photos" },
        piece.videos.takeIf { it > 0 }?.let { if (it == 1) "1 video" else "$it videos" },
        piece.documents.takeIf { it > 0 }?.let { if (it == 1) "1 document" else "$it documents" },
        piece.links.takeIf { it > 0 }?.let { if (it == 1) "1 link" else "$it links" },
    ).takeIf { it.isNotEmpty() }?.joinToString(" · ")

/** A piece's picture with its kind and year in a tag, and what it holds on the right (board 7). */
@Composable
private fun PieceCover(
    piece: WorkPiece,
    height: androidx.compose.ui.unit.Dp,
    withMedia: Boolean,
) {
    Box(
        modifier = Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(16.dp)).background(PantopusColors.businessBg),
    ) {
        PieceImage(piece.coverUrl, iconSize = 32.dp)
        listOfNotNull(pieceKindWord(piece.kind), piece.whenText).joinToString(" · ").takeIf { it.isNotEmpty() }?.let { tag ->
            PictureTag(tag, Modifier.align(Alignment.BottomStart))
        }
        if (withMedia) pieceMedia(piece)?.let { PictureTag(it, Modifier.align(Alignment.BottomEnd)) }
    }
}

/** A piece's picture; with none (or one that doesn't load), the work tile's hammer on its violet tint. */
@Composable
private fun PieceImage(
    url: String?,
    iconSize: androidx.compose.ui.unit.Dp,
) {
    val placeholder: @Composable () -> Unit = {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            PantopusIconImage(icon = PantopusIcon.Hammer, contentDescription = null, size = iconSize, tint = PantopusColors.business)
        }
    }
    if (url == null) {
        placeholder()
    } else {
        SubcomposeAsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            loading = { placeholder() },
            error = { placeholder() },
        )
    }
}

@Composable
private fun PictureTag(
    text: String,
    modifier: Modifier,
) {
    Box(
        modifier =
            modifier
                .padding(8.dp)
                .clip(RoundedCornerShape(50))
                .background(PantopusColors.appText)
                .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Text(text, style = SourcesType.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextInverse))
    }
}

/** "Seen · how" under a piece, with its glyph. */
@Composable
private fun PieceInk(piece: WorkPiece) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        InkGlyph(piece.line.ink)
        Text(inkHow(piece.line.ink, piece.line.how), style = SourcesType.caption)
    }
}

/** Pinned pieces (board 7): the first large, the next two side by side. */
@Composable
private fun PinnedPieces(
    block: ProfileBlock.Pieces,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    Column(Modifier.fillMaxWidth().testTag("profileSources.pieces.${block.id}"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.padding(horizontal = 4.dp)) { BlockTitle(title = block.title, trailing = block.subtitle) }
        val first = block.pieces.first()
        PieceTile(first, 238.dp, large = true, open = open)
        block.pieces.drop(1).chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { piece -> Box(Modifier.weight(1f)) { PieceTile(piece, 130.dp, large = false, open = open) } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PieceTile(
    piece: WorkPiece,
    height: androidx.compose.ui.unit.Dp,
    large: Boolean,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    val onOpen = open(piece.line.link ?: ProfilePageLink.Piece(piece.id))
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                .semantics(mergeDescendants = true) { }
                .testTag("profileSources.piece.${piece.id}"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PieceCover(piece, height, withMedia = large)
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(piece.title, style = if (large) SourcesType.title.copy(fontSize = 17.sp, lineHeight = 23.sp) else SourcesType.rowTitle)
            PieceInk(piece)
        }
    }
}

/** All pieces (board 7): rows with a small picture, the title, kind and when, and the ink. */
@Composable
private fun PieceList(
    block: ProfileBlock.Pieces,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    Column(Modifier.sourcesCard().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 6.dp).testTag("profileSources.pieces.${block.id}")) {
        Box(Modifier.padding(horizontal = 4.dp)) { BlockTitle(title = block.title, trailing = block.subtitle) }
        block.pieces.forEachIndexed { index, piece ->
            if (index > 0) SourcesDivider()
            val onOpen = open(piece.line.link ?: ProfilePageLink.Piece(piece.id))
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                        .padding(horizontal = 4.dp, vertical = 12.dp)
                        .semantics(mergeDescendants = true) { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(PantopusColors.businessBg).clearAndSetSemantics { }) {
                    PieceImage(piece.coverUrl, iconSize = 20.dp)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(piece.title, style = SourcesType.rowTitle)
                    listOfNotNull(pieceKindWord(piece.kind), piece.whenText).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
                        Text(it, style = SourcesType.caption)
                    }
                    PieceInk(piece)
                }
                if (onOpen != null) {
                    PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                }
            }
        }
        block.more?.let { more ->
            val onMore = open(more.link)
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(if (onMore != null) Modifier.clickable(role = Role.Button, onClick = onMore) else Modifier),
                contentAlignment = Alignment.Center,
            ) { Text(more.text, style = SourcesType.link) }
        }
    }
}

/**
 * The work rings opened flat (board 7, `fan_chart`): a half band a year, months left to right, the work line in its
 * inks, and a dot a piece.
 */
@Composable
private fun WorkRingsCard(
    block: ProfileBlock.WorkRings,
    firstName: String,
) {
    val rings = block.rings
    val years = rings.years
    val grid = rings.lane(ProfileLane.Work)
    val total = block.years.sumOf { it.second }
    Column(Modifier.sourcesCard().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 12.dp).testTag("profileSources.workRings")) {
        Box(Modifier.padding(horizontal = 4.dp)) {
            BlockTitle(title = block.title, trailing = total.takeIf { it > 0 }?.let { if (it == 1) "1 piece" else "$it pieces" })
        }
        Canvas(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(358f / 206f)
                    .padding(top = 8.dp)
                    .semantics {
                        contentDescription =
                            "$firstName's work rings opened flat: each band is a year from ${years.first()} at the centre to " +
                            "${years.last()} outside, months run left to right, and each dot is a piece."
                    },
        ) {
            val unit = size.width / 358f
            val cx = size.width / 2
            val cy = 184f * unit
            val r0 = 26f
            val r1 = 172f
            val pitch = (r1 - r0) / years.size.coerceAtLeast(1)
            val color = PantopusColors.business
            years.forEachIndexed { i, _ ->
                val r = (r0 + i * pitch + pitch / 2) * unit
                drawArc(
                    PantopusColors.appSurfaceSunken,
                    180f,
                    180f,
                    false,
                    Offset(cx - r, cy - r),
                    Size(r * 2, r * 2),
                    style = Stroke(width = (pitch - 2.2f) * unit),
                )
            }
            years.forEachIndexed { i, year ->
                val r = (r0 + i * pitch + pitch / 2) * unit
                val growing = year == rings.now.year
                for (run in ringRuns(grid[i], rings.nowFraction.takeIf { growing })) {
                    val stroke =
                        when (run.ink) {
                            ProfileInk.Seen -> Stroke(width = 3f * unit, cap = StrokeCap.Butt)
                            ProfileInk.Signed -> Stroke(width = 1.3f * unit, cap = StrokeCap.Butt)
                            ProfileInk.Said ->
                                Stroke(
                                    width = 1.5f * unit,
                                    cap = StrokeCap.Round,
                                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.01f, 3.5f * unit)),
                                )
                        }
                    drawArc(color, 180f + run.start * 15f, (run.end - run.start) * 15f, false, Offset(cx - r, cy - r), Size(r * 2, r * 2), style = stroke)
                }
            }
            block.dots.forEach { (_, year, month) ->
                val i = years.indexOf(year)
                if (i < 0) return@forEach
                val r = (r0 + i * pitch + pitch / 2) * unit
                val a = Math.toRadians((180.0 + 15.0 * (month + 0.5)))
                val p = Offset(cx + r * kotlin.math.cos(a).toFloat(), cy + r * kotlin.math.sin(a).toFloat())
                drawCircle(PantopusColors.appSurface, radius = 4.7f * unit, center = p)
                drawCircle(color, radius = 3.3f * unit, center = p)
            }
            drawLine(PantopusColors.appBorderStrong, Offset(cx - (r1 + 4f) * unit, cy), Offset(cx + (r1 + 4f) * unit, cy), strokeWidth = unit)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProfileInk.entries.forEach { ink ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    InkGlyph(ink, color = PantopusColors.business)
                    Text(ink.word, style = SourcesType.caption)
                }
            }
            Text("A dot is a piece", style = SourcesType.caption)
        }
    }
}

/** Owns (board 7): a business, credentials and tools, each with its badge and ink. */
@Composable
private fun OwnsCard(
    block: ProfileBlock.Owns,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    Column(Modifier.sourcesCard().testTag("profileSources.owns")) {
        block.title?.let { SourcesOverline(it, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp)) }
        block.lines.forEachIndexed { index, owned ->
            if (index > 0) SourcesDivider()
            val onOpen = open(owned.line.link)
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .semantics(mergeDescendants = true) { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.businessBg).clearAndSetSemantics { },
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        owned.pictureUrl != null ->
                            SubcomposeAsyncImage(model = owned.pictureUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        owned.initials != null ->
                            Text(owned.initials, style = SourcesType.caption.copy(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = PantopusColors.magic))
                        else -> PantopusIconImage(icon = PantopusIcon.BadgeCheck, contentDescription = null, size = 18.dp, tint = PantopusColors.magic)
                    }
                }
                Column(Modifier.weight(1f)) {
                    Text(owned.line.text, style = if (owned.line.ink == ProfileInk.Said) SourcesType.said else SourcesType.rowTitle)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        InkGlyph(owned.line.ink)
                        Text(inkHow(owned.line.ink, owned.line.how), style = SourcesType.caption)
                    }
                }
                if (onOpen != null) {
                    PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
                }
            }
        }
    }
}
