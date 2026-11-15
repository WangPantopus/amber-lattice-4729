@file:Suppress("MagicNumber", "TooManyFunctions")

package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanMonthDayDto
import app.pantopus.android.data.api.models.plans.PlanRepeatDto
import app.pantopus.android.data.api.models.plans.PlanRepeatInput
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/*
 * Repeating plans (Plans step 2, founder 2026-11-14). The pattern, its dates and its words, worked out on the phone the
 * way the server works them out (backend/services/plans/planSeries.js), so the Repeats screen's "Last on" and count match
 * what the server answers once the plan is posted.
 */

/** How often a plan repeats (`repeat.freq`). */
enum class PlanRepeatFreq(
    val wire: String,
) {
    WEEKLY("weekly"),
    BIWEEKLY("biweekly"),
    MONTHLY("monthly"),
    ;

    companion object {
        fun from(wire: String?): PlanRepeatFreq? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * One day of a monthly pattern: a weekday of one week of the month ([week] 1 to 4, or [LAST_WEEK]; [weekday] Monday 1 to
 * Sunday 7: "the 1st Saturday") or a date ([day] 1 to 31: "the 15th").
 */
data class PlanMonthDay(
    val week: Int? = null,
    val weekday: Int? = null,
    val day: Int? = null,
) {
    /** Whether [date] is this day of its month (a 31st never falls in a 30-day month: that month is skipped). */
    fun matches(date: LocalDate): Boolean {
        if (day != null) return date.dayOfMonth == day
        if (week == null || weekday == null || date.dayOfWeek.value != weekday) return false
        return if (week == LAST_WEEK) date.plusDays(7).month != date.month else weekNumber(date) == week
    }

    val isValid: Boolean
        get() =
            if (day != null) {
                day in 1..31
            } else {
                week != null && weekday != null && week in WEEKS && weekday in 1..7
            }

    /** Where it sorts among a pattern's days: weekdays of a week first (by week, the last after the 4th, then weekday), then dates. */
    val order: Int
        get() {
            if (day != null) return DATE_ORDER + day
            val weekOrder = if (week == LAST_WEEK) 5 else week ?: 0
            return weekOrder * 10 + (weekday ?: 0)
        }

    fun toDto(): PlanMonthDayDto = if (day != null) PlanMonthDayDto(day = day) else PlanMonthDayDto(week = week, weekday = weekday)

    companion object {
        const val LAST_WEEK = -1
        val WEEKS = listOf(1, 2, 3, 4, LAST_WEEK)
        private const val DATE_ORDER = 100

        /** "The 3rd Saturday" for [date]; a 5th one is "the last". */
        fun weekdayOf(date: LocalDate): PlanMonthDay = PlanMonthDay(week = weekOf(date), weekday = date.dayOfWeek.value)

        /** "The 21st" for [date]. */
        fun dateOf(date: LocalDate): PlanMonthDay = PlanMonthDay(day = date.dayOfMonth)

        fun weekOf(date: LocalDate): Int = weekNumber(date).let { if (it > 4) LAST_WEEK else it }

        /** Which week of its month [date] falls in, 1 to 5 (the server's `Math.ceil(day / 7)`). */
        private fun weekNumber(date: LocalDate): Int = (date.dayOfMonth + 6) / 7

        fun from(dto: PlanMonthDayDto): PlanMonthDay? {
            val rule = if (dto.day != null) PlanMonthDay(day = dto.day) else PlanMonthDay(week = dto.week, weekday = dto.weekday)
            return rule.takeIf { it.isValid }
        }
    }
}

/**
 * A repeat pattern as the phone holds it: [weekdays] (Monday 1 to Sunday 7) for weekly and every-2-weeks plans,
 * [monthDays] for monthly ones, and [until] (the last day it may fall on) or [count] (how many dates in all).
 * [chosenFor] is the plan's own date it was chosen for: a new start moves the start's pre-selected day along.
 */
data class PlanRepeatPattern(
    val freq: PlanRepeatFreq,
    val weekdays: Set<Int> = emptySet(),
    val monthDays: List<PlanMonthDay> = emptyList(),
    val until: LocalDate? = null,
    val count: Int? = null,
    val chosenFor: LocalDate? = null,
) {
    /** The `repeat` the create and change bodies send: the days that go with [freq], and [until] or [count]. */
    fun toInput(): PlanRepeatInput =
        PlanRepeatInput(
            freq = freq.wire,
            weekdays = weekdays.sorted().takeIf { freq != PlanRepeatFreq.MONTHLY },
            monthDays = monthDays.sortedBy { it.order }.map { it.toDto() }.takeIf { freq == PlanRepeatFreq.MONTHLY },
            until = until?.takeIf { count == null }?.toString(),
            count = count,
        )

    /**
     * This pattern for a plan whose own date is now [date] (where the pattern starts: [anchor]): the old date's pre-selected
     * day moves to the new one, and an end date it no longer fits (or the default 12 weeks out) follows it.
     */
    fun alignedTo(
        date: LocalDate,
        anchor: LocalDate,
    ): PlanRepeatPattern {
        val from = chosenFor ?: date
        val days = if (freq == PlanRepeatFreq.MONTHLY) weekdays else alignedWeekdays(from, date)
        val months = if (freq == PlanRepeatFreq.MONTHLY) alignedMonthDays(from, date) else monthDays
        val defaultEnd = until != null && until == PlanSeries.defaultUntil(from, anchor)
        val end =
            until?.let { current ->
                if (defaultEnd || current.isBefore(date)) {
                    PlanSeries.defaultUntil(date, anchor)
                } else {
                    PlanSeries.earlier(current, PlanSeries.latestEnd(anchor))
                }
            }
        return copy(weekdays = days, monthDays = months, until = end, chosenFor = date)
    }

    private fun alignedWeekdays(
        from: LocalDate,
        date: LocalDate,
    ): Set<Int> {
        val day = date.dayOfWeek.value
        if (day in weekdays) return weekdays
        return weekdays - from.dayOfWeek.value + day
    }

    private fun alignedMonthDays(
        from: LocalDate,
        date: LocalDate,
    ): List<PlanMonthDay> {
        if (monthDays.any { it.matches(date) }) return monthDays
        val old = monthDays.indexOfFirst { it.matches(from) }
        val moved = if (old >= 0 && monthDays[old].day != null) PlanMonthDay.dateOf(date) else PlanMonthDay.weekdayOf(date)
        val kept = if (old >= 0) monthDays.filterIndexed { index, _ -> index != old } else monthDays.take(PlanSeries.MONTH_DAYS - 1)
        return (kept + moved).distinct().sortedBy { it.order }
    }

    companion object {
        /** The pattern a card carries, or null when it doesn't repeat (or the server sent something this app can't read). */
        fun from(dto: PlanRepeatDto?): PlanRepeatPattern? {
            val freq = PlanRepeatFreq.from(dto?.freq) ?: return null
            return PlanRepeatPattern(
                freq = freq,
                weekdays = dto?.weekdays.orEmpty().filter { it in 1..7 }.toSet(),
                monthDays = dto?.monthDays.orEmpty().mapNotNull(PlanMonthDay::from),
                until = dto?.until?.let { runCatching { LocalDate.parse(it) }.getOrNull() },
                count = dto?.count,
            )
        }
    }
}

/** The series' dates, worked out as the server does (planSeries.js `matches`, `datesAfter`, `totalOf`, `lastOn`). */
object PlanSeries {
    /** A pattern runs for a year at most (from the date it starts on), and for 2 to 100 dates. */
    const val MAX_DAYS = 366L
    const val MIN_COUNT = 2
    const val MAX_COUNT = 100
    const val DEFAULT_WEEKS = 12L

    /** Up to 4 days a month. */
    const val MONTH_DAYS = 4

    /** The earlier of two dates (`minOf` would answer a `ChronoLocalDate`). */
    fun earlier(
        a: LocalDate,
        b: LocalDate,
    ): LocalDate = if (a.isAfter(b)) b else a

    /** [date] kept within [first] and [last]. */
    fun clamp(
        date: LocalDate,
        first: LocalDate,
        last: LocalDate,
    ): LocalDate =
        when {
            date.isBefore(first) -> first
            date.isAfter(last) -> last
            else -> date
        }

    /** The last day a series that starts on [anchor] may end on. */
    fun latestEnd(anchor: LocalDate): LocalDate = anchor.plusDays(MAX_DAYS)

    /** The end date the Repeats screen starts with: 12 weeks after [date], within the year. */
    fun defaultUntil(
        date: LocalDate,
        anchor: LocalDate,
    ): LocalDate = earlier(date.plusWeeks(DEFAULT_WEEKS), latestEnd(anchor))

    /** Whether [date] is one of the pattern's days ([anchor]: the date it starts on, which every-2-weeks counts from). */
    fun matches(
        pattern: PlanRepeatPattern,
        date: LocalDate,
        anchor: LocalDate,
    ): Boolean =
        when (pattern.freq) {
            PlanRepeatFreq.MONTHLY -> pattern.monthDays.any { it.matches(date) }
            PlanRepeatFreq.WEEKLY -> date.dayOfWeek.value in pattern.weekdays
            PlanRepeatFreq.BIWEEKLY -> date.dayOfWeek.value in pattern.weekdays && evenWeeksApart(date, anchor)
        }

    private fun evenWeeksApart(
        date: LocalDate,
        anchor: LocalDate,
    ): Boolean = (ChronoUnit.DAYS.between(mondayOf(anchor), mondayOf(date)) / 7) % 2 == 0L

    private fun mondayOf(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    /** The pattern's dates after [after], in order, up to its end date and the year's end. */
    fun datesAfter(
        pattern: PlanRepeatPattern,
        after: LocalDate,
        anchor: LocalDate,
    ): Sequence<LocalDate> {
        val last = pattern.until?.takeIf { pattern.count == null }?.let { earlier(it, latestEnd(anchor)) } ?: latestEnd(anchor)
        return generateSequence(after.plusDays(1)) { it.plusDays(1) }
            .takeWhile { !it.isAfter(last) }
            .filter { matches(pattern, it, anchor) }
    }

    /**
     * The pattern's dates from its first ([anchor], this plan's date: a pattern set on any date of a series starts there)
     * on: its end date's matching days, or its count of them; a count that can't fit in the year ends with the year
     * (planSeries.js `runOf`), so the numbers match what the server will post.
     */
    private fun run(
        pattern: PlanRepeatPattern,
        anchor: LocalDate,
    ): List<LocalDate> {
        val after = datesAfter(pattern, anchor, anchor)
        val counted = pattern.count?.let { after.take((it - 1).coerceAtLeast(0)) } ?: after
        return listOf(anchor) + counted.toList()
    }

    /** How many dates the pattern makes from [anchor] on, [anchor] included. */
    fun total(
        pattern: PlanRepeatPattern,
        anchor: LocalDate,
    ): Int = run(pattern, anchor).size

    /** The pattern's last date from [anchor] on. */
    fun lastOn(
        pattern: PlanRepeatPattern,
        anchor: LocalDate,
    ): LocalDate = run(pattern, anchor).last()
}

/** The words for a repeating plan (planSeries.js `patternText` for the pattern itself, the boards for the rest). */
object PlanRepeatWords {
    private val locale: Locale get() = Locale.US
    private val dateShort: DateTimeFormatter get() = DateTimeFormatter.ofPattern("EEE, MMM d", locale)
    private val monthDay: DateTimeFormatter get() = DateTimeFormatter.ofPattern("MMM d", locale)
    private val clock: DateTimeFormatter get() = DateTimeFormatter.ofPattern("h:mm a", locale)

    /** A date this many months past the one it is read against carries its year. */
    private const val YEAR_SHOWN_AFTER_MONTHS = 10L

    /**
     * "Feb 4", or "Nov 14, 2027" when the date is so far past [from] that it could be read as this year's (a series may
     * end a year after its date: "First on Sun, Nov 15. Last on Sun, Nov 14, 2027.").
     */
    private fun LocalDate.said(
        pattern: DateTimeFormatter,
        from: LocalDate = LocalDate.now(),
    ): String = if (isAfter(from.plusMonths(YEAR_SHOWN_AFTER_MONTHS))) "${format(pattern)}, $year" else format(pattern)

    val WEEKDAYS = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    private val SHORT = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

    /** The Repeats row's value when a plan doesn't repeat. */
    const val NONE = "Doesn't repeat"

    /** Said on the next date's page once its host skipped the date before ("Skip Thursday"). */
    const val SKIPPED_NEXT = "Skipped. The people who were in were told. This is the next date."

    /** Said after "Cancel this date" (or a skip that couldn't post a next date). */
    const val CANCELLED_NEXT = "This date is cancelled. Everyone has been told, and the next date is posted."
    const val CANCELLED_NO_NEXT = "This date is cancelled. Everyone has been told. No next date was posted."

    /** Said after "Stop repeating". */
    const val STOPPED = "Stopped repeating. This date stays."

    /** "1st" … "4th", "last". */
    fun weekWord(week: Int?): String =
        when (week) {
            1 -> "1st"
            2 -> "2nd"
            3 -> "3rd"
            4 -> "4th"
            else -> "last"
        }

    /** "1st", "2nd", "11th", "21st". */
    fun nth(n: Int): String {
        val tail = n % 100
        val suffix =
            when {
                tail in 11..13 -> "th"
                n % 10 == 1 -> "st"
                n % 10 == 2 -> "nd"
                n % 10 == 3 -> "rd"
                else -> "th"
            }
        return "$n$suffix"
    }

    /** "a", "a and b", "a, b and c". */
    fun listText(items: List<String>): String =
        if (items.size <= 1) {
            items.joinToString("")
        } else {
            "${items.dropLast(1).joinToString(", ")} and ${items.last()}"
        }

    /** "1st Saturday" or "15th": a monthly day without "the". */
    fun monthDayText(
        day: PlanMonthDay,
        short: Boolean = false,
    ): String {
        day.day?.let { return nth(it) }
        val names = if (short) SHORT else WEEKDAYS
        return "${weekWord(day.week)} ${names[((day.weekday ?: 1) - 1).coerceIn(0, 6)]}"
    }

    /** A monthly day's row on the Repeats screen: "The 1st Saturday", "The 15th". */
    fun monthDayRow(day: PlanMonthDay): String = "The ${monthDayText(day)}"

    /**
     * "Every Tuesday and Thursday", "Every day", "Every 2 weeks on Friday", "The 1st and 3rd Saturday of each month"; short:
     * "Every Tue and Thu", "Monthly on the 1st and 3rd Sat".
     */
    fun patternText(
        chosen: PlanRepeatPattern,
        short: Boolean = false,
    ): String {
        val names = if (short) SHORT else WEEKDAYS
        if (chosen.freq == PlanRepeatFreq.MONTHLY) {
            val days = chosen.monthDays.sortedBy { it.order }
            val first = days.firstOrNull()
            val sameWeekday = days.size > 1 && first?.weekday != null && days.all { it.day == null && it.weekday == first.weekday }
            val said =
                if (sameWeekday && first != null) {
                    "${listText(days.map { weekWord(it.week) })} ${names[((first.weekday ?: 1) - 1).coerceIn(0, 6)]}"
                } else {
                    listText(days.map { monthDayText(it, short) })
                }
            return if (short) "Monthly on the $said" else "The $said of each month"
        }
        val days = chosen.weekdays.sorted().filter { it in 1..7 }.map { names[it - 1] }
        return when {
            chosen.freq == PlanRepeatFreq.BIWEEKLY -> "Every 2 weeks on ${listText(days)}"
            days.size == 7 -> "Every day"
            else -> "Every ${listText(days)}"
        }
    }

    /** The Repeats row's value: the pattern's short words, or "Doesn't repeat". */
    fun rowValue(chosen: PlanRepeatPattern?): String = chosen?.let { patternText(it, short = true) } ?: NONE

    /** A card's line: "Every Tue and Thu until Feb 4" (the server's short words, else the phone's). */
    fun cardLine(repeat: PlanRepeatDto?): String? {
        val short = cardShort(repeat) ?: return null
        val last = repeat?.lastOn?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        return if (last != null) "$short until ${last.said(monthDay)}" else short
    }

    /** The host's card under its title: "Every Tue and Thu · 6:30 AM". */
    fun hostCardLine(plan: PlanDto): String? {
        val short = cardShort(plan.repeat) ?: return null
        val start = PlanFormat.instant(plan.startsAt)?.atZone(PlanFormat.zone(plan.timezone)) ?: return short
        return "$short · ${start.format(clock)}"
    }

    private fun cardShort(repeat: PlanRepeatDto?): String? =
        repeat?.shortText?.takeIf(String::isNotBlank) ?: PlanRepeatPattern.from(repeat)?.let { patternText(it, short = true) }

    /** The host's well: "Next: Thu, Nov 19" (this date) and "2 of 24 · ends Thu, Feb 4". */
    fun nextLine(plan: PlanDto): String {
        val start = PlanFormat.instant(plan.startsAt)?.atZone(PlanFormat.zone(plan.timezone))?.toLocalDate() ?: plan.localDate
        return start?.let { "Next: ${it.format(dateShort)}" } ?: "Next"
    }

    fun progressLine(repeat: PlanRepeatDto): String {
        val index = repeat.index ?: 1
        val total = repeat.total ?: index
        val last = repeat.lastOn?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        return listOfNotNull("$index of $total", last?.let { "ends ${it.said(dateShort)}" }).joinToString(" · ")
    }

    /** A draft's line on the preview: "Every Tue and Thu until Feb 4" (the pattern starting on [anchor]). */
    fun draftLine(
        chosen: PlanRepeatPattern,
        anchor: LocalDate,
    ): String = "${patternText(chosen, short = true)} until ${PlanSeries.lastOn(chosen, anchor).said(monthDay, anchor)}"

    /** "Thursday": the weekday this plan falls on, for "Skip Thursday". */
    fun weekdayOf(plan: PlanDto): String {
        val date = PlanFormat.instant(plan.startsAt)?.atZone(PlanFormat.zone(plan.timezone))?.toLocalDate() ?: plan.localDate
        return date?.let { WEEKDAYS[it.dayOfWeek.value - 1] } ?: "this date"
    }

    /** The summary's bold line: "Every Tuesday and Thursday, 6:30–7:30 AM". */
    fun summaryTitle(
        chosen: PlanRepeatPattern,
        start: LocalDateTime,
        end: LocalDateTime?,
    ): String = "${patternText(chosen)}, ${PlanFormat.timeRange(start.atZone(ZoneOffset.UTC), end?.atZone(ZoneOffset.UTC))}"

    /** The summary's small line: "First on Tue, Nov 17. Last on Thu, Feb 4. 24 walks." */
    fun summaryLine(
        chosen: PlanRepeatPattern,
        anchor: LocalDate,
        kind: String?,
        walkKind: String?,
    ): String {
        val last = PlanSeries.lastOn(chosen, anchor)
        val total = PlanSeries.total(chosen, anchor)
        return "First on ${anchor.format(dateShort)}. Last on ${last.said(dateShort, anchor)}. ${countWords(total, kind, walkKind)}."
    }

    /** "24 walks", "6 times": a short noun for the kind, else "times" (the contract's rule). */
    fun countWords(
        count: Int,
        kind: String?,
        walkKind: String?,
    ): String {
        val (one, many) =
            when {
                kind == PlanKind.WALK_COFFEE.wire && walkKind != "coffee" -> "walk" to "walks"
                kind == PlanKind.PLAYDATE.wire -> "playdate" to "playdates"
                kind == PlanKind.PICKUP_GAME.wire -> "game" to "games"
                else -> "time" to "times"
            }
        return "$count ${if (count == 1) one else many}"
    }

    /** The end date as the Ends row shows it: "Thu, Feb 4". */
    fun endDate(date: LocalDate): String = date.said(dateShort)

    /** The count as the Ends row shows it: "6 times". */
    fun times(count: Int): String = if (count == 1) "1 time" else "$count times"
}

/** A plan that repeats (its card carries `repeat`). */
val PlanDto.repeats: Boolean get() = PlanRepeatFreq.from(repeat?.freq) != null

/**
 * The series goes on after this date: a later date is (or will be) posted. False for a plan that doesn't repeat and for
 * a series' last date. "Host again" waits for the series to end; Skip and "Cancel this date" need a date to follow.
 */
val PlanDto.seriesContinues: Boolean
    get() {
        val r = repeat?.takeIf { repeats } ?: return false
        return (r.index ?: 1) < (r.total ?: Int.MAX_VALUE)
    }
