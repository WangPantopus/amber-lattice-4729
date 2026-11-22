package app.pantopus.android.ui.screens.place.detail

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.core.security.findFragmentActivity
import app.pantopus.android.data.api.models.ai.AIPickupScheduleReadingDto
import app.pantopus.android.data.api.models.place.PickupCollection
import app.pantopus.android.data.api.models.place.PlaceAddressCalendarData
import app.pantopus.android.data.api.models.place.SetPickupDayRequest
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.theme.PantopusColors
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val WEEKLY_PICKUP_WINDOW_DAYS = 7L
private const val BIWEEKLY_PICKUP_WINDOW_DAYS = 14L
private const val WEEKDAY_LABEL_LENGTH = 3

/** How long "Yes, remind me" waits for the page to show the saved schedule before turning the reminder on anyway. */
private const val ANSWERED_WAIT_MS = 8000L
private val PICKUP_DATE_FORMAT = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy")

private val WEEKDAYS =
    listOf(
        "MO" to "Monday",
        "TU" to "Tuesday",
        "WE" to "Wednesday",
        "TH" to "Thursday",
        "FR" to "Friday",
        "SA" to "Saturday",
        "SU" to "Sunday",
    )
private val FREQUENCIES = listOf("not_set" to "Not sure yet", "weekly" to "Every week", "biweekly" to "Every other week")

/**
 * Dates come from the home's local today; the device timezone never chooses a pickup week. A home with no schedule
 * opens with Garbage on and weekly, so the first choice is the day. [onSave] gets the collections a save sends.
 */
@Composable
internal fun PickupScheduleEditor(
    data: PlaceAddressCalendarData,
    actions: AddressCalendarActions,
    busy: Boolean,
    onSave: (List<PickupCollection>) -> Unit = {},
) {
    var collections by remember(data.pickupSchedule, data.pickupVersion) {
        mutableStateOf(data.pickupSchedule?.let { it.collections.orEmpty() } ?: listOf(PickupCollection("garbage")))
    }
    val openedVersion = data.pickupVersion
    var readingFlyer by remember { mutableStateOf(false) }
    val locked = busy || readingFlyer
    if (actions.readsPickupFlyers) {
        PickupFlyerControl(actions, enabled = !busy, onReadingChange = { readingFlyer = it }) { read ->
            collections = collections.filledFrom(read, data.today)
        }
    }
    Text("Choose the collections your household uses.", color = PantopusColors.appText, fontSize = 13.sp)
    listOf("garbage" to "Garbage", "recycling" to "Recycling", "yard_waste" to "Yard waste", "bulk_pickup" to "Bulk collection").forEach {
            (kind, label) ->
        val row = collections.find { it.kind == kind }
        Row {
            Checkbox(checked = row != null, enabled = !locked, onCheckedChange = { enabled ->
                collections = if (enabled) collections + PickupCollection(kind) else collections.filter { it.kind != kind }
            }, modifier = Modifier.semantics { contentDescription = label })
            Text(label, color = PantopusColors.appText, modifier = Modifier.padding(top = 12.dp))
        }
        if (row != null) {
            CollectionFields(row, label, data.today, locked) { changed ->
                collections = collections.map { if (it.kind == kind) changed else it }
            }
        }
    }
    Text(
        "Use collection dates, not the night you put bins out. Keep the original start date for an unchanged cycle. " +
            "Turn off a type to remove it. Check your provider for holiday changes.",
        fontSize = 12.sp,
        color = PantopusColors.appTextSecondary,
    )
    Button(
        enabled =
            !locked && collections.isNotEmpty() &&
                collections.all {
                    it.anchorDate.isNotEmpty() && (it.frequency != "weekly" || it.weekdays.isNotEmpty())
                },
        onClick = {
            onSave(collections)
            actions.setPickupDay(
                SetPickupDayRequest(collections = collections, expectedVersion = openedVersion),
                offerPrimer = data.needsPickupDay || data.pickupSchedule == null,
            )
        },
    ) { Text(if (busy) "Saving…" else "Save schedule") }
    if (data.pickupSchedule != null) {
        TextButton(enabled = !locked, onClick = { actions.clearPickupDay(openedVersion) }) { Text("Clear household schedule") }
    }
}

/** The collections a household can set, in the order the saved box names them, with its words for each. */
private val PICKUP_KIND_NAMES =
    listOf(
        "garbage" to "Garbage pickup",
        "recycling" to "Recycling pickup",
        "yard_waste" to "Yard waste pickup",
        "bulk_pickup" to "Bulk collection",
    )

