@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.support_trains.start_train

import androidx.compose.runtime.Immutable
import app.pantopus.android.ui.theme.PantopusIcon
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * P2.6 — Render-only models for the Start-a-Support-Train wizard.
 *
 *  Step 1: Who & why   — recipient, story, where help goes, audience
 *  Step 2: What & when — date range, days, drop-off time, the household's needs
 *  Step 3: Review      — generated slot grid + launch
 *  + terminal Success step
 */

enum class StartSupportTrainStep {
    WhoAndWhy,
    WhatAndWhen,
    ReviewAndLaunch,
    Success,
    ;

    val stepNumber: Int?
        get() =
            when (this) {
                WhoAndWhy -> 1
                WhatAndWhen -> 2
                ReviewAndLaunch -> 3
                Success -> null
            }

    companion object {
        const val PROGRESS_TOTAL: Int = 3
    }
}

/**
 * A mutual connection shared between the organizer and the recipient,
 * surfaced as a micro-avatar strip on the recipient card so the
 * organizer can confirm they picked the right person.
 */
@Immutable
data class StartSupportTrainMutual(
    val id: String,
    val name: String,
) {
    /** One- or two-letter monogram for the micro-avatar. */
    val initials: String
        get() =
            name
                .split(" ")
                .filter { it.isNotBlank() }
                .take(2)
                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                .joinToString("")
                .ifBlank { "?" }
}

/**
 * The recipient the organizer typed but who isn't on Pantopus yet — the
 * Frame-2 invite branch. Carries the typed name plus the (stubbed)
 * contact handles the invite can be sent to.
 */
@Immutable
data class StartSupportTrainInviteCandidate(
    val typedName: String,
    val phone: String,
    val email: String,
) {
    /** The contact handle for a given invite method. */
    fun valueFor(method: StartSupportTrainInviteMethod): String =
        when (method) {
            StartSupportTrainInviteMethod.Phone -> phone
            StartSupportTrainInviteMethod.Email -> email
        }
}

/** Invite path option when the recipient is not on Pantopus yet. */
enum class StartSupportTrainInviteMethod(
    val title: String,
    val value: String,
    val icon: PantopusIcon,
) {
    Phone("Invite by phone", "+1 (415) 555-0142", PantopusIcon.Phone),
    Email("Invite by email", "d.chen@example.com", PantopusIcon.Mail),
}

/**
 * Every train is a meal train (founder, 11-17): helpers bring a home-cooked meal, takeout or groceries. The other
 * kinds the wizard once offered (rides, childcare, errands, dog walks) were never sent, so they're gone until built.
 */
object SupportTrainMeals {
    const val TITLE: String = "Meals"

    /** Backend `slot_label` and `support_mode` for a dinner date. */
    const val SLOT_LABEL: String = "Dinner"
    const val SUPPORT_MODE: String = "meal"

    /** 5:00 PM, minutes after midnight. */
    const val DEFAULT_START_MINUTES: Int = 17 * 60
}

/** Slot duration choices the organizer can pick from. Stored in minutes. */
enum class StartSupportTrainSlotDuration(val minutes: Int, val title: String) {
    Thirty(30, "30 min"),
    Sixty(60, "1 hr"),
    Ninety(90, "1.5 hr"),
    OneTwenty(120, "2 hr"),
}

/** Who can see this train. Maps onto backend `sharing_mode`. */
enum class StartSupportTrainVisibility(
    val sharingModeWire: String,
    val title: String,
    val subtitle: String,
    val icon: PantopusIcon,
    /** Who the success screen says can find the new train. */
    val audience: String,
) {
    Nearby(
        "private_link",
        "People near you",
        "Listed for people within 25 mi, and open to anyone with the link.",
        PantopusIcon.Users,
        "people near you",
    ),
    Connections(
        "invited_only",
        "My connections",
        "Your connections and people you invite can see it and sign up.",
        PantopusIcon.UserPlus,
        "your connections",
    ),
    LinkOnly(
        "direct_share_only",
        "Anyone with the link",
        "Not listed anywhere. Anyone you share the link with can see it and sign up.",
        PantopusIcon.Link,
        "anyone you share the link with",
    ),
    ;

    companion object {
        /** Step 1's audience switches as one choice; neither selected means anyone with the link. */
        fun from(
            inviteOnly: Boolean,
            blockVisible: Boolean,
        ): StartSupportTrainVisibility =
            when {
                inviteOnly -> Connections
                blockVisible -> Nearby
                else -> LinkOnly
            }

        fun fromWire(wire: String?): StartSupportTrainVisibility? = entries.firstOrNull { it.sharingModeWire == wire }
    }
}

