@file:Suppress("LongMethod", "TooManyFunctions", "CyclomaticComplexMethod", "MagicNumber")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.screens.profile.ProfileIconButton
import app.pantopus.android.ui.screens.shared.media.MediaViewerDialog
import app.pantopus.android.ui.screens.shared.media.PostMediaItem
import app.pantopus.android.ui.screens.shared.media.PostMediaKind
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import kotlinx.coroutines.launch

/** The piece's title (board 8, `.h1` for a piece): 24/30 bold. */
private val PieceTitle = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)

/**
 * One piece opened (board 8), over the profile: its photos and videos, what it is, the person's words, how we know,
 * what it shows they can do, what is attached (videos, documents and link cards of words) and what the person who hired
 * them wrote. A part the server didn't send is not drawn; ink is the server's, and its word is always written.
 */
@Composable
internal fun ProfilePieceScreen(
    state: ProfilePieceState,
    firstName: String,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onOpenLink: (ProfilePageLink) -> Unit,
    onEdit: (() -> Unit)? = null,
) {
    Column(Modifier.fillMaxSize().background(PantopusColors.appBg).testTag("profileSources.piece")) {
        PieceTopBar(onBack, onEdit?.takeIf { state is ProfilePieceState.Ready })
        when (state) {
            is ProfilePieceState.Loading -> PieceSkeleton()
            is ProfilePieceState.Missing ->
                PieceMessage(
                    title = "This piece isn't here",
                    body = "It may have been hidden or removed.",
                    action = "Back to Work",
                    onAction = onBack,
                )
            is ProfilePieceState.Failed ->
                PieceMessage(
                    title = "This piece didn't open",
                    body = "Check your connection and try again.",
                    action = "Try again",
                    onAction = onRetry,
                )
            is ProfilePieceState.Ready -> PieceContent(state.detail, firstName, onOpenLink)
        }
    }
}