/** The kinds of date a household's pickup schedule sets. */
internal val PICKUP_ENTRY_KINDS = PICKUP_KIND_NAMES.map { it.first }.toSet()

/**
 * The saved box's title, from the first collection in the order garbage, recycling, yard waste, bulk: "Garbage pickup
 * is Tuesday", "… is Tuesday and Friday", "… is every other Tuesday", or "… is saved" for any other pattern. Null with
 * no collection.
 */
internal fun pickupSavedTitle(collections: List<PickupCollection>): String? {
    val (kind, name) = PICKUP_KIND_NAMES.firstOrNull { (kind, _) -> collections.any { it.kind == kind } } ?: return null
    val first = collections.first { it.kind == kind }
    val days = WEEKDAYS.filter { it.first in first.weekdays }.map { it.second }
    val weekly = first.frequency == "weekly"
    return when {
        weekly && first.interval == 1 && days.size == 1 -> "$name is ${days.single()}"
        weekly && first.interval == 1 && days.size > 1 -> "$name is ${days.dropLast(1).joinToString(", ")} and ${days.last()}"
        weekly && first.interval == 2 && days.size == 1 -> "$name is every other ${days.single()}"
        else -> "$name is saved"
    }
}

@Composable
private fun CollectionFields(
    row: PickupCollection,
    label: String,
    today: String,
    locked: Boolean,
    onChange: (PickupCollection) -> Unit,
) {
    val pattern =
        when (row.frequency) {
            "weekly" -> "weekly-${row.interval}"
            "monthly" -> "monthly-${row.monthlyMode}"
            else -> "once"
        }
    val choices =
        (1..4).map { "weekly-$it" to if (it == 1) "Every week" else "Every $it weeks" } +
            listOf("monthly-day_of_month" to "Monthly on this date", "monthly-weekday" to "Monthly on this weekday", "once" to "One time")
    ScheduleChoice("$label repeats", pattern, choices, locked) { value ->
        onChange(
            when {
                value.startsWith("weekly-") -> {
                    val weekly = row.copy(frequency = "weekly", interval = value.removePrefix("weekly-").toInt())
                    // Back to every week with a start date off the chosen days: it follows them again.
                    if (weekly.everyWeek && weekly.startOffDay() != null) weekly.withSuggestedStart(today) else weekly
                }
                value.startsWith(
                    "monthly-",
                ) ->
                    row.copy(
                        frequency = "monthly",
                        interval = if (row.frequency == "monthly") row.interval else 1,
                        monthlyMode = value.removePrefix("monthly-"),
                    )
                else -> row.copy(frequency = "once", interval = 1, untilDate = null)
            },
        )
    }
    if (row.frequency == "monthly") {
        ScheduleChoice(
            "$label month interval",
            row.interval.toString(),
            (1..12).map { it.toString() to if (it == 1) "Every month" else "Every $it months" },
            locked,
        ) {
            onChange(row.copy(interval = it.toInt()))
        }
    }
    if (row.frequency == "weekly") {
        CollectionWeekdays(row, label, today, locked, onChange)
    }
    CollectionDates(row, label, today, locked, onChange)
    if (row.frequency == "weekly" && row.interval > 1) {
        Text("The start date anchors the collection week. Weeks begin Monday.", fontSize = 12.sp, color = PantopusColors.appTextSecondary)
    }
    if (row.frequency == "monthly") {
        Text(
            "The start date sets the pattern. Dates absent from a month are skipped; a fifth weekday means the last weekday.",
            fontSize = 12.sp,
            color = PantopusColors.appTextSecondary,
        )
    }
}