/** One of the organizer's homes that a train can be delivered to (a home they belong to). */
@Immutable
data class StartSupportTrainHomeOption(
    val id: String,
    val title: String,
    val subtitle: String?,
)

/**
 * Where help goes: one of the organizer's homes ([homeId]), or a picked address with its point. [label] is the line
 * the wizard and the review show.
 */
@Immutable
data class StartSupportTrainDelivery(
    val label: String,
    val homeId: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val zip: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val placeId: String? = null,
) {
    val isHome: Boolean get() = homeId != null
}

/** One generated slot in the preview grid. */
@Immutable
data class StartSupportTrainSlot(
    val id: String,
    val dateKey: String,
    val dayLabel: String,
    val timeLabel: String,
    val startTime: String,
    val endTime: String,
)

/** Form state held by the VM and consumed by the screen. */
@Immutable
data class StartSupportTrainFormState(
    val step: StartSupportTrainStep = StartSupportTrainStep.WhoAndWhy,
    val beneficiaryQuery: String = "",
    val reason: String = "",
    // Anyone with the link by default (founder, 11-17): neither switch on.
    val inviteOnly: Boolean = false,
    val blockVisible: Boolean = false,
    val inviteMethod: StartSupportTrainInviteMethod = StartSupportTrainInviteMethod.Phone,
    val startDateMillis: Long = defaultStartMillis(),
    val endDateMillis: Long = defaultEndMillis(),
    /** Days of the week the train runs, 0 = Sunday … 6 = Saturday. */
    val weekdays: Set<Int> = ALL_WEEKDAYS,
    /** When each drop-off window opens, minutes after midnight. */
    val startMinutes: Int = SupportTrainMeals.DEFAULT_START_MINUTES,
    val slotDuration: StartSupportTrainSlotDuration = StartSupportTrainSlotDuration.Sixty,
    val visibility: StartSupportTrainVisibility = StartSupportTrainVisibility.LinkOnly,
    /** Where help goes; null until the organizer picks a home or an address. */
    val delivery: StartSupportTrainDelivery? = null,
    /** "Another address" is chosen and its field shows. */
    val typingAddress: Boolean = false,
    val addressQuery: String = "",
    // What helpers are told about the household.
    val householdSize: String = "",
    val allergies: String = "",
    val diet: String = "",
    val contactless: Boolean = false,
    val instructions: String = "",
) {
    companion object {
        const val REASON_CHAR_LIMIT: Int = 500
        const val INSTRUCTIONS_CHAR_LIMIT: Int = 500

        /** The server takes a schedule of up to 90 days from its first date (`generateSlotsSchema`). */
        const val MAX_RANGE_DAYS: Int = 90

        val ALL_WEEKDAYS: Set<Int> = (0..6).toSet()

        /** Default end-of-window offset (inclusive) — a 7-day span. */
        private const val DEFAULT_RANGE_DAYS_INCLUSIVE: Int = 6

        fun defaultStartMillis(): Long = Calendar.getInstance().apply { stripTime() }.timeInMillis

        fun defaultEndMillis(): Long =
            Calendar.getInstance().apply {
                stripTime()
                add(Calendar.DAY_OF_YEAR, DEFAULT_RANGE_DAYS_INCLUSIVE)
            }.timeInMillis
    }
}

/** Event the VM raises so the screen can pop / push routes. */
sealed interface StartSupportTrainEvent {
    /** User aborted or completed before publishing. */
    data object Dismiss : StartSupportTrainEvent

    /** Train published — host should pop wizard and push the train's
     *  review-signups screen for [trainId]. */
    data class OpenTrain(val trainId: String) : StartSupportTrainEvent
}

/** Slot-grid generator. Public so the unit test can drive it directly. */
object StartSupportTrainSlotGenerator {
    private const val MINUTES_PER_HOUR: Int = 60
    private const val NOON_HOUR: Int = 12
    private const val LAST_MINUTE_OF_DAY: Int = 23 * MINUTES_PER_HOUR + 59

    /**
     * The server's 90-day range holds at most 91 dates. The wizard refuses a longer range before this point, so the
     * cap only guards the preview.
     */
    private const val SLOT_CAPACITY: Int = StartSupportTrainFormState.MAX_RANGE_DAYS + 1

