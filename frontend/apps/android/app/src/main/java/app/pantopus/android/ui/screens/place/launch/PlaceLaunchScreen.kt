package app.pantopus.android.ui.screens.place.launch

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.BuildConfig
import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.core.routing.PlacePendingStore
import app.pantopus.android.data.api.models.place.BallotGovernments
import app.pantopus.android.data.api.models.place.MoneyLeadKind
import app.pantopus.android.data.api.models.place.PlaceBand
import app.pantopus.android.data.api.models.place.PlaceGroup
import app.pantopus.android.data.api.models.place.PlaceMoneyLead
import app.pantopus.android.data.api.models.place.PlacePreview
import app.pantopus.android.data.api.models.place.PlacePreviewAha
import app.pantopus.android.data.api.models.place.PlacePreviewAhaTone
import app.pantopus.android.data.api.models.place.PlacePreviewFree
import app.pantopus.android.data.api.models.place.PlacePreviewGlanceRow
import app.pantopus.android.data.api.models.place.PlacePreviewLockedSection
import app.pantopus.android.data.api.models.place.PlacePreviewPlaceRef
import app.pantopus.android.data.api.models.place.PlacePreviewSectionStatus
import app.pantopus.android.data.api.models.place.PlaceSectionEnvelope
import app.pantopus.android.data.api.models.place.PlaceSectionId
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.firstTapClosesKeyboard
import app.pantopus.android.ui.components.keepsKeyboard
import app.pantopus.android.ui.screens.ballot.BallotGovernmentsSheet
import app.pantopus.android.ui.screens.ballot.BallotPlacement
import app.pantopus.android.ui.screens.ballot.BallotSeasonBlock
import app.pantopus.android.ui.screens.homes.record.HomeRecordEntry
import app.pantopus.android.ui.screens.homes.record.HomeRecordOverLookup
import app.pantopus.android.ui.screens.place.PlaceDetailGroup
import app.pantopus.android.ui.screens.place.PlaceRootBar
import app.pantopus.android.ui.screens.place.PlaceSectionView
import app.pantopus.android.ui.screens.place.components.PlaceChip
import app.pantopus.android.ui.screens.place.components.PlaceChipModel
import app.pantopus.android.ui.screens.place.components.PlaceChipTone
import app.pantopus.android.ui.screens.place.components.PlaceDensityCard
import app.pantopus.android.ui.screens.place.components.PlaceGroupLabel
import app.pantopus.android.ui.screens.place.components.PlaceLockedCard
import app.pantopus.android.ui.screens.place.components.PlaceSectionCard
import app.pantopus.android.ui.screens.place.components.PlaceSectionCardState
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.theme.MarkVariant
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusLockup
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.launch