/** The collection's dates, in the system date picker like the radon card's test date. */
@Composable
private fun CollectionDates(
    row: PickupCollection,
    label: String,
    today: String,
    locked: Boolean,
    onChange: (PickupCollection) -> Unit,
) {
    val anchor = runCatching { LocalDate.parse(row.anchorDate) }.getOrNull()
    if (anchor == null) {
        GhostButton(
            if (row.frequency == "once") "Choose the collection date" else "Choose the first collection date",
            onClick = { onChange(row.copy(anchorDate = suggestedDay(row, today))) },
            modifier = Modifier.semantics { contentDescription = "$label: choose the collection date" },
            isEnabled = !locked,
        )
    } else {
        PickupDateButton(
            if (row.frequency == "once") "Collection date" else "First collection date",
            anchor,
            "$label collection date",
            enabled = !locked,
        ) { picked ->
            val day = picked.toString()
            // The end date can't precede the start.
            onChange(row.copy(anchorDate = day, untilDate = row.untilDate?.let { maxOf(it, day) }))
        }
        // Every other week the start date is the person's: when it is off the chosen days, say so before they save.
        row.startOffDay()?.let { words ->
            Text(
                words,
                fontSize = 12.sp,
                color = PantopusColors.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
    if (row.frequency != "once") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("End date (optional)", color = PantopusColors.appText, modifier = Modifier.weight(1f))
            Switch(
                checked = row.untilDate != null,
                onCheckedChange = { on -> onChange(row.copy(untilDate = if (on) row.anchorDate.ifEmpty { today } else null)) },
                enabled = !locked,
                modifier = Modifier.semantics { contentDescription = "$label end date (optional)" },
            )
        }
        runCatching { LocalDate.parse(row.untilDate.orEmpty()) }.getOrNull()?.let { until ->
            PickupDateButton("End date", until, "$label end date", enabled = !locked, min = anchor) {
                onChange(row.copy(untilDate = it.toString()))
            }
        }
    }
}

/** A collection date; tapping it opens the system date picker. */
@Composable
private fun PickupDateButton(
    title: String,
    date: LocalDate,
    description: String,
    enabled: Boolean,
    min: LocalDate? = null,
    onPick: (LocalDate) -> Unit,
) {
    val context = LocalContext.current
    val shown = date.format(PICKUP_DATE_FORMAT)
    GhostButton(
        "$title: $shown",
        onClick = {
            android.app.DatePickerDialog(
                context,
                { _, year, month, day -> onPick(LocalDate.of(year, month + 1, day)) },
                date.year,
                date.monthValue - 1,
                date.dayOfMonth,
            ).apply {
                if (min != null) datePicker.minDate = min.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
            }.show()
        },
        modifier = Modifier.semantics { contentDescription = "$description, $shown" },
        isEnabled = enabled,
    )
}

/**
 * Every week: the start date follows the chosen days (the server refuses a start date that isn't on one of them). Every
 * other week, and monthly, the date says which week or date it is, so it is never changed for the person.
 */
private val PickupCollection.everyWeek: Boolean get() = frequency == "weekly" && interval == 1

/** The start date on the next of the chosen days; none while no day is chosen. An end date never precedes it. */
private fun PickupCollection.withSuggestedStart(today: String): PickupCollection {
    val day = if (weekdays.isEmpty()) "" else suggestedDay(this, today)
    return copy(anchorDate = day, untilDate = untilDate?.let { maxOf(it, day) })
}

/**
 * What to say beside a weekly collection's start date while it isn't on one of the chosen days: "This date is a
 * Tuesday. Choose a first collection date that is a Thursday." ("Tuesday or Friday", "Monday, Wednesday or Friday").
 * Null when it fits.
 */
private fun PickupCollection.startOffDay(): String? {
    if (frequency != "weekly" || weekdays.isEmpty()) return null
    val start = runCatching { LocalDate.parse(anchorDate) }.getOrNull() ?: return null
    val (code, name) = WEEKDAYS[start.dayOfWeek.value - 1]
    if (code in weekdays) return null
    val days = WEEKDAYS.filter { it.first in weekdays }.map { it.second }
    val list = if (days.size > 1) "${days.dropLast(1).joinToString(", ")} or ${days.last()}" else days.single()
    return "This date is a $name. Choose a first collection date that is a $list."
}

/** Where choosing a date starts: the home's today, or for a weekly collection the first of its days from today. */
private fun suggestedDay(
    row: PickupCollection,
    today: String,
): String {
    val start = runCatching { LocalDate.parse(today) }.getOrNull()
    if (row.frequency != "weekly" || start == null) return today
    return (0L until WEEKLY_PICKUP_WINDOW_DAYS).map(start::plusDays)
        .firstOrNull { WEEKDAYS[it.dayOfWeek.value - 1].first in row.weekdays }?.toString() ?: today
}

@Composable
private fun CollectionWeekdays(
    row: PickupCollection,
    label: String,
    today: String,
    locked: Boolean,
    onChange: (PickupCollection) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        WEEKDAYS.forEach { (code, day) ->
            TextButton(
                onClick = {
                    val picked = row.copy(weekdays = if (code in row.weekdays) row.weekdays - code else row.weekdays + code)
                    // Every week, the start date follows the chosen days, also on a schedule already saved.
                    onChange(if (picked.everyWeek) picked.withSuggestedStart(today) else picked)
                },
                enabled = !locked,
                contentPadding = PaddingValues(0.dp),
                modifier =
                    Modifier.weight(1f).semantics {
                        contentDescription = "$label $day: ${if (code in row.weekdays) "Selected" else "Not selected"}"
                    },
            ) {
                Text(day.take(WEEKDAY_LABEL_LENGTH) + if (code in row.weekdays) "✓" else "", fontSize = 11.sp)
            }
        }
    }
}