    /** Build one slot per chosen weekday covering `[startMillis, endMillis]` inclusive. */
    fun generate(
        startMillis: Long,
        endMillis: Long,
        durationMinutes: Int,
        startMinutes: Int,
        weekdays: Set<Int> = StartSupportTrainFormState.ALL_WEEKDAYS,
    ): List<StartSupportTrainSlot> {
        val start =
            Calendar.getInstance().apply {
                timeInMillis = startMillis
                stripTime()
            }
        val end =
            Calendar.getInstance().apply {
                timeInMillis = endMillis
                stripTime()
            }
        if (end.before(start)) return emptyList()
        val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
        val dayFmt = SimpleDateFormat("EEE MMM d", Locale.US).apply { timeZone = TimeZone.getDefault() }
        val (startStr, endStr, timeLabel) = timeRange(startMinutes, durationMinutes)

        val slots = mutableListOf<StartSupportTrainSlot>()
        val cursor = start.clone() as Calendar
        var days = 0
        while (!cursor.after(end) && days < SLOT_CAPACITY) {
            // Calendar's Sunday is 1; the server counts Sunday as 0.
            if ((cursor.get(Calendar.DAY_OF_WEEK) - 1) in weekdays) {
                val dateKey = dateFmt.format(cursor.time)
                slots.add(
                    StartSupportTrainSlot(
                        id = "${dateKey}_$startStr",
                        dateKey = dateKey,
                        dayLabel = dayFmt.format(cursor.time),
                        timeLabel = timeLabel,
                        startTime = startStr,
                        endTime = endStr,
                    ),
                )
            }
            cursor.add(Calendar.DAY_OF_YEAR, 1)
            days += 1
        }
        return slots
    }

    /** The window's end, minutes after midnight; it stops at 11:59 PM. */
    fun endMinutes(
        startMinutes: Int,
        durationMinutes: Int,
    ): Int = (startMinutes.coerceIn(0, LAST_MINUTE_OF_DAY) + durationMinutes.coerceAtLeast(0)).coerceAtMost(LAST_MINUTE_OF_DAY)

    private fun timeRange(
        startMinutes: Int,
        durationMinutes: Int,
    ): Triple<String, String, String> {
        val from = startMinutes.coerceIn(0, LAST_MINUTE_OF_DAY)
        val to = endMinutes(from, durationMinutes)
        return Triple(wireString(from), wireString(to), "${displayString(from)}–${displayString(to)}")
    }

    fun wireString(totalMinutes: Int): String {
        val h = totalMinutes / MINUTES_PER_HOUR
        val m = totalMinutes % MINUTES_PER_HOUR
        return String.format(Locale.US, "%02d:%02d", h, m)
    }

    fun displayString(totalMinutes: Int): String {
        val h24 = totalMinutes / MINUTES_PER_HOUR
        val m = totalMinutes % MINUTES_PER_HOUR
        val suffix = if (h24 < NOON_HOUR) "am" else "pm"
        val h12 = if (h24 % NOON_HOUR == 0) NOON_HOUR else h24 % NOON_HOUR
        return if (m == 0) "$h12 $suffix" else String.format(Locale.US, "%d:%02d %s", h12, m, suffix)
    }
}

/** Strip a Calendar to start-of-day in its current timezone. */
internal fun Calendar.stripTime() {
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}

/** Format helper for the date-pickers' display. */
internal fun formatDay(millis: Long): String {
    val fmt = SimpleDateFormat("EEE MMM d, yyyy", Locale.US)
    fmt.timeZone = TimeZone.getDefault()
    return fmt.format(Date(millis))
}

/** The server keeps at most this many allergies or diet items (`allergies` max(50) in routes/supportTrains.js). */
private const val MAX_LIST_ITEMS = 50

/** The server keeps each allergy or diet item to this many characters (`allergies` items max(100)). */
internal const val MAX_LIST_ITEM_CHARS = 100

/**
 * "peanuts, shellfish" → ["peanuts", "shellfish"]: one item per comma, semicolon or line. A comma inside
 * parentheses stays in its item, so "nuts (almond, cashew)" is one item.
 */
internal fun splitList(text: String): List<String> {
    val items = mutableListOf<String>()
    val current = StringBuilder()
    var depth = 0
    for (ch in text) {
        when {
            ch == '(' -> depth++
            ch == ')' && depth > 0 -> depth--
        }
        if ((ch == ',' && depth == 0) || ch == ';' || ch == '\n') {
            items += current.toString()
            current.clear()
        } else {
            current.append(ch)
        }
    }
    items += current.toString()
    return items.map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(MAX_LIST_ITEMS)
}

/** Said under an allergies or diet field when one typed item is longer than the server keeps. */
internal fun listItemProblem(
    text: String,
    what: String,
): String? =
    if (splitList(text).any { it.length > MAX_LIST_ITEM_CHARS }) {
        "Keep each $what to $MAX_LIST_ITEM_CHARS characters, and separate them with commas."
    } else {
        null
    }