@Composable
fun PlaceLaunchScreen(
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    viewModel: PlaceLaunchViewModel = hiltViewModel(),
    onSavePreview: (() -> Unit)? = null,
    embedded: PlaceLaunchEmbedding? = null,
    /** Signed in: Add Home at an address, for the home record's "Verify you own this home". Signed out it's sign-up. */
    onSetUpHome: ((String) -> Unit)? = null,
) {
    val step by viewModel.step.collectAsStateWithLifecycle()
    val retrying by viewModel.loadingPreview.collectAsStateWithLifecycle()
    val browse = {
        if (embedded != null) {
            // The tab's root has nothing under it: back to the address field.
            viewModel.backToHero()
        } else if (onSavePreview != null) {
            onSignIn()
        } else {
            PlacePendingStore.clear()
            // Launch cut #1 (Beacon): with Beacon updates hidden, sign-up lands on the app's own start.
            if (LaunchFeatures.beacon) {
                app.pantopus.android.core.routing.DeepLinkRouter.handle(Uri.parse("pantopus://beacons"))
            }
            onCreateAccount()
        }
    }
    val continuePreview = {
        if (onSavePreview != null) {
            if (viewModel.prepareForSave()) onSavePreview()
        } else if (viewModel.prepareForAuth()) {
            onCreateAccount()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(PantopusColors.appBg)) {
        when (val current = step) {
            LaunchStep.Hero -> Hero(viewModel, onSignIn, browse, signedInEntry = onSavePreview != null, embedded = embedded)
            is LaunchStep.Preview ->
                Box(modifier = Modifier.statusBarsPaddingIf(embedded == null)) {
                    // Signed out, the record's "Sign in" keeps the address as the lookup's own Sign in does.
                    val signIn = { if (viewModel.prepareForAuth()) onSignIn() }
                    WithHomeRecord(current.address, HomeRecordLinks(onSetUpHome, continuePreview, signIn)) { openRecord ->
                        PreviewBody(
                            current.preview,
                            {
                                // Embedded, Cancel returns to the address field (there is nothing under it).
                                if (embedded != null) {
                                    viewModel.backToHero()
                                } else if (onSavePreview != null || viewModel.prepareForAuth()) {
                                    onSignIn()
                                }
                            },
                            continuePreview,
                            onBack = viewModel::backToHero,
                            onRetry = viewModel::retryPreview,
                            retrying = retrying,
                            signedInEntry = onSavePreview != null,
                            onOpenRecord = openRecord,
                        )
                    }
                }
            is LaunchStep.Region ->
                Box(modifier = Modifier.statusBarsPaddingIf(embedded == null)) {
                    // Embedded there is nothing to go back to: the button looks up another address.
                    RegionBody(
                        current.message,
                        browse,
                        onBack = viewModel::backToHero,
                        signedInEntry = onSavePreview != null,
                        primaryTitle = if (embedded != null) "Look up another address" else null,
                    )
                }
        }
    }
}

/**
 * Where the record's app links go from a lookup, which has no Home yet. [onSetUpHome] is Add Home at an address (signed
 * in only); [continuePreview] is the lookup's own Continue: sign-up that keeps the address when signed out, saving the
 * address when signed in; [signIn] is the lookup's own Sign in.
 */
private class HomeRecordLinks(
    val onSetUpHome: ((String) -> Unit)?,
    val continuePreview: () -> Unit,
    val signIn: () -> Unit,
)

/**
 * The lookup result, or the home record page over it once "See this home's full record" is tapped (Back closes it).
 * The record's id-less claim and verify links add this address (signed in) or take the lookup's sign-up (signed out);
 * a buyer's "Save this home" saves it as the lookup's Continue does.
 */
@Composable
private fun WithHomeRecord(
    address: String,
    links: HomeRecordLinks,
    result: @Composable (openRecord: () -> Unit) -> Unit,
) {
    var recordOpen by rememberSaveable(address) { mutableStateOf(false) }
    if (!recordOpen) {
        result { recordOpen = true }
        return
    }
    HomeRecordOverLookup(
        address = address,
        onClose = { recordOpen = false },
        onAppLink = { path ->
            when (path.removePrefix("/app").substringBefore('?')) {
                "/homes/claim-owner", "/homes/verify-address" -> links.onSetUpHome?.invoke(address) ?: links.continuePreview()
                "/auth/sign-up", "/saved-places/add" -> links.continuePreview()
                "/auth/sign-in" -> links.signIn()
                else -> app.pantopus.android.core.routing.DeepLinkRouter.handle(path)
            }
        },
    )
}

/** The signed-out screens pad the status bar themselves; embedded in the signed-in tabs, the tabs' Scaffold does it. */
private fun Modifier.statusBarsPaddingIf(pad: Boolean): Modifier = if (pad) statusBarsPadding() else this

@Composable
@Suppress("LongMethod")
private fun Hero(
    viewModel: PlaceLaunchViewModel,
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    signedInEntry: Boolean,
    embedded: PlaceLaunchEmbedding?,
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val suggestions by viewModel.suggestions.collectAsStateWithLifecycle()
    val loading by viewModel.loadingPreview.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    // Signed-out root: nothing above us pads the status bar, so do it here. Embedded, the tab's Scaffold does.
    Column(modifier = Modifier.fillMaxSize().statusBarsPaddingIf(embedded == null)) {
        if (embedded != null) {
            PlaceRootBar(embedded.unreadCount, embedded.onOpenNotifications, embedded.onOpenMenu)
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PantopusLockup(size = 22.dp, variant = MarkVariant.Light)
                // Demoted to the top bar so the address field is the first control.
                // Takes the space up to "Sign in" and gives way at large text sizes, so "Sign in" stays on one line.
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = 10.dp).weight(1f),
                ) {
                    Text("🇺🇸", fontSize = 11.sp)
                    Text(
                        "United States",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = PantopusColors.appTextMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    if (signedInEntry) "Cancel" else "Sign in",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.primary600,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.padding(start = 8.dp).clickable(onClick = onSignIn),
                )
            }
        }

        // One job: get a stranger from a postcard to type their address. The
        // field is the hero, the proof line answers the privacy objection,
        // the example card shows what comes back. Scrolls only when it must.
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier =
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp)
                    .padding(top = if (embedded == null) 32.dp else Spacing.s2, bottom = 24.dp),
        ) {
            Text(
                "Know what matters for your home, and stay on top of it.",
                fontSize = 31.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.87).sp,
                lineHeight = 37.sp,
                color = PantopusColors.appText,
            )
            Text(
                when {
                    // The Place tab's first-run root says what an address shows, as the front door does (TABCARD §4b).
                    embedded != null ->
                        "Your flood risk, today's air, home values and taxes where you live, and the verified homes near you."
                    signedInEntry -> "Look up an address, preview its public information, and choose whether to save it privately."
                    else ->
                        "Your flood risk, today's air, home values and taxes where you live, and the verified homes near you. " +
                            "Free, no account."
                },
                fontSize = 15.sp,
                lineHeight = 21.sp,
                color = PantopusColors.appTextSecondary,
            )

            error?.let {
                Text(it, color = PantopusColors.appTextSecondary, modifier = Modifier.testTag("place.launch.error"))
                TextButton(onClick = viewModel::retryPreview, modifier = Modifier.testTag("place.launch.retry")) { Text("Try again") }
            }
            AddressField(
                query = query,
                onChange = viewModel::onQueryChange,
                onClear = { viewModel.onQueryChange("") },
                focus = embedded?.addressFocus,
            )

            if (query.isNotBlank() && suggestions.isNotEmpty()) {
                // While typing the address, the first tap on a suggestion only puts the keyboard away.
                Column(
                    modifier =
                        Modifier.fillMaxWidth().firstTapClosesKeyboard().clip(
                            RoundedCornerShape(14.dp),
                        ).background(PantopusColors.appSurface).border(1.dp, PantopusColors.appBorder, RoundedCornerShape(14.dp)),
                ) {
                    suggestions.forEach { s ->
                        Row(
                            modifier =
                                Modifier.fillMaxWidth().clickable {
                                    viewModel.select(s)
                                }.padding(
                                    horizontal = 14.dp,
                                    vertical = 11.dp,
                                ),
                            horizontalArrangement = Arrangement.spacedBy(11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            PantopusIconImage(PantopusIcon.MapPin, null, size = 16.dp, strokeWidth = 2f, tint = PantopusColors.appTextMuted)
                            Column {
                                Text(s.primaryText, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
                                s.secondaryText?.let { Text(it, fontSize = 12.5.sp, color = PantopusColors.appTextMuted) }
                            }
                        }
                    }
                }
            } else {
                PrimaryButton(title = "See your place", isLoading = loading, isEnabled = query.isNotBlank(), onClick = {
                    viewModel.loadPreview(query)
                }, modifier = Modifier.fillMaxWidth())
                if (signedInEntry) {
                    Text("Only you will see this.", fontSize = 13.sp, color = PantopusColors.appTextSecondary)
                } else {
                    PrivacyProof()
                }
                if (embedded != null) {
                    // A city kept on this phone: its Sun card in place of the example, once its Today comes (TABCARD §4b).
                    PlaceAreaSunCard(modifier = Modifier.padding(top = 8.dp)) { ExampleCard(modifier = Modifier.padding(top = 8.dp)) }
                } else {
                    ExampleCard(modifier = Modifier.padding(top = 8.dp))
                }
                // The tab's root has no saved places behind it to go back to (iOS shows no such link either).
                if (embedded == null) {
                    Text(
                        if (signedInEntry) "Back to saved places" else "Just here to follow someone or browse?",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = PantopusColors.appTextMuted,
                        modifier = Modifier.fillMaxWidth().clickable(onClick = onCreateAccount),
                    )
                }
            }
        }
    }
}

