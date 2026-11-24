package app.pantopus.android.ui.screens.place.verify

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.place.components.PlaceChevron
import app.pantopus.android.ui.screens.place.components.PlaceTileTone
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage

/**
 * A fast check's page (FASTVERIFY drawings 4–6, 9–11): a back arrow and its title, the page, and a docked footer with
 * its button. The page scrolls; the footer stays above the keyboard.
 */
@Composable
internal fun FastCheckPage(
    title: String,
    onBack: () -> Unit,
    footer: (@Composable ColumnScope.() -> Unit)?,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier = modifier.fillMaxSize().background(PantopusColors.appBg).imePadding()) {
        Box(modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.CenterStart)
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClickLabel = "Back", onClick = onBack)
                        .testTag("fastCheck.back"),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.ChevronLeft, "Back", size = 22.dp, strokeWidth = 2.25f, tint = PantopusColors.appText)
            }
            Text(
                title,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.appText,
                modifier = Modifier.padding(horizontal = 56.dp).semantics { heading() },
            )
        }
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))
            content()
            Spacer(modifier = Modifier.height(16.dp))
        }
        if (footer != null) {
            HorizontalDivider(color = PantopusColors.appBorderSubtle)
            Column(
                modifier = Modifier.fillMaxWidth().background(PantopusColors.appSurface).navigationBarsPadding().padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                content = footer,
            )
        }
    }
}

/** The page's big question ("What's your mobile number?"). */
@Composable
internal fun FastCheckHeadline(text: String) {
    Text(
        text,
        fontSize = 26.sp,
        lineHeight = 31.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.4).sp,
        color = PantopusColors.appText,
        modifier = Modifier.semantics { heading() },
    )
}

/** Body words with the address in bold where [address] appears in [text]. */
@Composable
internal fun FastCheckBody(
    text: String,
    address: String? = null,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
) {
    Text(
        boldAddress(text, address),
        fontSize = 15.sp,
        lineHeight = 22.sp,
        color = PantopusColors.appTextSecondary,
        textAlign = textAlign,
        modifier = modifier,
    )
}

internal fun boldAddress(
    text: String,
    address: String?,
): AnnotatedString {
    val at = address?.takeIf { it.isNotBlank() }?.let { text.indexOf(it) } ?: -1
    if (at < 0 || address == null) return AnnotatedString(text)
    return buildAnnotatedString {
        append(text.substring(0, at))
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)) { append(address) }
        append(text.substring(at + address.length))
    }
}

/** A tinted note with its icon: the sky one for what happens next, the muted one for privacy. */
@Composable
internal fun FastCheckNote(
    icon: PantopusIcon,
    text: String,
    sky: Boolean = true,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(if (sky) PantopusColors.infoBg else PantopusColors.appSurfaceSunken)
                .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PantopusIconImage(
            icon,
            null,
            size = 17.dp,
            strokeWidth = 2f,
            tint = if (sky) PantopusColors.primary700 else PantopusColors.appTextSecondary,
            modifier = Modifier.padding(top = 1.dp),
        )
        Text(
            text,
            fontSize = 13.5.sp,
            lineHeight = 19.sp,
            color = if (sky) PantopusColors.primary700 else PantopusColors.appTextSecondary,
        )
    }
}

/** A small muted line with an icon, under a card ("Nothing changed. Your home tools still work."). */
@Composable
internal fun FastCheckSmallLine(
    icon: PantopusIcon,
    text: String,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 2.dp)) {
        PantopusIconImage(
            icon,
            null,
            size = 14.dp,
            strokeWidth = 2f,
            tint = PantopusColors.appTextMuted,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(text, fontSize = 12.5.sp, lineHeight = 17.sp, color = PantopusColors.appTextSecondary)
    }
}

/** A text button in the footer ("Not now", "Verify another way", "Retake"). */
@Composable
internal fun FastCheckTextButton(
    text: String,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        text,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = PantopusColors.primary600,
        textAlign = TextAlign.Center,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(vertical = 13.dp)
                .testTag(tag),
    )
}

/** The way a fast check passed, for B3's words: phone, location or document (a bill). */
enum class FastCheckKind(val words: (String) -> String) {
    PHONE({ "Your phone number matches $it." }),
    LOCATION({ "Your phone was at $it." }),
    BILL({ "Your bill matches $it." }),
}

/**
 * B3, "You're verified" (drawing 6): how it passed, what opens now, and what still needs the mailed code. "What others
 * near you pay in rent" shows to renters only.
 */