private fun List<PickupCollection>.filledFrom(
    read: AIPickupScheduleReadingDto,
    today: String,
): List<PickupCollection> {
    val filled = PickupChoice("", "not_set", "").filledFrom(read, today)
    var result = this
    if (filled.weekday.isNotEmpty()) {
        val anchor =
            pickupDates(today, "weekly").firstOrNull { (date, _) ->
                WEEKDAYS[LocalDate.parse(date).dayOfWeek.value - 1].first == filled.weekday
            }?.first.orEmpty()
        result = result.filter { it.kind != "garbage" } +
            PickupCollection("garbage", weekdays = listOf(filled.weekday), anchorDate = anchor)
    }
    if (filled.frequency != "not_set" && filled.nextDate.isNotEmpty()) {
        val day = WEEKDAYS[LocalDate.parse(filled.nextDate).dayOfWeek.value - 1].first
        result = result.filter { it.kind != "recycling" } +
            PickupCollection(
                "recycling",
                interval = if (filled.frequency == "biweekly") 2 else 1,
                weekdays = listOf(day),
                anchorDate = filled.nextDate,
            )
    }
    return result
}

/** The dates the editor offers for the next recycling pickup: one cycle from the home's local today. */
private fun pickupDates(
    today: String,
    frequency: String,
): List<Pair<String, String>> {
    val start = runCatching { LocalDate.parse(today) }.getOrNull() ?: return emptyList()
    return (0L until if (frequency == "weekly") WEEKLY_PICKUP_WINDOW_DAYS else BIWEEKLY_PICKUP_WINDOW_DAYS).map { offset ->
        val date = start.plusDays(offset)
        date.toString() to date.format(DateTimeFormatter.ofPattern("EEEE, MMM d"))
    }
}

/** The editor's three fields. */
internal data class PickupChoice(
    val weekday: String,
    val frequency: String,
    val nextDate: String,
)

/** Only what the flyer shows changes; a field it doesn't show keeps the editor's value. */
internal fun PickupChoice.filledFrom(
    read: AIPickupScheduleReadingDto,
    today: String,
): PickupChoice {
    val day = read.garbageWeekday?.takeIf { code -> WEEKDAYS.any { it.first == code } } ?: weekday
    val cycle = read.recyclingFrequency?.takeIf { code -> FREQUENCIES.any { it.first == code } }
    val next =
        when (cycle) {
            null -> nextDate
            "not_set" -> ""
            else -> read.recyclingNextDate?.takeIf { date -> pickupDates(today, cycle).any { it.first == date } }.orEmpty()
        }
    return PickupChoice(day, cycle ?: frequency, next)
}

@Composable
private fun ScheduleChoice(
    label: String,
    value: String,
    choices: List<Pair<String, String>>,
    busy: Boolean,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label, color = PantopusColors.appTextSecondary, fontSize = 13.sp)
        Box {
            val selected = choices.find { it.first == value }?.second ?: "Choose"
            OutlinedButton(
                onClick = { expanded = true },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "$label: $selected" },
            ) {
                Text(selected, color = PantopusColors.appText)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                choices.forEach { (code, text) ->
                    DropdownMenuItem(text = { Text(text) }, enabled = !busy, onClick = {
                        expanded = false
                        onSelect(code)
                    })
                }
            }
        }
    }
}