/** The privacy answer where the decision is made: what a neighbor sees, and what they never see. */
@Composable
private fun PrivacyProof() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).testTag("startPrivacyProof"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        PantopusIconImage(
            PantopusIcon.ShieldCheck,
            null,
            size = 15.dp,
            strokeWidth = 2.1f,
            tint = PantopusColors.home,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(
            buildAnnotatedString {
                append("Others see a first name and a street. ")
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)) {
                    append("Never your house number.")
                }
            },
            fontSize = 13.sp,
            lineHeight = 19.sp,
            color = PantopusColors.appTextSecondary,
        )
    }
}

private data class ExampleReading(val icon: PantopusIcon, val label: String, val value: String, val tone: ExampleTone)

private enum class ExampleTone { GOOD, WATCH, NEUTRAL }

private val exampleReadings =
    listOf(
        ExampleReading(PantopusIcon.Wind, "Air today", "Good · AQI 24", ExampleTone.GOOD),
        ExampleReading(PantopusIcon.Waves, "Flood zone", "X · minimal", ExampleTone.GOOD),
        ExampleReading(PantopusIcon.TestTube, "Radon", "Zone 1 · test it", ExampleTone.WATCH),
        ExampleReading(PantopusIcon.Trash2, "Next pickup", "Tue · garbage + recycling", ExampleTone.NEUTRAL),
    )

/**
 * A glimpse of the answer in the dashboard's own row grammar. Static and
 * labeled as an example; nothing here pretends to be the reader's.
 */
@Composable
private fun ExampleCard(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().placeCard().testTag("startExampleCard")) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("EXAMPLE", fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.9.sp, color = PantopusColors.appTextMuted)
        }
        exampleReadings.forEachIndexed { index, reading ->
            if (index > 0) HorizontalDivider(color = PantopusColors.appBorderSubtle, modifier = Modifier.padding(start = 60.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.appBg),
                    contentAlignment = Alignment.Center,
                ) {
                    PantopusIconImage(reading.icon, null, size = 16.dp, strokeWidth = 2f, tint = PantopusColors.appTextSecondary)
                }
                Text(
                    reading.label,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    val dot =
                        when (reading.tone) {
                            ExampleTone.GOOD -> PantopusColors.home
                            ExampleTone.WATCH -> PantopusColors.warning
                            ExampleTone.NEUTRAL -> PantopusColors.appTextMuted
                        }
                    Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(dot))
                    Text(reading.value, fontSize = 13.5.sp, color = PantopusColors.appTextSecondary)
                }
            }
        }
        Text(
            "Yours takes about three seconds and stays on this screen until you save it.",
            fontSize = 12.sp,
            lineHeight = 17.sp,
            color = PantopusColors.appTextMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 14.dp),
        )
    }
}

