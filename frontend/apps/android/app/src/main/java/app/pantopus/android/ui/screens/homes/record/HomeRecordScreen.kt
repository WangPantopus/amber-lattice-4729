package app.pantopus.android.ui.screens.homes.record

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.core.routing.ExternalLinks
import app.pantopus.android.data.api.models.homerecord.HomeRecord
import app.pantopus.android.data.api.models.homerecord.HomeRecordAction
import app.pantopus.android.data.api.models.homerecord.HomeRecordBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordHeader
import app.pantopus.android.data.api.models.homerecord.HomeRecordIntroBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordMetersBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordSectionLabelBlock
import app.pantopus.android.data.homerecord.HomeRecordSource
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * "This home's record" for a looked-up address, "Your home's record" for a Home (SPEC section 2): the server's
 * blocks drawn in order, a kind this app doesn't know left out. [source] is null for a routed page, whose Home
 * came in the route ([HomeRecordViewModel.HOME_ID_KEY]).
 *
 * [onAppLink] opens a link starting with `/` as the app's own screen (the owner claim, address verification); an
 * https link opens in the browser. Parity: iOS `HomeRecordView`.
 */
@Composable
fun HomeRecordScreen(
    title: String,
    onBack: () -> Unit,
    onAppLink: (String) -> Unit,
    source: HomeRecordSource? = null,
    viewModel: HomeRecordViewModel = hiltViewModel(),
) {
    LaunchedEffect(source) { if (source != null) viewModel.open(source) else viewModel.load() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val open: (String) -> Unit = { url ->
        when {
            url.startsWith("/") && !url.startsWith("//") -> onAppLink(url)
            ExternalLinks.isWeb(url) -> ExternalLinks.open(context, url)
        }
    }
    Column(modifier = Modifier.fillMaxSize().background(PantopusColors.appBg).testTag("homeRecord")) {
        RecordTopBar(title, onBack)
        when (val current = state) {
            HomeRecordUiState.Loading -> RecordSkeleton()
            is HomeRecordUiState.Error -> RecordError(current.message, viewModel::refresh)
            is HomeRecordUiState.Loaded ->
                RecordPage(current.record, open) { action ->
                    // Share hands the server's link to the phone's share sheet; save and claim are app links.
                    if (action.id == "share") shareRecordLink(context, action.url) else open(action.url)
                }
        }
    }
}

/** The page over the lookup result: system Back closes it first. */
@Composable
fun HomeRecordOverLookup(
    address: String,
    onClose: () -> Unit,
    onAppLink: (String) -> Unit,
) {
    BackHandler(onBack = onClose)
    HomeRecordScreen(
        title = "This home’s record",
        onBack = onClose,
        onAppLink = onAppLink,
        source = HomeRecordSource.Lookup(address),
        viewModel = hiltViewModel(key = "homeRecord.lookup"),
    )
}

/** An action or button url this page can open: an https page, or an app link starting with `/`. */
internal fun isOpenable(url: String?): Boolean =
    !url.isNullOrBlank() && ((url.startsWith("/") && !url.startsWith("//")) || ExternalLinks.isWeb(url))

@Composable
private fun RecordTopBar(
    title: String,
    onBack: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxWidth().height(Spacing.s12).padding(horizontal = Spacing.s1),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier =
                Modifier
                    .align(Alignment.CenterStart)
                    .size(Spacing.s12)
                    .clip(RoundedCornerShape(Radii.pill))
                    .clickable(role = Role.Button, onClick = onBack)
                    .testTag("homeRecord.back"),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(PantopusIcon.ChevronLeft, "Back", size = 22.dp, strokeWidth = 2f, tint = PantopusColors.appText)
        }
        Text(
            title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appTextStrong,
            modifier = Modifier.semantics { heading() },
        )
    }
}

@Composable
private fun RecordPage(
    record: HomeRecord,
    open: (String) -> Unit,
    onAction: (HomeRecordAction) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.s4)
                .padding(top = Spacing.s3, bottom = Spacing.s10)
                .testTag("homeRecord.state.${record.state}"),
    ) {
        RecordHeader(record.header)
        if (record.actions.isNotEmpty()) RecordActions(record.actions, onAction)
        var previous: HomeRecordBlock? = null
        record.blocks.forEach { block ->
            if (!drawsSomething(block)) return@forEach
            Spacer(Modifier.height(gapBefore(block, previous)))
            RecordBlock(block, open)
            previous = block
        }
        record.footer?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                fontSize = 12.sp,
                lineHeight = 17.sp,
                color = PantopusColors.appTextMuted,
                modifier = Modifier.padding(top = Spacing.s5, start = Spacing.s1, end = Spacing.s1),
            )
        }
    }
}

