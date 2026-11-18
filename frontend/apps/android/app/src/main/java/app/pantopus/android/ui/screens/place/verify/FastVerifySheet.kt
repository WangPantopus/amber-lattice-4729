package app.pantopus.android.ui.screens.place.verify

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.ui.screens.place.components.PlaceChevron
import app.pantopus.android.ui.screens.place.components.PlaceChip
import app.pantopus.android.ui.screens.place.components.PlaceChipModel
import app.pantopus.android.ui.screens.place.components.PlaceChipTone
import app.pantopus.android.ui.screens.place.components.PlaceTileTone
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.flow.flowOf

/**
 * The server's verify options for [homeId] (FASTVERIFY `GET /api/homes/:id/verify-options`), read again whenever
 * [refreshKey] changes. Null while `home_fast_verify` is off (the route answers 404), before the first answer, from an
 * older server, and in previews and snapshot tests, which have no app graph: the screens are then today's.
 */
@Composable
fun rememberVerifyOptions(
    homeId: String?,
    refreshKey: Any? = Unit,
): HomeVerifyOptions? {
    val context = LocalContext.current
    val repository =
        remember(context) {
            runCatching {
                EntryPointAccessors
                    .fromApplication(context.applicationContext, PlaceVerifySheetDeps::class.java)
                    .homeFastVerifyRepository()
            }.getOrNull()
        }
    val answer by remember(repository, homeId) {
        if (repository == null || homeId == null) flowOf(null) else repository.answer(homeId)
    }.collectAsState(initial = homeId?.let { repository?.cached(it) })
    LaunchedEffect(repository, homeId, refreshKey) {
        if (repository != null && homeId != null) repository.refresh(homeId)
    }
    return answer
}

/** One way to verify on the sheet: the server's id, the flow it opens and its words (SPEC section 6). */
private data class FastVerifyRow(
    val id: String,
    val icon: PantopusIcon,
    val label: String,
    val sub: String,
    val tone: PlaceTileTone,
)

private val FASTEST_ROWS =
    listOf(
        FastVerifyRow(
            "phone",
            PantopusIcon.Smartphone,
            "Use my phone number",
            "We text a code, then match the number to this address.",
            PlaceTileTone.SKY,
        ),
        FastVerifyRow(
            "location",
            PantopusIcon.MapPin,
            "I'm at home now",
            "One tap. We check your phone's location once.",
            PlaceTileTone.SKY,
        ),
        FastVerifyRow(
            "document",
            PantopusIcon.Camera,
            "Take a photo of a bill",
            "A utility bill or lease with your name and this address.",
            PlaceTileTone.SKY,
        ),
    )

private val MAIL_ROW =
    FastVerifyRow("mail", PantopusIcon.Mail, "Mail me a code", "A postcard to this home. It arrives in about a week.", PlaceTileTone.MUTED)

/** A document a person reviews (no read at once) keeps today's words. */
private val TODAY_DOCUMENT_ROW =
    FastVerifyRow(
        "document",
        PlaceVerifyMethod.DOCUMENT.icon,
        PlaceVerifyMethod.DOCUMENT.label,
        PlaceVerifyMethod.DOCUMENT.sub,
        PlaceTileTone.MUTED,
    )

/** The landlord keeps today's words. */
private val LANDLORD_ROW =
    FastVerifyRow(
        "landlord",
        PlaceVerifyMethod.LANDLORD.icon,
        PlaceVerifyMethod.LANDLORD.label,
        PlaceVerifyMethod.LANDLORD.sub,
        PlaceTileTone.MUTED,
    )

/**
 * Drawing 3, "Verify you live here": today's sheet with the ways the server offers now, fastest first, each opening
 * its flow at a tap (no second chooser). Only offered ways this build can open are drawn, in the server's order:
 * phone, location, document, mail, landlord. A document already in review keeps today's row.
 */