@Composable
private fun AddressField(
    query: String,
    onChange: (String) -> Unit,
    onClear: () -> Unit,
    focus: FocusRequester? = null,
) {
    Row(
        modifier =
            Modifier.keepsKeyboard().fillMaxWidth().clip(
                RoundedCornerShape(14.dp),
            ).background(
                PantopusColors.appSurface,
            ).border(1.dp, PantopusColors.appBorder, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PantopusIconImage(PantopusIcon.MapPin, null, size = 18.dp, strokeWidth = 2f, tint = PantopusColors.appTextMuted)
        Box(modifier = Modifier.weight(1f)) {
            BasicTextField(
                value = query,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 16.sp, color = PantopusColors.appText),
                modifier = Modifier.fillMaxWidth().then(if (focus != null) Modifier.focusRequester(focus) else Modifier),
                // The placeholder sits inside the field, so a screen reader reads it as the field's name.
                decorationBox = { inner ->
                    if (query.isEmpty()) {
                        Text("Type your home address", fontSize = 16.sp, color = PantopusColors.appTextMuted)
                    }
                    inner()
                },
            )
        }
        if (query.isNotEmpty()) {
            PantopusIconImage(
                PantopusIcon.X,
                "Clear",
                size = 16.dp,
                strokeWidth = 2f,
                tint = PantopusColors.appTextMuted,
                modifier = Modifier.clickable(onClick = onClear),
            )
        }
    }
}

@Composable
@Suppress("LongMethod", "LongParameterList")
private fun PreviewBody(
    preview: PlacePreview,
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    retrying: Boolean,
    signedInEntry: Boolean,
    onOpenRecord: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier.size(34.dp).clip(CircleShape).background(PantopusColors.appSurface).clickable(onClick = onBack),
                    contentAlignment = Alignment.Center,
                ) {
                    PantopusIconImage(
                        PantopusIcon.ChevronLeft,
                        "Back",
                        size = 20.dp,
                        strokeWidth = 2.5f,
                        tint = PantopusColors.appTextStrong,
                    )
                }
                Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
                    Text(
                        "Your Place",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.4).sp,
                        color = PantopusColors.appText,
                    )
                    preview.place?.address?.let {
                        Text(
                            it,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = PantopusColors.appTextMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Text(
                    if (signedInEntry) "Cancel" else "Sign in",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.primary600,
                    modifier = Modifier.clickable(onClick = onSignIn),
                )
            }
            val scroll = rememberScrollState()
            val jumps = rememberPreviewJumps(scroll)
            Column(modifier = Modifier.fillMaxSize().then(jumps.viewport()).verticalScroll(scroll)) {
                // On a tablet or an unfolded phone the page keeps a readable column in the middle.
                Column(
                    modifier =
                        Modifier
                            .align(Alignment.CenterHorizontally)
                            .widthIn(max = PREVIEW_MAX_WIDTH)
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                ) {
                    // The order is the server's (LOOKUPORDER): the stand-out card first, the record button under
                    // the glance and the money card, the closed group near the end.
                    PlacePreviewFindings(
                        preview,
                        onFollowUp = onCreateAccount,
                        onRetry = onRetry,
                        retrying = retrying,
                        jumps = jumps,
                        onOpenRecord = onOpenRecord,
                        onUnlock = onCreateAccount,
                    )
                    // Room for the bar over the page's end, which grows with the text size.
                    Spacer(modifier = Modifier.height(FOOTER_ROOM))
                }
            }
        }
        PreviewSaveFooter(
            place = preview.place,
            onContinue = onCreateAccount,
            signedInEntry = signedInEntry,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun PreviewSaveFooter(
    place: PlacePreviewPlaceRef?,
    onContinue: () -> Unit,
    signedInEntry: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(PantopusColors.appSurface)
                .wrapContentWidth(Alignment.CenterHorizontally)
                .widthIn(max = PREVIEW_MAX_WIDTH)
                .padding(horizontal = 16.dp)
                .padding(top = 14.dp, bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // What saving gives (LOOKUPORDER words): the page kept in the app and fresh each day.
        Text(
            "Save this address. It opens fresh every day.",
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appText,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        PrimaryButton(
            title = if (signedInEntry) "Continue" else "Save it, free",
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth().testTag("place.preview.continue"),
        )
        Text(
            if (signedInEntry) {
                "Saving a place does not create or verify a Home."
            } else {
                "Your preview stays on this device for up to 24 hours while you sign in."
            },
            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
            color = PantopusColors.appTextMuted,
        )
        place?.let { ShareAddressLink(it) }
    }
}

/**
 * The share card (Wedge v2 D5): the link is the preview of THIS address on
 * the web, whose OG image is rendered on the fly by `/api/og/place` —
 * nothing is stored. The system share sheet does the rest.
 */
@Composable
private fun ShareAddressLink(place: PlacePreviewPlaceRef) {
    val context = LocalContext.current
    val address = listOfNotNull(place.address, place.city, place.state, place.zipcode).filter { it.isNotBlank() }.joinToString(", ")
    if (address.isBlank()) return
    Row(
        modifier =
            Modifier
                .clickable {
                    val url = BuildConfig.PANTOPUS_WEB_BASE_URL.trimEnd('/') + "/start?address=" + Uri.encode(address)
                    val send =
                        Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "What's true about this address")
                            putExtra(Intent.EXTRA_TEXT, url)
                        }
                    context.startActivity(Intent.createChooser(send, "Share this address"))
                }
                .padding(vertical = 4.dp)
                .testTag("place.preview.share"),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PantopusIconImage(PantopusIcon.Share, null, size = 14.dp, strokeWidth = 2f, tint = PantopusColors.primary600)
        Text("Share this address", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.primary600)
    }
}