@Composable
private fun PieceTopBar(
    onBack: () -> Unit,
    onEdit: (() -> Unit)?,
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
            testTag = "profileSources.piece.back",
        )
        Text(
            text = "Piece",
            style = SourcesType.title,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        if (onEdit != null) {
            ProfileIconButton(
                icon = PantopusIcon.Pencil,
                label = "Change this piece",
                onClick = onEdit,
                iconSize = 20.dp,
                testTag = "profileSources.piece.edit",
            )
        } else {
            Spacer(Modifier.size(48.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PieceContent(
    detail: ProfilePieceDetail,
    firstName: String,
    onOpenLink: (ProfilePageLink) -> Unit,
) {
    val piece = detail.piece
    var viewer by remember { mutableStateOf<Pair<List<PostMediaItem>, Int>?>(null) }
    val galleryItems = remember(detail) { detail.gallery.map { it.toMediaItem() } }
    val open: (ProfilePageLink?) -> (() -> Unit)? = { link -> link?.let { { onOpenLink(it) } } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        when {
            detail.gallery.isNotEmpty() -> PieceGallery(detail.gallery, onOpen = { index -> viewer = galleryItems to index })
            piece.coverUrl != null ->
                Box(Modifier.fillMaxWidth().aspectRatio(GALLERY_RATIO).background(PantopusColors.businessBg).clearAndSetSemantics { }) {
                    PieceImage(piece.coverUrl, iconSize = 32.dp)
                }
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val chips = listOfNotNull(pieceKindWord(piece.kind), piece.whenText, piece.place)
            if (chips.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    pieceKindWord(piece.kind)?.let { PieceChip(it, PantopusColors.businessBg, PantopusColors.business) }
                    piece.whenText?.let { PieceChip(it, PantopusColors.appSurfaceSunken, PantopusColors.appTextSecondary) }
                    piece.place?.let { PieceChip(it, PantopusColors.appSurfaceSunken, PantopusColors.appTextSecondary) }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(piece.title, style = PieceTitle, modifier = Modifier.semantics { heading() })
                detail.description?.let { words ->
                    Column(Modifier.semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(words.text, style = SourcesType.said.copy(fontSize = 17.sp, lineHeight = 25.sp))
                        Text(inkHow(words.ink, words.how), style = SourcesType.caption)
                    }
                }
            }
            // The owner's own piece: who it reaches and how it shows, as the server works it out ("who sees it").
            if (detail.howItWillShow.isNotEmpty()) HowItWillShow(detail.howItWillShow, title = "How this piece shows")
            if (detail.howWeKnow.isNotEmpty()) {
                PieceCard(title = "How we know") {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        detail.howWeKnow.forEach { line -> InkLineRow(line, onOpen = open(line.link)) }
                    }
                }
            }
            if (detail.showsCan.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SourcesOverline("Shows $firstName can")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        detail.showsCan.forEach { skill ->
                            PieceChip(skill, PantopusColors.businessBg, PantopusColors.business, semibold = true)
                        }
                    }
                }
            }
            if (detail.attached.isNotEmpty() || detail.links.isNotEmpty()) {
                PieceCard(title = "Attached") {
                    Column {
                        detail.attached.forEachIndexed { index, attachment ->
                            if (index > 0) SourcesDivider()
                            AttachmentRow(attachment) {
                                val inGallery = detail.gallery.indexOfFirst { it.id == attachment.id }
                                viewer = if (inGallery >= 0) galleryItems to inGallery else listOf(attachment.toMediaItem()) to 0
                            }
                        }
                        detail.links.forEachIndexed { index, link ->
                            if (index > 0 || detail.attached.isNotEmpty()) Spacer(Modifier.height(12.dp))
                            PieceLinkCardView(link, onOpen = { onOpenLink(ProfilePageLink.Url(link.url, link.site)) })
                        }
                    }
                }
            }
            detail.written.forEach { line ->
                val who = line.who ?: return@forEach
                PieceCard(title = who.name?.let { "What $it wrote" } ?: "What they wrote") {
                    WrittenLine(line, who, open)
                }
            }
        }
    }
    viewer?.let { (items, start) -> MediaViewerDialog(items = items, startIndex = start, onDismiss = { viewer = null }) }
}

/** Board 8's picture area: a pager over the photos and videos, "1 of 6", what it holds, and the strip under it. */
@Composable
private fun PieceGallery(
    items: List<PieceAttachment>,
    onOpen: (Int) -> Unit,
) {
    val pager = rememberPagerState { items.size }
    val scope = rememberCoroutineScope()
    val photos = items.count { it.kind == PieceAttachment.Kind.Photo }
    val videos = items.count { it.kind == PieceAttachment.Kind.Video }
    val holds =
        listOfNotNull(
            photos.takeIf { it > 0 }?.let { if (it == 1) "1 photo" else "$it photos" },
            videos.takeIf { it > 0 }?.let { if (it == 1) "1 video" else "$it videos" },
        ).joinToString(" · ")
    Column(Modifier.fillMaxWidth().background(PantopusColors.appSurface)) {
        Box(Modifier.fillMaxWidth().aspectRatio(GALLERY_RATIO).background(PantopusColors.businessBg)) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                val item = items[page]
                Box(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .clickable(onClickLabel = "Open full screen", role = Role.Button) { onOpen(page) }
                            .semantics { contentDescription = "${item.word()} ${page + 1} of ${items.size}" },
                    contentAlignment = Alignment.Center,
                ) {
                    PieceImage(item.picture(), iconSize = 32.dp)
                    if (item.kind == PieceAttachment.Kind.Video) PlayDisc(size = 52.dp)
                }
            }
            PictureTag("${pager.currentPage + 1} of ${items.size}", Modifier.align(Alignment.BottomStart))
            if (holds.isNotEmpty()) PictureTag(holds, Modifier.align(Alignment.BottomEnd))
        }
        if (items.size > 1) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(items, key = { _, item -> item.id }) { index, item ->
                    val chosen = pager.currentPage == index
                    Box(
                        modifier =
                            Modifier
                                .size(width = 60.dp, height = 48.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(PantopusColors.businessBg)
                                .then(if (chosen) Modifier.border(2.dp, PantopusColors.appText, RoundedCornerShape(8.dp)) else Modifier)
                                .clickable(onClickLabel = "Show", role = Role.Button) { scope.launch { pager.animateScrollToPage(index) } }
                                .semantics { contentDescription = "${item.word()} ${index + 1} of ${items.size}" },
                        contentAlignment = Alignment.Center,
                    ) {
                        PieceImage(item.picture(), iconSize = 16.dp)
                        if (item.kind == PieceAttachment.Kind.Video) PlayDisc(size = 20.dp)
                    }
                }
            }
        }
    }
}

/** A video or a document under "Attached": its picture, what it is and how long (board 8). */
@Composable
private fun AttachmentRow(
    attachment: PieceAttachment,
    onOpen: () -> Unit,
) {
    val isVideo = attachment.kind == PieceAttachment.Kind.Video
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(onClickLabel = if (isVideo) "Play" else "Open", role = Role.Button, onClick = onOpen)
                .padding(vertical = 10.dp)
                .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .size(width = 72.dp, height = 52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(PantopusColors.appSurfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            if (isVideo) {
                PieceImage(attachment.picture(), iconSize = 20.dp)
                PlayDisc(size = 26.dp)
            } else {
                attachment.thumbnailUrl?.let { PieceImage(it, iconSize = 20.dp) }
                    ?: PantopusIconImage(
                        icon = PantopusIcon.FileText,
                        contentDescription = null,
                        size = 22.dp,
                        tint = PantopusColors.appTextSecondary,
                    )
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(attachment.title ?: attachment.word(), style = SourcesType.rowTitle)
            Text(attachment.detail ?: attachment.word(), style = SourcesType.caption)
        }
        if (!isVideo) {
            PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
        }
    }
}

/**
 * A link on a piece as a card of words (boards 8 and 11): what kind of page and whose site, its title and what it says,
 * and its ink. No picture from the page; a tap opens the page.
 */
@Composable
internal fun PieceLinkCardView(
    link: PieceLinkCard,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
    footer: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(PantopusColors.appSurfaceSunken)
                .then(
                    if (onOpen != null) {
                        Modifier.clickable(onClickLabel = "Open the page", role = Role.Button, onClick = onOpen)
                    } else {
                        Modifier
                    },
                )
                .padding(14.dp)
                .testTag("profileSources.linkCard"),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) { },
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SourcesTile(
                icon = linkIcon(link.kind),
                background = PantopusColors.appSurface,
                tint = PantopusColors.appTextSecondary,
                size = 32.dp,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = listOfNotNull(linkKindWord(link.kind), link.site).joinToString(" · ").uppercase(),
                    style = SourcesType.over,
                )
                Text(link.title ?: link.site ?: link.url, style = SourcesType.title)
                link.description?.let { Text(it, style = SourcesType.secondary) }
                Row(
                    modifier = Modifier.padding(top = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    InkGlyph(link.ink)
                    Text(inkHow(link.ink, link.how), style = SourcesType.caption)
                }
            }
        }
        footer?.invoke()
    }
}