@Composable
@Suppress("LongMethod") // B3's three parts stay together.
internal fun FastVerifiedPage(
    kind: FastCheckKind,
    address: String,
    renter: Boolean,
    onMailCode: (() -> Unit)?,
    onDone: () -> Unit,
) {
    FastCheckPage(
        title = "",
        onBack = onDone,
        footer = {
            PrimaryButton(title = "Go to your Place", onClick = onDone, modifier = Modifier.fillMaxWidth().testTag("fastCheck.goToPlace"))
        },
        modifier = Modifier.testTag("fastCheck.verified"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier.size(76.dp).clip(CircleShape).background(PantopusColors.successBg),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.BadgeCheck, null, size = 36.dp, strokeWidth = 2f, tint = PantopusColors.success)
            }
            Text(
                "You're verified",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            FastCheckBody(kind.words(address), address, textAlign = TextAlign.Center)
        }
        Column(modifier = Modifier.fillMaxWidth().placeCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            VerifyOverline("Open now")
            listOfNotNull(
                "Message homes near you",
                "The Verified mark on your home and profile",
                "Your home's details from the county record",
                "What others near you pay in rent".takeIf { renter },
            ).forEach { line ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    PantopusIconImage(PantopusIcon.Check, null, size = 16.dp, strokeWidth = 2.5f, tint = PantopusColors.success)
                    Text(line, fontSize = 14.5.sp, lineHeight = 20.sp, color = PantopusColors.appText)
                }
            }
        }
        Column(modifier = Modifier.fillMaxWidth().placeCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            VerifyOverline("Needs a mailed code")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PantopusIconImage(
                    PantopusIcon.Lock,
                    null,
                    size = 16.dp,
                    strokeWidth = 2f,
                    tint = PantopusColors.appTextSecondary,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Column {
                    Text("Residency letters and home Mail", fontSize = 14.5.sp, lineHeight = 20.sp, color = PantopusColors.appText)
                    Text(
                        if (onMailCode == null) "Mail is currently unavailable." else "Request a postcard to finish verification.",
                        fontSize = 12.5.sp,
                        lineHeight = 17.sp,
                        color = PantopusColors.appTextSecondary,
                    )
                }
            }
            if (onMailCode != null) {
                Row(
                    modifier =
                        Modifier
                            .heightIn(min = 44.dp)
                            .clickable(role = Role.Button, onClick = onMailCode)
                            .testTag("fastCheck.mailCode"),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Mail me a code", fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
                    PantopusIconImage(PantopusIcon.ArrowRight, null, size = 15.dp, strokeWidth = 2.25f, tint = PantopusColors.appText)
                }
            }
        }
    }
}

/** Another way to verify on B4, with its short word. */
internal data class OtherWay(
    val method: PlaceVerifyMethod,
    val icon: PantopusIcon,
    val label: String,
    val sub: String,
    val tone: PlaceTileTone,
)

/** B4's other ways (drawing 9), in the server's order, each opening its flow. */
internal fun otherWays(
    available: (String) -> Boolean,
    except: PlaceVerifyMethod,
): List<OtherWay> =
    listOfNotNull(
        OtherWay(PlaceVerifyMethod.LOCATION, PantopusIcon.MapPin, "I'm at home now", "One tap.", PlaceTileTone.SKY),
        OtherWay(PlaceVerifyMethod.DOCUMENT, PantopusIcon.Camera, "Take a photo of a bill", "About a minute.", PlaceTileTone.SKY),
        OtherWay(PlaceVerifyMethod.MAIL, PantopusIcon.Mail, "Mail me a code", "Arrives in about a week.", PlaceTileTone.MUTED),
    ).filter { it.method != except && PlaceVerifyMethod.isFastFlowReady(it.method) && available(it.method.slug) }

/** "Try another way": the other ways as rows, and that nothing changed. */
@Composable
internal fun OtherWaysCard(
    ways: List<OtherWay>,
    onOpen: (PlaceVerifyMethod) -> Unit,
) {
    if (ways.isNotEmpty()) {
        VerifyOverline("Try another way")
        Column(modifier = Modifier.fillMaxWidth().placeCard()) {
            ways.forEachIndexed { i, way ->
                Box(
                    modifier = Modifier.clickable(role = Role.Button) { onOpen(way.method) }.testTag("fastCheck.other.${way.method.slug}"),
                ) {
                    VerifyRow(way.icon, way.label, way.sub, way.tone, trailing = { PlaceChevron() }, subLineHeight = 17.sp)
                }
                if (i < ways.lastIndex) VerifyDivider()
            }
        }
    }
    FastCheckSmallLine(PantopusIcon.Info, "Nothing changed. Your home tools still work.")
}

/**
 * The server's words for a fast check's refusal (`{ code, error }`, SPEC section 6), else the same words by code, else
 * the app's plain words for the failure.
 */
internal fun fastCheckErrorWords(error: NetworkError): String {
    val body =
        when (error) {
            is NetworkError.ClientError -> error.body
            is NetworkError.Server -> error.body
            is NetworkError.Forbidden -> error.body
            else -> null
        }
    val json = body?.let { runCatching { org.json.JSONObject(it) }.getOrNull() }
    val code = json?.optString("code").orEmpty()
    return FAST_CHECK_WORDS[code]
        ?: json?.optString("error")?.takeIf { it.isNotBlank() && !NetworkError.ClientError.isMachineCode(it) }
        ?: if (error is NetworkError.NotFound) FAST_CHECK_WORDS.getValue("FAST_CHECK_OFF") else error.message
}

private val FAST_CHECK_WORDS =
    mapOf(
        "MAIL_PROOF_REQUIRED" to "This needs a mailed code. Ask for the postcard in Place.",
        "FAST_CHECK_OFF" to "This way to verify isn't available. Choose another way to verify.",
        "FAST_CHECK_ONE_HOME" to "A fast check covers one home. Choose another way to verify this address.",
        "FAST_CHECK_LIMIT" to "Too many tries for now. Try again later, or verify another way.",
        "PHONE_IN_USE" to "This number already verified another account. Use a different way.",
        "PHONE_INVALID" to "Check the number and try again.",
        "PHONE_CHECK_UNAVAILABLE" to "The phone check isn't available right now. Verify another way.",
    )