/** The room above [block], as the drawn screens space them. */
private fun gapBefore(
    block: HomeRecordBlock,
    previous: HomeRecordBlock?,
): Dp =
    when {
        block is HomeRecordIntroBlock -> 28.dp
        block is HomeRecordSectionLabelBlock -> Spacing.s6
        block is HomeRecordMetersBlock && !block.title.isNullOrBlank() -> Spacing.s6
        previous == null -> Spacing.s4
        previous is HomeRecordSectionLabelBlock -> 10.dp
        else -> Spacing.s3
    }

@Composable
private fun RecordHeader(header: HomeRecordHeader) {
    Column(modifier = Modifier.padding(top = Spacing.s3), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        header.chip?.takeIf { it.text.isNotBlank() }?.let { RecordHeaderChip(it.tone, it.text) }
        Text(
            header.title,
            fontSize = 28.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.02).em,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() }.testTag("homeRecord.title"),
        )
        header.subtitle?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 15.sp, lineHeight = 21.sp, color = PantopusColors.appTextSecondary)
        }
    }
}

@Composable
private fun RecordHeaderChip(
    tone: String?,
    text: String,
) {
    val (bg, fg) =
        when (tone) {
            "success" -> PantopusColors.successLight to PantopusColors.success
            "warning" -> PantopusColors.warningBg to PantopusColors.warning
            // "Public record" on a buyer's page (design/Buyer.dc.html).
            else -> PantopusColors.primary100 to PantopusColors.primary700
        }
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(Radii.pill))
                .background(bg)
                .padding(horizontal = 10.dp, vertical = Spacing.s1),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (tone == "success") PantopusIconImage(PantopusIcon.Check, null, size = 13.dp, strokeWidth = 2.5f, tint = fg)
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = fg)
    }
}

/** Loading: the page's own shape (header, picture, facts, a meters card), shimmering. */
@Composable
private fun RecordSkeleton() {
    BoxWithConstraints(
        modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.s4).testTag("homeRecord.loading"),
    ) {
        val full = maxWidth
        val tile = (full - Spacing.s4 * 2 - Spacing.s2 * (SKELETON_TILES - 1)) / SKELETON_TILES
        Column(modifier = Modifier.padding(top = Spacing.s6), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            Shimmer(width = 200.dp, height = 22.dp, cornerRadius = Radii.pill)
            Shimmer(width = full * SKELETON_TITLE, height = 30.dp, cornerRadius = Radii.sm)
            Shimmer(width = full * SKELETON_SUBTITLE, height = 18.dp, cornerRadius = Radii.sm)
            Spacer(Modifier.height(Spacing.s2))
            Shimmer(width = full, height = 290.dp, cornerRadius = Radii.xl2)
            Spacer(Modifier.height(Spacing.s1))
            Column(
                modifier = Modifier.fillMaxWidth().recordCard().padding(Spacing.s4),
                verticalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    repeat(SKELETON_TILES) { Shimmer(width = tile, height = 64.dp, cornerRadius = Radii.lg) }
                }
                Shimmer(width = full * SKELETON_LINE, height = 16.dp)
            }
            Spacer(Modifier.height(Spacing.s4))
            Shimmer(width = 140.dp, height = 14.dp)
            Shimmer(width = full, height = 220.dp, cornerRadius = Radii.xl2)
        }
    }
}

@Composable
private fun RecordError(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.s6).testTag("homeRecord.error"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        PantopusIconImage(PantopusIcon.AlertCircle, null, size = 28.dp, tint = PantopusColors.appTextSecondary)
        Spacer(Modifier.height(Spacing.s3))
        Text(
            "This home’s record didn’t load",
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appText,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.s1))
        Text(
            message,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            color = PantopusColors.appTextSecondary,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.s4))
        PrimaryButton(title = "Try again", onClick = onRetry, modifier = Modifier.width(200.dp).testTag("homeRecord.retry"))
    }
}

// The skeleton's lines, as parts of the page's width.
private const val SKELETON_TITLE = 0.7f
private const val SKELETON_SUBTITLE = 0.45f
private const val SKELETON_LINE = 0.75f
private const val SKELETON_TILES = 3
