package app.pantopus.android.ui.screens.place.verify

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import kotlinx.coroutines.delay

/**
 * The phone check (FASTVERIFY phase 3): the mobile number and the name on its account, the texted code, then
 * "You're verified" or "We couldn't match that number" with the other ways.
 */
@Composable
fun PhoneCheckScreen(
    onBack: () -> Unit,
    onDone: () -> Unit,
    onOpenMethod: (PlaceVerifyMethod) -> Unit,
    onMailCode: () -> Unit,
    viewModel: PhoneCheckViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Back on the code goes back to the number, as the page's own arrow does.
    BackHandler(enabled = state.stage == PhoneCheckStage.CODE, onBack = viewModel::changeNumber)
    when (state.stage) {
        PhoneCheckStage.NUMBER -> PhoneNumberPage(state, viewModel, onBack)
        PhoneCheckStage.CODE -> PhoneCodePage(state, viewModel)
        PhoneCheckStage.VERIFIED ->
            FastVerifiedPage(
                FastCheckKind.PHONE,
                state.address.ifBlank { "this address" },
                state.renter,
                onMailCode = onMailCode.takeIf { state.options?.available("mail") != null },
                onDone = onDone,
            )
        PhoneCheckStage.NO_MATCH -> PhoneNoMatchPage(state, onDone = onDone, onOpenMethod = onOpenMethod)
    }
}

@Composable
@Suppress("LongMethod") // The page's words, the number, the name card and the note stay together.
private fun PhoneNumberPage(
    state: PhoneCheckUiState,
    viewModel: PhoneCheckViewModel,
    onBack: () -> Unit,
) {
    val address = state.address.ifBlank { "this address" }
    FastCheckPage(
        title = "Phone check",
        onBack = onBack,
        modifier = Modifier.testTag("phoneCheck.number"),
        footer = {
            PrimaryButton(
                title = "Text me a code",
                onClick = viewModel::sendCode,
                modifier = Modifier.fillMaxWidth().testTag("phoneCheck.send"),
                isEnabled = state.canSend,
                isLoading = state.sending,
            )
            Text(
                "We use your number for this check only. Message rates may apply.",
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = PantopusColors.appTextMuted,
                textAlign = TextAlign.Center,
            )
        },
    ) {
        FastCheckHeadline("What's your mobile number?")
        FastCheckBody(
            "We text you a code. Then we ask the phone company's records one thing: is this number billed to $address?",
            address,
        )
        // The field holds the digits; "(360) 555-0142" is only how they are drawn, so fast typing never races a rewrite.
        OutlinedTextField(
            value = state.digits,
            onValueChange = viewModel::updateNumber,
            label = { Text("Mobile number") },
            singleLine = true,
            visualTransformation = UsPhoneTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().testTag("phoneCheck.numberField"),
        )
        Column(modifier = Modifier.fillMaxWidth().placeCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            VerifyOverline("Name on the phone account")
            if (!state.someoneElse) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        state.accountName,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        color = PantopusColors.appText,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "Someone else's name",
                        fontSize = 13.5.sp,
                        color = PantopusColors.primary600,
                        modifier =
                            Modifier
                                .heightIn(min = 44.dp)
                                .clickable(role = Role.Button, onClick = viewModel::toggleSomeoneElse)
                                .padding(vertical = 12.dp)
                                .testTag("phoneCheck.someoneElse"),
                    )
                }
            } else {
                OutlinedTextField(
                    value = state.firstName,
                    onValueChange = viewModel::updateFirstName,
                    label = { Text("First name") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("phoneCheck.firstName"),
                )
                OutlinedTextField(
                    value = state.lastName,
                    onValueChange = viewModel::updateLastName,
                    label = { Text("Last name") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth().testTag("phoneCheck.lastName"),
                )
            }
        }
        FastCheckNote(
            PantopusIcon.Lock,
            "We send your name, this address and your number to our phone-check service. It answers match or no match. " +
                "We never see your phone records.",
        )
        state.error?.let { PhoneCheckError(it) }
    }
}

@Composable
private fun PhoneCodePage(
    state: PhoneCheckUiState,
    viewModel: PhoneCheckViewModel,
) {
    FastCheckPage(
        title = "Phone check",
        onBack = viewModel::changeNumber,
        modifier = Modifier.testTag("phoneCheck.code"),
        footer = {
            PrimaryButton(
                title = "Verify",
                onClick = viewModel::verify,
                modifier = Modifier.fillMaxWidth().testTag("phoneCheck.verify"),
                isEnabled = state.canVerify,
                isLoading = state.verifying,
            )
        },
    ) {
        FastCheckHeadline("Enter the 6-digit code")
        FastCheckBody("We texted it to ${state.displayNumber}.", state.displayNumber)
        Text(
            "Change number",
            fontSize = 14.sp,
            color = PantopusColors.appText,
            modifier =
                Modifier
                    .heightIn(min = 44.dp)
                    .clickable(role = Role.Button, onClick = viewModel::changeNumber)
                    .padding(vertical = 12.dp)
                    .testTag("phoneCheck.changeNumber"),
        )
        CodeBoxes(state.code, enabled = !state.verifying, onChange = viewModel::updateCode)
        ResendLine(state.resendAt, sending = state.sending, onSend = viewModel::sendCode)
        state.error?.let { PhoneCheckError(it) }
        FastCheckNote(PantopusIcon.Info, "Next we check this number against your home's address. It takes a few seconds.")
    }
}