/**
 * The preview's lead figure (Wave 4). Present only when the backend
 * had a real benchmark — a census-tract NFIP premium band or a county
 * HUD fair-market rent — and it carries the scope it is true at so the
 * reader is not sold a county estimate as their own bill.
 */
@Composable
private fun MoneyLeadCard(
    lead: PlaceMoneyLead,
    modifier: Modifier = Modifier,
    testTag: String = "place.preview.moneyLead",
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .placeCard()
                .padding(Spacing.s4)
                .padding(top = 14.dp)
                .testTag(testTag),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.homeBg),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.DollarSign, null, size = 19.dp, strokeWidth = 2f, tint = PantopusColors.home)
            }
            Text(
                lead.headline,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 20.sp,
                color = PantopusColors.appText,
            )
        }
        // Guarded, the way iOS already guards them: an empty string here
        // rendered a bare gap where a disclosure belongs.
        if (lead.detail.isNotEmpty()) {
            Text(lead.detail, fontSize = 13.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)
        }
        // The scope disclosure, rendered STRUCTURALLY rather than trusted
        // to prose. Every `kind` the server emits today also puts the
        // scope in `detail`, so this is belt-and-braces — but a dollar
        // figure is the most believable thing on the page and the easiest
        // to read as being about THIS home, and the day a lead ships whose
        // `detail` omits it the figure would stand alone. Web has shown
        // this since Wave 4; both native clients decoded it and rendered
        // neither.
        val footer = scopeFooter(lead)
        if (footer.isNotEmpty()) {
            Text(
                footer,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Medium,
                color = PantopusColors.appTextMuted,
                modifier = Modifier.testTag("place.preview.moneyLead.scope"),
            )
        }
    }
}

/**
 * "FEMA · OpenFEMA NFIP policies · census tract-level, not this home"
 *
 * Mirrors the web footer and the iOS one. Either half may be absent, so
 * the parts are joined rather than formatted into a fixed template — an
 * empty source must not leave a leading separator.
 */
private fun scopeFooter(lead: PlaceMoneyLead): String =
    listOfNotNull(
        lead.source.takeIf { it.isNotEmpty() },
        lead.scope.takeIf { it.isNotEmpty() }?.let { "$it-level, not this home" },
    ).joinToString(" · ")

@Composable
private fun LockedPreviewCard(
    section: PlacePreviewLockedSection,
    onCreateAccount: () -> Unit,
) {
    val icon =
        when (section.groupId) {
            PlaceGroup.TODAY -> PantopusIcon.CloudSun
            PlaceGroup.YOUR_HOME -> PantopusIcon.Home
            PlaceGroup.HEALTH_ENVIRONMENT -> PantopusIcon.Droplets
            PlaceGroup.MONEY_SIGNALS -> PantopusIcon.Zap
            PlaceGroup.CIVIC -> PantopusIcon.Landmark
            PlaceGroup.RISK_READINESS -> PantopusIcon.Waves
            else -> PantopusIcon.MapPin
        }
    PlaceLockedCard(
        title = section.title,
        reason = section.reason,
        cta = if (section.unlock == app.pantopus.android.data.api.models.place.PlacePreviewUnlock.CLAIM) "Claim home" else "Create account",
        icon = icon,
        onTap = onCreateAccount,
    )
}

