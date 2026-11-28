@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.BuildConfig
import app.pantopus.android.data.api.models.reinvented.ReinventedMagazineItemDto
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlin.math.roundToInt

/**
 * The reach dial (PHASE-1 §2 piece 9; board B15), opened from the scope pill: Close circle and Around me (1 to 25
 * miles) and Explore, each with one line saying what it shows and how it is ordered, and "No hidden ranking" with the
 * page anyone can read that says Explore's rules. Close circle is the people the person is connected with, or one of
 * their circles of 2 to 8 (CONTRACT 8d): the circles' own pages open inside this sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReinventedReachDial(
    reach: String,
    miles: Int,
    onPick: (String, Int) -> Unit,
    onDismiss: () -> Unit,
    circleId: String? = null,
    onPickCircle: (String, String) -> Unit = { _, _ -> },
    circles: ReinventedCirclesViewModel = hiltViewModel(),
) {
    var picked by remember { mutableFloatStateOf(miles.toFloat()) }
    val shownMiles = picked.roundToInt()
    var page by remember { mutableStateOf<DialPage>(DialPage.Main) }
    val ui by circles.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { circles.read() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appBg,
        modifier = Modifier.testTag("reinventedPulse.dial"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.s5)
                    .padding(bottom = Spacing.s5)
                    .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            if (page != DialPage.Main) {
                CirclesPages(page, ui, circles, onPage = { page = it }, onLeave = onDismiss)
                return@Column
            }
            Text(
                "What Pulse shows",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier =
                    Modifier.semantics {
                        heading()
                    },
            )
            DialOption(
                key = ReinventedPulseViewModel.CLOSE,
                on = reach == ReinventedPulseViewModel.CLOSE,
                title = "Close circle",
                icon = PantopusIcon.Users,
                line = "The people you're connected with. Newest first.",
            ) { onPick(ReinventedPulseViewModel.CLOSE, shownMiles) }
            CircleChoices(reach, circleId, ui, onPickCircle, onOpen = { page = DialPage.Circles })
            DialOption(
                key = ReinventedPulseViewModel.AROUND,
                on = reach == ReinventedPulseViewModel.AROUND,
                title = "Around me",
                icon = PantopusIcon.MapPin,
                line = "Within $shownMiles ${if (shownMiles == 1) "mile" else "miles"} of you. Nearest first.",
            ) { onPick(ReinventedPulseViewModel.AROUND, shownMiles) }
            Slider(
                value = picked,
                onValueChange = { picked = it },
                onValueChangeFinished = { onPick(ReinventedPulseViewModel.AROUND, picked.roundToInt()) },
                valueRange = 1f..MAX_MILES,
                steps = (MAX_MILES - 2).toInt(),
                colors = SliderDefaults.colors(thumbColor = PantopusColors.primary600, activeTrackColor = PantopusColors.primary600),
                modifier =
                    Modifier
                        .padding(horizontal = Spacing.s2)
                        .semantics {
                            contentDescription = "Miles around you"
                            stateDescription = "$shownMiles miles"
                        }.testTag("reinventedPulse.dial.miles"),
            )
            DialOption(
                key = ReinventedPulseViewModel.EXPLORE,
                on = reach == ReinventedPulseViewModel.EXPLORE,
                title = "Explore",
                icon = PantopusIcon.Globe,
                line = "Anywhere else, only what its author chose to show. Ten picked by people today, then the newest.",
            ) { onPick(ReinventedPulseViewModel.EXPLORE, shownMiles) }
            Rules()
        }
    }
}

/** "No hidden ranking." and the page anyone can read that says Explore's rules (the web's `/about/explore`). */
@Composable
private fun Rules() {
    val context = LocalContext.current
    Row(
        modifier = Modifier.padding(top = Spacing.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text("No hidden ranking.", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
        Text(
            text = "See the rules",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.primary600,
            modifier =
                Modifier
                    .clickable(role = Role.Button) {
                        val url = BuildConfig.PANTOPUS_WEB_BASE_URL.trimEnd('/') + "/about/explore"
                        try {
                            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url))
                        } catch (_: ActivityNotFoundException) {
                            // No browser on this phone: the line stays.
                        }
                    }.testTag("reinventedPulse.dial.rules"),
        )
    }
}