/** A titled card on the piece (`.card` with `.over`). */
@Composable
private fun PieceCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(Modifier.sourcesCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SourcesOverline(title)
        content()
    }
}

@Composable
private fun PieceChip(
    text: String,
    background: androidx.compose.ui.graphics.Color,
    color: androidx.compose.ui.graphics.Color,
    semibold: Boolean = false,
) {
    Text(
        text = text,
        style = SourcesType.secondary.copy(color = color, fontWeight = if (semibold) FontWeight.SemiBold else FontWeight.Medium),
        modifier = Modifier.clip(RoundedCornerShape(50)).background(background).padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

/** The round play mark on a video's picture. */
@Composable
private fun PlayDisc(size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier.size(size).clip(CircleShape).background(PantopusColors.appText.copy(alpha = 0.72f)).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = PantopusIcon.Play, contentDescription = null, size = size * 0.42f, tint = PantopusColors.appTextInverse)
    }
}

/** While the piece is read: its picture and lines, in shimmer (never a spinner). */
@Composable
private fun PieceSkeleton() {
    Column(Modifier.fillMaxSize().semantics { contentDescription = "Opening the piece" }) {
        Shimmer(width = 400.dp, height = 300.dp, cornerRadius = 0.dp, modifier = Modifier.fillMaxWidth().aspectRatio(GALLERY_RATIO))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Shimmer(width = 180.dp, height = 28.dp, cornerRadius = 14.dp)
            Shimmer(width = 280.dp, height = 30.dp, cornerRadius = 8.dp)
            repeat(3) { Shimmer(width = 320.dp, height = 18.dp, cornerRadius = 6.dp, modifier = Modifier.fillMaxWidth()) }
            Shimmer(width = 320.dp, height = 140.dp, cornerRadius = 20.dp, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun PieceMessage(
    title: String,
    body: String,
    action: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = SourcesType.h3, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
        Text(body, style = SourcesType.secondary, textAlign = TextAlign.Center)
        Text(
            text = action,
            style = SourcesType.link,
            modifier =
                Modifier
                    .padding(top = 8.dp)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(50))
                    .clickable(role = Role.Button, onClick = onAction)
                    .padding(horizontal = 20.dp, vertical = 14.dp),
        )
    }
}

private const val GALLERY_RATIO = 4f / 3f

private fun PieceAttachment.word(): String =
    when (kind) {
        PieceAttachment.Kind.Photo -> "Photo"
        PieceAttachment.Kind.Video -> "Video"
        PieceAttachment.Kind.Document -> "Document"
    }

/** A photo shows itself; a video or document shows its thumbnail, if it has one. */
private fun PieceAttachment.picture(): String? = thumbnailUrl ?: url.takeIf { kind == PieceAttachment.Kind.Photo }

private fun PieceAttachment.toMediaItem(): PostMediaItem =
    PostMediaItem(
        id = id,
        kind =
            when (kind) {
                PieceAttachment.Kind.Photo -> PostMediaKind.Image
                PieceAttachment.Kind.Video -> PostMediaKind.Video
                PieceAttachment.Kind.Document -> PostMediaKind.Document
            },
        url = url,
        thumbnailUrl = thumbnailUrl,
    )

internal fun linkKindWord(kind: String): String =
    when (kind) {
        "video" -> "Video"
        "code" -> "Code"
        "app" -> "App"
        "article" -> "Article"
        "paper" -> "Paper"
        else -> "Site"
    }

private fun linkIcon(kind: String): PantopusIcon =
    when (kind) {
        "video" -> PantopusIcon.PlayCircle
        "code" -> PantopusIcon.Monitor
        "app" -> PantopusIcon.Smartphone
        "article" -> PantopusIcon.FileText
        "paper" -> PantopusIcon.BookOpen
        else -> PantopusIcon.Globe
    }