@Composable
private fun RegionBody(
    message: String,
    onBrowse: () -> Unit,
    onBack: () -> Unit,
    signedInEntry: Boolean,
    // Replaces the primary button's title (the Place tab's first-run screen).
    primaryTitle: String? = null,
) {
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Box(
                modifier = Modifier.size(34.dp).clip(CircleShape).background(PantopusColors.appSurface).clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.ChevronLeft, "Back", size = 20.dp, strokeWidth = 2.5f, tint = PantopusColors.appTextStrong)
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(modifier = Modifier.size(80.dp).clip(CircleShape).background(PantopusColors.homeBg), contentAlignment = Alignment.Center) {
                PantopusIconImage(PantopusIcon.MapPin, null, size = 34.dp, strokeWidth = 2f, tint = PantopusColors.home)
            }
            Text(
                "Home features are coming to your region.",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier = Modifier.fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            // Launch cut #1 (Beacon): no Beacon fan memberships to mention.
            Text(
                "$message Today, home intelligence reads off U.S. sources — county records, " +
                    "FEMA, the Census. " +
                    if (LaunchFeatures.beacon) {
                        "Following, fanning, and messaging work in your region right now."
                    } else {
                        "Following and messaging work in your region right now."
                    },
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            PrimaryButton(
                title = primaryTitle ?: if (signedInEntry) "Back to saved places" else "Follow people & places",
                onClick = onBrowse,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
    }
}

// ─── Wedge v2 D1: the aha card and the Band-A sections ───────

/** The groups' labels on the lookup. */
private val PREVIEW_GROUP_LABELS =
    mapOf(
        PlaceGroup.TODAY to "Today",
        PlaceGroup.RISK_READINESS to "Risk & readiness",
        PlaceGroup.HEALTH_ENVIRONMENT to "Health & environment",
        PlaceGroup.YOUR_BLOCK to "Your block",
        PlaceGroup.MONEY_SIGNALS to "Money signals",
        PlaceGroup.CIVIC to "Civic",
        PlaceGroup.YOUR_HOME to "Your home",
    )

/** Headline, grade, detail and follow-up are the server's words, rendered whole. */
@Composable
private fun AhaCard(
    aha: PlacePreviewAha,
    onFollowUp: () -> Unit,
) {
    val tone =
        when (aha.toneEnum) {
            PlacePreviewAhaTone.ALERT -> PlaceChipTone.ERROR
            PlacePreviewAhaTone.WATCH -> PlaceChipTone.WARNING
            PlacePreviewAhaTone.INFO -> PlaceChipTone.SKY
            PlacePreviewAhaTone.CALM -> PlaceChipTone.SUCCESS
        }
    val icon =
        when (aha.toneEnum) {
            PlacePreviewAhaTone.ALERT, PlacePreviewAhaTone.WATCH -> PantopusIcon.Flame
            PlacePreviewAhaTone.INFO -> PantopusIcon.MapPin
            PlacePreviewAhaTone.CALM -> PantopusIcon.Sparkles
        }
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp).placeCard().padding(16.dp).testTag("place.preview.aha"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.homeBg),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(icon, null, size = 19.dp, strokeWidth = 2f, tint = PantopusColors.home)
            }
            PlaceChip(PlaceChipModel(tone, aha.grade.ifEmpty { "What stands out" }))
        }
        Text(aha.headline, fontSize = 17.sp, fontWeight = FontWeight.Bold, lineHeight = 23.sp, color = PantopusColors.appText)
        if (aha.detail.isNotEmpty()) {
            Text(aha.detail, fontSize = 13.5.sp, lineHeight = 19.sp, color = PantopusColors.appTextSecondary)
        }
        if (aha.followUp.isNotEmpty()) {
            Row(
                modifier = Modifier.clickable(onClick = onFollowUp).testTag("place.preview.aha.followUp"),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(aha.followUp, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.primary600)
                PantopusIconImage(PantopusIcon.ChevronRight, null, size = 14.dp, strokeWidth = 2.25f, tint = PantopusColors.primary600)
            }
        }
    }
}

/**
 * The built-in order of the lookup (LOOKUPORDER 1.1), for a server that sends no `layout`. The same list the server
 * sends today.
 */
private val BUILT_IN_ORDER =
    listOf(
        "aha",
        "glance",
        "money",
        "record",
        "ask",
        "group:risk_readiness",
        "group:health_environment",
        "section:census_context",
        "group:today",
        "group:money_signals",
        "group:civic",
        "section:block_density",
        "locked",
        "not_checked",
        "privacy",
    )

/** The lookup's readable column on a tablet or an unfolded phone. */
private val PREVIEW_MAX_WIDTH = 680.dp

/** Room under the page's last block for the save bar drawn over it. */
private val FOOTER_ROOM = 200.dp

/** How far below the top edge a glance line leaves its card. */
private const val JUMP_MARGIN_DP = 12

/**
 * What's public about an address, in the server's order (LOOKUPORDER 1.1): the stand-out card, the glance, the money
 * card, the record button, the groups and the cards named on their own, the closed group and the could-not-check
 * line. A block this app does not know, or one with nothing to draw, is skipped. The launch preview shows it under its
 * address; the Place tab's saved-address root under its next-step card, without the record button or the closed
 * group ([onOpenRecord] and [onUnlock] null there). The aha follow-up and the sections' claim and verify buttons call
 * [onFollowUp]; a glance line takes the page to its card through [jumps].
 */
