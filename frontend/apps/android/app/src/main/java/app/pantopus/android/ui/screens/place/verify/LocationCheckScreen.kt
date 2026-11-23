package app.pantopus.android.ui.screens.place.verify

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage

/**
 * The location check (FASTVERIFY phase 5, drawing 5): "Are you at home right now?", one reading at "Check my location",
 * then "You're verified" or the miss's words with the other ways. Location uses the app's when-in-use permission.
 */
@Composable
fun LocationCheckScreen(
    onBack: () -> Unit,
    onDone: () -> Unit,
    onOpenMethod: (PlaceVerifyMethod) -> Unit,
    onMailCode: () -> Unit,
    viewModel: LocationCheckViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val address = state.address.ifBlank { "this address" }
    val permission =
        if (LocalActivityResultRegistryOwner.current != null) {
            rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
                if (grants.values.any { it }) viewModel.check() else viewModel.permissionDenied()
            }
        } else {
            null
        }
    val startCheck = {
        if (viewModel.hasPermission()) {
            viewModel.check()
        } else {
            permission?.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                ?: viewModel.permissionDenied()
        }
    }
    when (state.stage) {
        LocationCheckStage.INTRO, LocationCheckStage.CHECKING ->
            LocationIntroPage(address, checking = state.stage == LocationCheckStage.CHECKING, onCheck = startCheck, onBack = onBack)
        LocationCheckStage.VERIFIED ->
            FastVerifiedPage(
                FastCheckKind.LOCATION,
                address,
                state.renter,
                onMailCode = onMailCode.takeIf { state.options?.available("mail") != null },
                onDone = onDone,
            )
        LocationCheckStage.MISS ->
            LocationMissPage(state, address, onRetry = viewModel::again, onDone = onDone, onOpenMethod = onOpenMethod)
    }
}

@Composable
private fun LocationIntroPage(
    address: String,
    checking: Boolean,
    onCheck: () -> Unit,
    onBack: () -> Unit,
) {
    FastCheckPage(
        title = "Location check",
        onBack = onBack,
        modifier = Modifier.testTag("locationCheck.intro"),
        footer = {
            PrimaryButton(
                title = "Check my location",
                onClick = onCheck,
                modifier = Modifier.fillMaxWidth().testTag("locationCheck.check"),
                isLoading = checking,
                isEnabled = !checking,
            )
            FastCheckTextButton("Verify another way", "locationCheck.anotherWay", onBack)
        },
    ) {
        FastCheckHeadline("Are you at home right now?")
        FastCheckBody("We check your phone's location once and compare it with $address.", address)
        LotPicture()
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CheckLine("Works when you're inside your home, in the iPhone and Android apps.")
            CheckLine("We keep match or no match and the date. Never where you were.")
            CheckLine(
                "We check once more on another day when you open Pantopus at home.",
                sub = "If that doesn't happen within 14 days, the Verified mark comes off until it does.",
            )
        }
    }
}

/** A row of three lots on a street, the home's lot outlined with its house and a dot: the reading lands inside it. */
@Composable
private fun LotPicture() {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(104.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(PantopusColors.appSurfaceSunken)
                .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(10.dp).align(Alignment.BottomCenter).background(PantopusColors.appBorder))
        Row(
            horizontalArrangement = Arrangement.spacedBy(18.dp),
            verticalAlignment = Alignment.Bottom,
            modifier = Modifier.offset(y = (-6).dp),
        ) {
            Box(modifier = Modifier.size(width = 70.dp, height = 44.dp).border(2.dp, PantopusColors.appBorder))
            Box(
                modifier =
                    Modifier
                        .size(width = 84.dp, height = 56.dp)
                        .background(PantopusColors.successBg)
                        .border(2.dp, PantopusColors.success),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.Home, null, size = 28.dp, strokeWidth = 2f, tint = PantopusColors.success)
                Box(
                    modifier =
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(end = 18.dp, bottom = 14.dp)
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(PantopusColors.primary600),
                )
            }
            Box(modifier = Modifier.size(width = 70.dp, height = 44.dp).border(2.dp, PantopusColors.appBorder))
        }
    }
}

@Composable
private fun CheckLine(
    text: String,
    sub: String? = null,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PantopusIconImage(
            PantopusIcon.Check,
            null,
            size = 16.dp,
            strokeWidth = 2.5f,
            tint = PantopusColors.success,
            modifier = Modifier.padding(top = 2.dp).width(16.dp),
        )
        Column {
            Text(text, fontSize = 14.5.sp, lineHeight = 20.sp, color = PantopusColors.appText)
            sub?.let { Text(it, fontSize = 12.5.sp, lineHeight = 17.sp, color = PantopusColors.appTextSecondary) }
        }
    }
}

/** A reading that didn't pass: its words, "Try again" while that can help, and the other ways. */
@Composable
private fun LocationMissPage(
    state: LocationCheckUiState,
    address: String,
    onRetry: () -> Unit,
    onDone: () -> Unit,
    onOpenMethod: (PlaceVerifyMethod) -> Unit,
) {
    val context = LocalContext.current
    val ways = otherWays(available = { id -> state.options?.available(id) != null }, except = PlaceVerifyMethod.LOCATION)
    val noMatch = "We couldn't place your phone at $address. Step inside and try again, or verify another way."
    val words =
        when (state.miss) {
            LocationMiss.TOO_ROUGH -> "Your phone's location was too rough to tell. Try again near a window, or verify another way."
            LocationMiss.NO_LOCATION -> "Location is unavailable. Check location access in Settings."
            LocationMiss.ERROR -> state.error ?: noMatch
            else -> noMatch
        }
    FastCheckPage(
        title = "Location check",
        onBack = onDone,
        modifier = Modifier.testTag("locationCheck.miss"),
        footer = {
            if (state.miss == LocationMiss.NO_LOCATION) {
                PrimaryButton(
                    title = "Open app settings",
                    onClick = {
                        val settings = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                        context.startActivity(settings)
                    },
                    modifier = Modifier.fillMaxWidth().testTag("locationCheck.settings"),
                )
            } else if (state.miss != LocationMiss.ERROR) {
                PrimaryButton(title = "Try again", onClick = onRetry, modifier = Modifier.fillMaxWidth().testTag("locationCheck.again"))
            }
            FastCheckTextButton("Not now", "locationCheck.notNow", onDone)
        },
    ) {
        FastCheckBody(words, address)
        OtherWaysCard(ways, onOpenMethod)
    }
}