/**
 * The only entry is an acknowledged first pickup save; dismissal sends no request. After the house's question on Today
 * ("Yes, remind me", [journey]) the answer is already given: the reminder goes on at once, and the sheet shows only if
 * something needs saying (it couldn't be turned on, or notifications are off).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("CyclomaticComplexMethod")
internal fun PickupReminderPrimer(
    actions: AddressCalendarActions,
    journey: PickupJourneyState? = null,
    /** The card shows the household's saved schedule: the page has finished reading itself again after the save. */
    scheduleShown: Boolean = true,
) {
    val homeId = actions.pickupPrimerHomeId?.collectAsStateWithLifecycle()?.value ?: return
    val context = LocalContext.current
    val prefs = remember(context) { context.applicationContext.getSharedPreferences("just_moved", Context.MODE_PRIVATE) }
    val shownKey = "pickupPrimer.shown.$homeId"
    val answered = remember(homeId) { journey?.takeAnswered() == true }
    val show = remember(homeId) { answered || !prefs.getBoolean(shownKey, false) }
    var busy by remember(homeId) { mutableStateOf(false) }
    var errorText by remember(homeId) { mutableStateOf<String?>(null) }
    var notificationsOff by remember(homeId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) actions.dismissPickupPrimer() else notificationsOff = true
        }
    LaunchedEffect(homeId, actions.calendarHomeId) {
        if (!show || actions.calendarHomeId != homeId) {
            actions.dismissPickupPrimer()
        } else {
            prefs.edit().putBoolean(shownKey, true).apply()
        }
    }
    if (!show || actions.calendarHomeId != homeId) return
    val onRemind: () -> Unit = {
        busy = true
        scope.launch {
            val timezone = ZoneId.systemDefault().id
            errorText =
                if (timezone in ZoneId.getAvailableZoneIds()) {
                    actions.enablePickupReminders(homeId, timezone)
                } else {
                    "Couldn't read your time zone. Try again."
                }
            busy = false
            if (errorText == null) {
                askPickupPermission(
                    context,
                    { permission.launch(Manifest.permission.POST_NOTIFICATIONS) },
                    { actions.dismissPickupPrimer() },
                    { notificationsOff = true },
                )
            }
        }
    }
    // The page reads itself again right after a save, and a request made across that read is refused as a changed
    // session. So the answer given on Today waits until the saved schedule shows, or a few seconds at most; after that
    // the sheet can say what went wrong and offer "Remind me".
    val saved by rememberUpdatedState(scheduleShown)
    LaunchedEffect(homeId) {
        if (answered) {
            withTimeoutOrNull(ANSWERED_WAIT_MS) { snapshotFlow { saved }.first { it } }
            onRemind()
        }
    }
    if (answered && errorText == null && !notificationsOff) return
    ModalBottomSheet(
        onDismissRequest = { if (!busy) actions.dismissPickupPrimer() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
    ) {
        PickupPrimerContent(
            busy = busy,
            errorText = errorText,
            notificationsOff = notificationsOff,
            onDismiss = actions::dismissPickupPrimer,
            onRemind = onRemind,
            onSettings = {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                runCatching { context.startActivity(intent) }
            },
        )
    }
}

@Composable
private fun PickupPrimerContent(
    busy: Boolean,
    errorText: String?,
    notificationsOff: Boolean,
    onDismiss: () -> Unit,
    onRemind: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        TextButton(onClick = onDismiss, enabled = !busy) { Text("Close") }
        Text("Your schedule is saved.", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.success)
        Text("Get a reminder the night before?", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
        Text(
            "One notification the evening before each pickup. Nothing on other days.",
            fontSize = 14.sp,
            color = PantopusColors.appTextSecondary,
        )
        errorText?.let { Text(it, fontSize = 13.sp, color = PantopusColors.error) }
        if (notificationsOff) {
            Text(
                "Notifications are off for Pantopus. Turn them on in Settings.",
                fontSize = 14.sp,
                color = PantopusColors.appTextSecondary,
            )
            GhostButton("Open Settings", onSettings, modifier = Modifier.fillMaxWidth())
        } else {
            GhostButton("Remind me", onRemind, modifier = Modifier.fillMaxWidth(), isLoading = busy, isEnabled = !busy)
        }
        GhostButton("Not now", onDismiss, modifier = Modifier.fillMaxWidth(), isEnabled = !busy)
    }
}

private fun askPickupPermission(
    context: Context,
    request: () -> Unit,
    enabled: () -> Unit,
    denied: () -> Unit,
) {
    if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        enabled()
    } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        denied()
    } else {
        val granted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        val activity = context.findFragmentActivity()
        when {
            granted -> enabled()
            activity == null || activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> denied()
            else -> request()
        }
    }
}