@Composable
@Suppress("LongMethod", "LongParameterList", "CyclomaticComplexMethod", "NestedBlockDepth")
internal fun PlacePreviewFindings(
    preview: PlacePreview,
    onFollowUp: () -> Unit,
    onRetry: () -> Unit,
    retrying: Boolean,
    modifier: Modifier = Modifier,
    onOpenDetail: ((PlaceDetailGroup) -> Unit)? = null,
    jumps: PreviewJumps? = null,
    onOpenRecord: (() -> Unit)? = null,
    onUnlock: (() -> Unit)? = null,
) {
    val sections = preview.sections.orEmpty()
    // Ballot P0 (ballot_p0): the "Your ballot" block in place of the election card. The server places it: where the
    // order names "ballot", there; otherwise at the top of the Civic group.
    val ballot = BallotPlacement.ballot(sections)
    var ballotGovernments by remember { mutableStateOf<BallotGovernments?>(null) }
    val order = preview.layout?.order?.takeIf { it.isNotEmpty() }?.distinct() ?: BUILT_IN_ORDER
    val namedAlone = order.filter { it.startsWith("section:") }.map { it.removePrefix("section:") }.toSet()
    val ballotPlaced = "ballot" in order
    val money = preview.money?.takeIf { it.isRenderable }
    // The flood cost band is the first card of Risk and readiness (`flood_cost`; an older answer has it only as its
    // dollar card). The dollar card the store apps draw keeps the money slot only when there is no money card.
    val lead = preview.moneyLead?.takeIf { it.isRenderable }
    val floodLead =
        preview.floodCost?.takeIf { it.isRenderable }
            ?: lead?.takeIf { money == null && it.kind == MoneyLeadKind.FLOOD_PREMIUM }
    val slotLead = lead?.takeIf { money == null && it.kind != MoneyLeadKind.FLOOD_PREMIUM }
    val groupItems = { group: PlaceGroup ->
        sections.filter { env ->
            env.groupId == group &&
                env.id !in namedAlone &&
                !(ballot != null && env.sectionId == PlaceSectionId.CIVIC_ELECTION)
        }
    }
    val aloneSection = { id: String ->
        sections.firstOrNull { it.id == id }?.takeIf { !(ballot != null && it.sectionId == PlaceSectionId.CIVIC_ELECTION) }
    }
    // A card named on its own carries its group's label unless that label is already on the page above it.
    val labelledAlone = mutableSetOf<String>()
    run {
        val shown = mutableSetOf<PlaceGroup>()
        order.forEach { block ->
            when {
                block.startsWith("group:") -> {
                    val group = PlaceGroup.from(block.removePrefix("group:"))
                    val draws =
                        groupItems(group).isNotEmpty() ||
                            (group == PlaceGroup.CIVIC && ballot != null && !ballotPlaced) ||
                            (group == PlaceGroup.RISK_READINESS && floodLead != null)
                    if (draws && group in PREVIEW_GROUP_LABELS) shown += group
                }
                block.startsWith("section:") ->
                    aloneSection(block.removePrefix("section:"))?.let { env ->
                        if (env.groupId in PREVIEW_GROUP_LABELS && shown.add(env.groupId)) labelledAlone += env.id
                    }
            }
        }
    }
    val scope = rememberCoroutineScope()
    val margin = with(LocalDensity.current) { JUMP_MARGIN_DP.dp.toPx() }
    val onGlanceTap: ((PlacePreviewGlanceRow) -> Unit)? =
        jumps?.let { j ->
            { row: PlacePreviewGlanceRow ->
                row.sectionId?.let { id -> scope.launch { j.jump(id, margin) } }
                Unit
            }
        }
    val ballotBlock: @Composable (Dp) -> Unit = { top ->
        ballot?.let { placed ->
            BallotSeasonBlock(
                placed = placed,
                onOpenGovernments = placed.card.governments?.let { governments -> { ballotGovernments = governments } },
                modifier = Modifier.padding(top = top).then(jumps?.anchor(PlaceSectionId.CIVIC_ELECTION.raw) ?: Modifier),
            )
        }
    }
    val sectionCard: @Composable (PlaceSectionEnvelope) -> Unit = { env ->
        Box(modifier = jumps?.anchor(env.id) ?: Modifier) {
            PreviewSectionView(env, onFollowUp, onRetry, retrying, onOpenDetail)
        }
    }
    Column(modifier = modifier) {
        if (sections.isEmpty()) {
            // An older server sends only `free`: the three tiles carry the page as before.
            preview.aha?.takeIf { it.isRenderable }?.let { AhaCard(it, onFollowUp) }
            lead?.let { MoneyLeadCard(it) }
            preview.free?.let { LegacyFreeTiles(it) }
        } else {
            order.forEach { block ->
                key<Unit>(block) {
                    when {
                        block == "aha" -> preview.aha?.takeIf { it.isRenderable }?.let { AhaCard(it, onFollowUp) }
                        block == "ballot" -> ballotBlock(18.dp)
                        block == "glance" ->
                            preview.glance?.takeIf { it.isNotEmpty() }?.let { rows ->
                                PreviewGlanceCard(rows = rows, onTap = onGlanceTap, modifier = Modifier.padding(top = 14.dp))
                            }
                        block == "money" ->
                            when {
                                money != null -> PreviewMoneyCard(money, onOpenRecord, Modifier.padding(top = 14.dp))
                                slotLead != null -> MoneyLeadCard(slotLead)
                                else -> Unit
                            }
                        block == "record" ->
                            onOpenRecord?.let {
                                HomeRecordEntry(
                                    title = "See this home’s full record",
                                    line = "A few facts now. The rest is free for its owner.",
                                    onClick = it,
                                    testTag = "place.preview.record",
                                    modifier = Modifier.padding(top = 14.dp),
                                )
                            }
                        block.startsWith("group:") -> {
                            val group = PlaceGroup.from(block.removePrefix("group:"))
                            val label = PREVIEW_GROUP_LABELS[group]
                            val items = groupItems(group)
                            val ballotHere = group == PlaceGroup.CIVIC && ballot != null && !ballotPlaced
                            val leadHere = group == PlaceGroup.RISK_READINESS && floodLead != null
                            val draws = items.isNotEmpty() || ballotHere || leadHere
                            if (label != null && draws) {
                                PlaceGroupLabel(text = label, modifier = Modifier.padding(top = 18.dp))
                                if (leadHere && floodLead != null) {
                                    MoneyLeadCard(floodLead, Modifier.padding(bottom = 8.dp), testTag = "place.preview.floodCost")
                                }
                                if (ballotHere) ballotBlock(4.dp)
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.padding(top = if (ballotHere) 18.dp else 0.dp),
                                ) { items.forEach { sectionCard(it) } }
                            }
                        }
                        block.startsWith("section:") ->
                            aloneSection(block.removePrefix("section:"))?.let { env ->
                                if (env.id in labelledAlone) {
                                    PlaceGroupLabel(
                                        text = PREVIEW_GROUP_LABELS.getValue(env.groupId),
                                        modifier = Modifier.padding(top = 18.dp),
                                    )
                                    sectionCard(env)
                                } else {
                                    Box(modifier = Modifier.padding(top = 14.dp)) { sectionCard(env) }
                                }
                            }
                        block == "locked" ->
                            onUnlock?.let { unlock ->
                                preview.locked?.takeIf { it.isNotEmpty() }?.let { locked ->
                                    PlaceGroupLabel(text = "More with a free account", modifier = Modifier.padding(top = 18.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        locked.forEach { LockedPreviewCard(it, unlock) }
                                    }
                                }
                            }
                        block == "not_checked" ->
                            preview.notChecked?.takeIf { it.isNotEmpty() }?.let {
                                PreviewNotCheckedLine(it, Modifier.padding(top = 18.dp))
                            }
                        // "ask" waits for the reading route; "privacy": the phones draw no privacy lines here.
                        else -> Unit
                    }
                }
            }
        }
    }
    ballotGovernments?.let { governments ->
        BallotGovernmentsSheet(
            governments = governments,
            address = preview.place?.address?.substringBefore(",").orEmpty(),
            onDismiss = { ballotGovernments = null },
        )
    }
}