/** The six digits in six boxes, one field underneath that takes the whole code (and the SMS autofill). */
@Composable
private fun CodeBoxes(
    code: String,
    enabled: Boolean,
    onChange: (String) -> Unit,
) {
    BasicTextField(
        value = code,
        onValueChange = onChange,
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(),
        modifier =
            Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Code" }
                .testTag("phoneCheck.codeField"),
        decorationBox = {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                repeat(PhoneCheckUiState.CODE_LENGTH) { index ->
                    val digit = code.getOrNull(index)?.toString().orEmpty()
                    val active = index == code.length
                    Box(
                        modifier =
                            Modifier
                                .weight(1f)
                                .heightIn(min = 56.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(PantopusColors.appSurface)
                                .border(
                                    if (active) 2.dp else 1.dp,
                                    if (active) PantopusColors.primary600 else PantopusColors.appBorder,
                                    RoundedCornerShape(10.dp),
                                ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(digit, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
                    }
                }
            }
        },
    )
}

/** "Send again in 0:24", then "Send again". */
@Composable
private fun ResendLine(
    resendAt: Long,
    sending: Boolean,
    onSend: () -> Unit,
) {
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(resendAt) {
        while (SystemClock.elapsedRealtime() < resendAt) {
            now = SystemClock.elapsedRealtime()
            delay(TICK_MS)
        }
        now = SystemClock.elapsedRealtime()
    }
    val left = ((resendAt - now + MS - 1) / MS).coerceAtLeast(0)
    if (left > 0) {
        Text(
            "Send again in ${left / SECONDS_PER_MINUTE}:${(left % SECONDS_PER_MINUTE).toString().padStart(2, '0')}",
            fontSize = 13.sp,
            color = PantopusColors.appTextMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().testTag("phoneCheck.resendIn"),
        )
    } else {
        Text(
            "Send again",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (sending) PantopusColors.appTextMuted else PantopusColors.primary600,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clickable(enabled = !sending, role = Role.Button, onClick = onSend)
                    .padding(vertical = 12.dp)
                    .testTag("phoneCheck.resend"),
        )
    }
}

@Composable
private fun PhoneCheckError(text: String) {
    Text(
        text,
        fontSize = 13.5.sp,
        lineHeight = 19.sp,
        color = PantopusColors.error,
        modifier = Modifier.fillMaxWidth().testTag("phoneCheck.error"),
    )
}

/** B4, "We couldn't match that number" (drawing 9): why that's common, the other ways, and that nothing changed. */
@Composable
private fun PhoneNoMatchPage(
    state: PhoneCheckUiState,
    onDone: () -> Unit,
    onOpenMethod: (PlaceVerifyMethod) -> Unit,
) {
    val address = state.address.ifBlank { "this address" }
    val ways = otherWays(available = { id -> state.options?.available(id) != null }, except = PlaceVerifyMethod.PHONE)
    FastCheckPage(
        title = "Phone check",
        onBack = onDone,
        modifier = Modifier.testTag("phoneCheck.noMatch"),
        footer = { FastCheckTextButton("Not now", "phoneCheck.notNow", onDone) },
    ) {
        FastCheckHeadline("We couldn't match that number")
        FastCheckBody(
            "The phone company's records don't show $address for ${state.displayNumber}. " +
                "That's common with family plans, prepaid phones and a recent move.",
            address,
        )
        OtherWaysCard(ways, onOpenMethod)
    }
}

private const val TICK_MS = 500L
private const val MS = 1000L
private const val SECONDS_PER_MINUTE = 60

/** Draws up to ten digits as "(360) 555-0142" and keeps the cursor on the digit it belongs to. */
private object UsPhoneTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text
        val shown = formatUsNumber(digits)
        val mapping =
            object : OffsetMapping {
                override fun originalToTransformed(offset: Int): Int {
                    if (digits.isEmpty()) return 0
                    // "(" before the area code; ") " after it; "-" after the exchange.
                    val shift =
                        when {
                            offset <= US_AREA_DIGITS -> SHIFT_AREA
                            offset <= US_EXCHANGE_END -> SHIFT_EXCHANGE
                            else -> SHIFT_LINE
                        }
                    return (offset + shift).coerceAtMost(shown.length)
                }

                override fun transformedToOriginal(offset: Int): Int {
                    val before = shown.take(offset).count(Char::isDigit)
                    return before.coerceIn(0, digits.length)
                }
            }
        return TransformedText(AnnotatedString(shown), mapping)
    }

    private const val SHIFT_AREA = 1
    private const val SHIFT_EXCHANGE = 3
    private const val SHIFT_LINE = 4
}
