package app.pantopus.android.ui.screens.place.detail

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.place.PickupCollection
import app.pantopus.android.data.api.models.place.PlaceCalendarEvent
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.rememberReduceMotion
import kotlinx.coroutines.delay

/** How long a pickup entry stays lit after a save or "See it in Today". */
private const val PICKUP_LIT_MS = 3000L
private const val PICKUP_LIT_STEP_MS = 100L
private const val PICKUP_LIT_FADE_MS = 300

/**
 * The pickup-day journey: what the screen hosting the calendar card adds to it. Place's "Today at this address" opens
 * the editor for tip card 16's "Set pickup day" and offers "See it in Today"; the Today tab lights the next pickup.
 */
data class PickupJourney(
    /** Open the pickup editor once (tip card 16's "Set pickup day"). */
    val editorRequested: Boolean = false,
    val onEditorOpened: () -> Unit = {},
    /** The saved box's "See it in Today"; null on the Today tab itself, which has no button. */
    val onSeeInToday: (() -> Unit)? = null,
    /** The Today tab, opened by "See it in Today": "Coming up at home" with the next pickup's entry lit, once. */
    val litRequested: Boolean = false,
    val onLitShown: () -> Unit = {},
)

/** What one screen remembers of the journey until the person leaves it: the last save from here and the entry lit now. */
@Stable
internal class PickupJourneyState {
    /** The collections a save in flight sent. */
    var pending: List<PickupCollection>? = null

    /** The collections the last save from this screen set: the saved box's words. */
    var saved by mutableStateOf<List<PickupCollection>?>(null)
        private set

    /** Counts this screen's saves, so each one lights its entry once. */
    var saves by mutableIntStateOf(0)
        private set

    /** The save whose entry was already lit. */
    var litSave = 0

    /**
     * The house's question was answered "Yes, remind me": the save in flight turns the reminder on without the reminder
     * question asking again.
     */
    private var answered = false

    /** "Yes, remind me": [collections] are being saved as the household's schedule. */
    fun answer(collections: List<PickupCollection>) {
        pending = collections
        answered = true
    }

    /** The reminder question reads it once, as it comes up for that save. */
    fun takeAnswered(): Boolean = answered.also { answered = false }

    /** The save failed: the next save's reminder question asks as usual. */
    fun forgetAnswer() {
        answered = false
    }

    /** The entry lit now: [pickupEntryKey], which is also its agenda row's id. */
    var litKey by mutableStateOf<String?>(null)
        private set

    fun saved() {
        saved = pending ?: return
        pending = null
        saves++
    }

    /** Lights [key] for about three seconds; the count starts again while something ([covered], a tip card) is over it. */
    suspend fun light(
        key: String,
        covered: () -> Boolean = { false },
    ) {
        litKey = key
        try {
            var left = PICKUP_LIT_MS
            while (left > 0) {
                delay(PICKUP_LIT_STEP_MS)
                left = if (covered()) PICKUP_LIT_MS else left - PICKUP_LIT_STEP_MS
            }
        } finally {
            if (litKey == key) litKey = null
        }
    }
}

/** A calendar date's key: the id of its row in "Coming up at home" (see [TodayAgenda]). */
internal fun pickupEntryKey(event: PlaceCalendarEvent): String = "calendar:${event.ruleId}:${event.date}:${event.kind}"

/** A garbage, recycling, yard waste or bulk date. */
internal val PlaceCalendarEvent.isPickupEntry: Boolean get() = kind in PICKUP_ENTRY_KINDS

/** The household's own date, not a general one for the address. */
internal val PlaceCalendarEvent.isHouseholds: Boolean get() = audience == "household" || (audience == null && scope == "home")

/** `pickup.entry.<date>`: a pickup entry a tap opens the editor from. */
internal fun pickupEntryTag(event: PlaceCalendarEvent): String = "pickup.entry.${event.date.take(ISO_DATE_LENGTH)}"

private const val ISO_DATE_LENGTH = 10

/** Marks the save that just landed as this screen's, for the saved box. */
@Composable
internal fun PickupSavedEffect(
    actions: AddressCalendarActions?,
    state: PickupJourneyState,
) {
    actions ?: return
    LaunchedEffect(actions, state) { actions.pickupSaved.collect { state.saved() } }
}

/**
 * The green box over the calendar's dates after a save that set a schedule: what was saved, who can see it, and (away
 * from the Today tab) the way to Today. TalkBack reads the title when it appears.
 */
@Composable
internal fun PickupSavedBox(
    title: String,
    onSeeInToday: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.successBg)
                .border(1.dp, PantopusColors.successLight, shape)
                .padding(14.dp)
                .testTag("pickup.saved"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
            PantopusIconImage(PantopusIcon.CheckCircle, null, size = 22.dp, strokeWidth = 2f, tint = PantopusColors.success)
            Column(
                modifier = Modifier.weight(1f).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(title, fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.Bold, color = PantopusColors.success)
                Text("People in this home can see it.", fontSize = 13.sp, lineHeight = 18.sp, color = PantopusColors.success)
            }
        }
        if (onSeeInToday != null) {
            PrimaryButton("See it in Today", onSeeInToday, modifier = Modifier.fillMaxWidth().testTag("pickup.saved.seeToday"))
        }
    }
}

/**
 * A lit entry's green wash, drawn a little past the row ([outsetX], [outsetY]) so its words keep their place and don't
 * touch its edge.
 */
internal fun Modifier.pickupLit(
    color: Color,
    outsetX: Dp = 8.dp,
    outsetY: Dp = 0.dp,
): Modifier =
    drawBehind {
        val dx = outsetX.toPx()
        val dy = outsetY.toPx()
        drawRoundRect(
            color,
            topLeft = Offset(-dx, -dy),
            size = Size(size.width + dx * 2, size.height + dy * 2),
            cornerRadius = CornerRadius(10.dp.toPx()),
        )
    }

/** The wash's colour, fading in and out (at once with animations off). */
@Composable
internal fun pickupLitColor(lit: Boolean): Color {
    val still = rememberReduceMotion()
    val color by animateColorAsState(
        if (lit) PantopusColors.successBg else PantopusColors.successBg.copy(alpha = 0f),
        tween(if (still) 0 else PICKUP_LIT_FADE_MS),
        label = "pickupLit",
    )
    return color
}