@Composable
@Suppress("LongParameterList") // One option: its key, whether it is chosen, its words and icon, and the choice.
private fun DialOption(
    key: String,
    on: Boolean,
    title: String,
    icon: PantopusIcon,
    line: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (on) PantopusColors.primary50 else PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .selectable(selected = on, role = Role.RadioButton, onClick = onClick)
                .padding(Spacing.s3)
                .testTag("reinventedPulse.dial.$key"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier =
                Modifier.size(
                    40.dp,
                ).clip(CircleShape).background(if (on) PantopusColors.primary600 else PantopusColors.appSurfaceRaised),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(
                icon = icon,
                contentDescription = null,
                size = 20.dp,
                strokeWidth = 2.2f,
                tint = if (on) Color.White else PantopusColors.primary600,
            )
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)
            Text(line, fontSize = 13.5.sp, color = PantopusColors.appTextSecondary)
        }
        if (on) {
            PantopusIconImage(
                icon = PantopusIcon.Check,
                contentDescription = null,
                size = 18.dp,
                strokeWidth = 2.4f,
                tint = PantopusColors.primary600,
            )
        }
    }
}

private const val MAX_MILES = 25f

/** The circles' pages, by [page]. */
@Composable
private fun CirclesPages(
    page: DialPage,
    ui: ReinventedCirclesUi,
    model: ReinventedCirclesViewModel,
    onPage: (DialPage) -> Unit,
    onLeave: () -> Unit,
) {
    val links = LocalUriHandler.current
    // A magazine item: the dial closes, and the Moment or post opens by its link, as its reader may open it.
    val onOpen = { item: ReinventedMagazineItemDto ->
        onLeave()
        runCatching { links.openUri("pantopus://${if (item.type == "post") "posts" else "moments"}/${item.id}") }
        Unit
    }
    val id = (page as? DialPage.Circle)?.id ?: (page as? DialPage.Invite)?.id
    val circle = (ui.circles + ui.invites).firstOrNull { it.id == id }
    when {
        page is DialPage.Magazine -> MagazinePage(page.id, ui, model, onPage, onOpen)
        page is DialPage.NewCircle -> NewCirclePage(ui, model, onPage)
        page is DialPage.Circle && circle != null -> CirclePage(circle, ui, model, onPage)
        page is DialPage.Invite && circle != null -> CircleInvitePage(circle, ui, model, onPage)
        // The list, and a circle the person is no longer in.
        page != DialPage.Main -> CirclesListPage(ui, onPage)
    }
}

/** Under Close circle: each of the person's circles (only its people who are in), and "Your circles". */
@Composable
private fun CircleChoices(
    reach: String,
    circleId: String?,
    ui: ReinventedCirclesUi,
    onPickCircle: (String, String) -> Unit,
    onOpen: () -> Unit,
) {
    if (!ui.read) return
    Column(modifier = Modifier.padding(start = 52.dp), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        ui.circles.forEach { circle ->
            val on = reach == ReinventedPulseViewModel.CLOSE && circleId == circle.id
            Text(
                text = if (on) "✓ ${circle.name}" else circle.name,
                fontSize = 15.sp,
                fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                color = PantopusColors.appText,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .selectable(selected = on, role = Role.RadioButton) { onPickCircle(circle.id, circle.name) }
                        .padding(vertical = 6.dp)
                        .testTag("reinventedPulse.dial.circle.${circle.id}"),
            )
        }
        val fresh = ui.fresh
        Text(
            text =
                when {
                    ui.circles.isEmpty() && ui.invites.isEmpty() -> "Make a circle of 2 to 8 close people"
                    fresh > 0 -> "Your circles · $fresh new"
                    else -> "Your circles"
                },
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.primary600,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button, onClick = onOpen)
                    .padding(vertical = 6.dp)
                    .testTag("reinventedPulse.dial.circles"),
        )
    }
}