@Composable
@Suppress("LongMethod", "LongParameterList", "CyclomaticComplexMethod")
internal fun FastVerifySheetContent(
    address: String,
    options: HomeVerifyOptions,
    documentInReview: Boolean,
    onStart: (PlaceVerifyMethod) -> Unit,
    onDismiss: () -> Unit,
    onOpenDocumentStatus: (() -> Unit)?,
) {
    val inReview = documentInReview || options.option("document")?.reason == "IN_REVIEW"
    val opens = { row: FastVerifyRow -> PlaceVerifyMethod.fromOption(row.id)?.takeIf { options.available(row.id) != null } }
    // The bill row is a fast check only when the server reads the photo at once; otherwise the document keeps today's row.
    val documentRead = options.option("document")?.fast != false
    val fastest =
        FASTEST_ROWS.filter { row ->
            if (row.id == "document") documentRead && (inReview || opens(row) != null) else opens(row) != null
        }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 4.dp)
                .testTag("place.verifySheet.fast"),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(bottom = 14.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(PantopusColors.homeBg)
                        .border(1.dp, PantopusColors.successLight, RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.ShieldCheck, null, size = 20.dp, strokeWidth = 2f, tint = PantopusColors.home)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "Verify you live here",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.36).sp,
                    color = PantopusColors.appText,
                )
                Text(address, fontSize = 13.sp, color = PantopusColors.appTextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(
                modifier =
                    Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(PantopusColors.appSurfaceSunken)
                        .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.X, "Close", size = 16.dp, strokeWidth = 2.5f, tint = PantopusColors.appTextSecondary)
            }
        }
        if (options.level == HomeVerifyOptions.LEVEL_ADDED) {
            Box(modifier = Modifier.padding(bottom = 10.dp)) { PlaceChip(PlaceChipModel(PlaceChipTone.SUCCESS, "Home added")) }
        }
        // "Under a minute" only while a check that verifies at once is on offer (mail alone takes a week).
        if (fastest.isNotEmpty()) {
            Text(
                "It takes under a minute. Then you can message homes near you, and your home gets the Verified mark.",
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(bottom = 18.dp),
            )
        }

        if (fastest.isNotEmpty()) {
            VerifyOverline("Fastest")
            Column(modifier = Modifier.fillMaxWidth().placeCard()) {
                fastest.forEachIndexed { i, row ->
                    if (row.id == "document" && inReview) {
                        DocumentReviewRow(onOpenDocumentStatus)
                    } else {
                        opens(row)?.let { method -> FastRow(row) { onStart(method) } }
                    }
                    if (i < fastest.lastIndex) VerifyDivider()
                }
            }
            Spacer(modifier = Modifier.height(18.dp))
        }
        opens(MAIL_ROW)?.let { method ->
            VerifyOverline("Or by mail")
            Column(modifier = Modifier.fillMaxWidth().placeCard()) { FastRow(MAIL_ROW) { onStart(method) } }
            Spacer(modifier = Modifier.height(12.dp))
        }
        val todayDocument = opens(TODAY_DOCUMENT_ROW)
        if (!documentRead && (inReview || todayDocument != null)) {
            Column(modifier = Modifier.fillMaxWidth().placeCard()) {
                if (inReview) {
                    DocumentReviewRow(onOpenDocumentStatus)
                } else if (todayDocument != null) {
                    FastRow(TODAY_DOCUMENT_ROW) { onStart(todayDocument) }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
        opens(LANDLORD_ROW)?.let { method ->
            Column(modifier = Modifier.fillMaxWidth().placeCard()) { FastRow(LANDLORD_ROW) { onStart(method) } }
            Spacer(modifier = Modifier.height(12.dp))
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Not now",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.primary600,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = onDismiss)
                    .padding(vertical = 13.dp)
                    .testTag("place.verifySheet.notNow"),
        )
        Text(
            "Your home tools work either way.",
            fontSize = 12.5.sp,
            lineHeight = 18.sp,
            color = PantopusColors.appTextMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
private fun FastRow(
    row: FastVerifyRow,
    onClick: () -> Unit,
) {
    Box(modifier = Modifier.clickable(role = Role.Button, onClick = onClick).testTag("place.verifySheet.${row.id}")) {
        VerifyRow(row.icon, row.label, row.sub, row.tone, trailing = { PlaceChevron() }, subLineHeight = 17.sp)
    }
}