/** The page an older server carries with `free` alone: flood, density and the homes here. */
@Composable
private fun LegacyFreeTiles(free: PlacePreviewFree) {
    PlaceGroupLabel(text = "Risk & readiness", modifier = Modifier.padding(top = 18.dp))
    PlaceSectionCard(
        title = "Flood",
        icon = PantopusIcon.Waves,
        state =
            if (free.flood.status == PlacePreviewSectionStatus.READY) {
                PlaceSectionCardState.LOADED
            } else {
                PlaceSectionCardState.UNAVAILABLE
            },
        value = free.flood.description ?: free.flood.zone?.let { "Zone $it" },
        chip = free.flood.zone?.let { PlaceChipModel(PlaceChipTone.SUCCESS, free.flood.description ?: "Flood zone") },
    )
    PlaceGroupLabel(text = "Your block", modifier = Modifier.padding(top = 18.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PlaceDensityCard(bucket = free.density.bucket, label = free.density.label, ctaTitle = null, onTap = null)
        if (free.area.status == PlacePreviewSectionStatus.READY) {
            PlaceSectionCard(
                title = "Homes here",
                icon = PantopusIcon.Home,
                state = PlaceSectionCardState.LOADED,
                value = free.area.medianYearBuilt?.let { "Median built $it" } ?: free.area.note,
                caption = free.area.note,
            )
        }
    }
}

@Composable
private fun PreviewSectionView(
    env: PlaceSectionEnvelope,
    onCreateAccount: () -> Unit,
    onRetry: () -> Unit,
    retrying: Boolean,
    onOpenDetail: ((PlaceDetailGroup) -> Unit)?,
) {
    PlaceSectionView(
        env = env,
        onOpen =
            onOpenDetail?.let { open ->
                PlaceDetailGroup.forGroup(env.groupId)
                    ?.takeIf { it.supportsSavedPlace && env.band == PlaceBand.A }
                    ?.let { detail -> { open(detail) } }
            },
        onVerify = onCreateAccount,
        onClaim = onCreateAccount,
        onRetry = onRetry,
        retrying = retrying,
    )
}
