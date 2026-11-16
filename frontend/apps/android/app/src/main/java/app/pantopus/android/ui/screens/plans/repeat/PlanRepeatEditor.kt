package app.pantopus.android.ui.screens.plans.repeat

import app.pantopus.android.data.plans.PlanMonthDay
import app.pantopus.android.data.plans.PlanRepeatFreq
import app.pantopus.android.data.plans.PlanRepeatPattern
import app.pantopus.android.data.plans.PlanSeries
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * What the Repeats screen works from (Plans step 2): the plan's [start] and [end] as the host has them now, the kind
 * (for "24 walks") and the pattern chosen so far ([initial]; null for "Doesn't repeat"). A pattern starts at this plan's
 * date, whichever date of its series it is (contract step 2, "Changing the pattern on any date"): its days, its year and
 * its count are measured from here.
 */
data class PlanRepeatSetup(
    val start: LocalDateTime,
    val end: LocalDateTime?,
    val kind: String? = null,
    val walkKind: String? = null,
    val initial: PlanRepeatPattern? = null,
) {
    /** The plan's own date: its weekday (or its day of the month) is always one of the pattern's days. */
    val date: LocalDate get() = start.toLocalDate()

    /** Where the pattern starts: this plan's date. */
    val anchor: LocalDate get() = date

    val startWeekday: Int get() = date.dayOfWeek.value

    /** The latest end date: a year from this plan's date. (The earliest depends on the pattern: [PlanRepeatEditor.firstEnd].) */
    val lastEnd: LocalDate get() = PlanSeries.latestEnd(anchor)

    /**
     * The fewest times: 2 (the server's least). On a series' last date the card's count is 1, so "After a number of
     * times" there adds a date.
     */
    val minCount: Int get() = PlanSeries.MIN_COUNT
}

/**
 * The Repeats screen's choices. Each frequency keeps its own days, so switching between them keeps what was picked; the
 * end keeps both its date and its count. Every change keeps what the server would refuse out: the plan's own day stays
 * on, there are 1 to 4 monthly days, the end date is from the pattern's second date to a year out and the count 2 to 100.
 * [ownCount] is true when the count is the person's own (set in this visit, or the card's).
 */
data class PlanRepeatEditor(
    val freq: PlanRepeatFreq?,
    val weekdays: Set<Int>,
    val monthDays: List<PlanMonthDay>,
    val endsOnDate: Boolean,
    val until: LocalDate,
    val count: Int,
    val ownCount: Boolean = false,
) {
    /** The pattern these choices make for [setup]'s plan, or null for "Doesn't repeat". */
    fun pattern(setup: PlanRepeatSetup): PlanRepeatPattern? {
        val chosen = freq ?: return null
        val monthly = chosen == PlanRepeatFreq.MONTHLY
        return PlanRepeatPattern(
            freq = chosen,
            weekdays = if (monthly) emptySet() else weekdays + setup.startWeekday,
            monthDays = if (monthly) monthDays.sortedBy { it.order } else emptyList(),
            until = until.takeIf { endsOnDate },
            count = count.takeUnless { endsOnDate },
            chosenFor = setup.date,
        )
    }

    /** A frequency; an end date before the new pattern's second date moves on ([withTwoDates]). */
    fun choose(
        freq: PlanRepeatFreq?,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = copy(freq = freq).withTwoDates(setup)

    /**
     * The earliest end date: the pattern's second date (the first day after the plan's own date that it lands on), so a
     * repeating plan has two dates at least. While it doesn't repeat (no end shows), the day after the plan's date.
     */
    fun firstEnd(setup: PlanRepeatSetup): LocalDate =
        pattern(setup)?.let { PlanSeries.secondDate(it, setup.anchor) } ?: setup.date.plusDays(1)

    /**
     * The end date moved on when the pattern's second date is now after it: to the 12-week default, or the second date
     * when that is later. The summary never reads "1 time".
     */
    private fun withTwoDates(setup: PlanRepeatSetup): PlanRepeatEditor {
        val chosen = pattern(setup) ?: return this
        return copy(until = PlanSeries.untilWithTwoDates(until, chosen, setup.date, setup.anchor))
    }

    /**
     * The days these choices show differ from [given] (the pattern the screen was opened with): it was moved to the
     * plan's new date ("Every Tue" became "Every Wed"). Its end date or count alone doesn't count.
     */
    fun daysDifferFrom(
        given: PlanRepeatPattern?,
        setup: PlanRepeatSetup,
    ): Boolean {
        val shown = pattern(setup)
        if (shown == null || given == null) return false
        return shown.freq != given.freq ||
            shown.weekdays != given.weekdays ||
            shown.monthDays.sortedBy { it.order } != given.monthDays.sortedBy { it.order }
    }

    /** A day button: on or off, except the plan's own day, which stays on. A day turned off can move the end on. */
    fun toggleDay(
        day: Int,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor {
        if (day == setup.startWeekday || day !in 1..7) return this
        return copy(weekdays = if (day in weekdays) weekdays - day else weekdays + day).withTwoDates(setup)
    }

    /** A monthly day can go unless it's the only one the plan's own date falls on. */
    fun canRemove(
        day: PlanMonthDay,
        setup: PlanRepeatSetup,
    ): Boolean = monthDays.size > 1 && (!day.matches(setup.date) || monthDays.count { it.matches(setup.date) } > 1)

    fun remove(
        day: PlanMonthDay,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = if (canRemove(day, setup)) copy(monthDays = monthDays - day).withTwoDates(setup) else this

    /** Up to 4 days a month. */
    val canAdd: Boolean get() = monthDays.size < PlanSeries.MONTH_DAYS

    fun add(day: PlanMonthDay): PlanRepeatEditor =
        if (!canAdd || !day.isValid || day in monthDays) this else copy(monthDays = (monthDays + day).sortedBy { it.order })

    /**
     * Ends on a date, or after a number of times. The count starts at the number of dates the end date gives now (2 to
     * 100), so switching between the two keeps the same series; a count of the person's own ([ownCount]) is kept.
     */
    fun endOnDate(
        onDate: Boolean,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor {
        val byDate = copy(endsOnDate = true).pattern(setup)
        if (onDate || ownCount || byDate == null) return copy(endsOnDate = onDate)
        val times = PlanSeries.total(byDate, setup.anchor).coerceIn(setup.minCount, PlanSeries.MAX_COUNT)
        return copy(endsOnDate = false, count = times)
    }

    fun withUntil(
        date: LocalDate,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = copy(until = PlanSeries.clamp(date, firstEnd(setup), setup.lastEnd), endsOnDate = true)

    fun withCount(
        times: Int,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = copy(count = times.coerceIn(setup.minCount, PlanSeries.MAX_COUNT), endsOnDate = false, ownCount = true)

    companion object {
        /**
         * The screen as it opens: the pattern chosen so far (moved to the plan's current date), its end date or count as
         * the card has them, else every week on the plan's own weekday, "the 3rd Saturday" for a month, ending 12 weeks
         * out. An end date before the pattern's second date (it would leave one date) opens moved on. The count starts at
         * what that end makes (and at least 2) until the person sets one; a card's count is kept.
         */
        fun start(setup: PlanRepeatSetup): PlanRepeatEditor {
            val date = setup.date
            val initial = setup.initial?.alignedTo(date, setup.anchor)
            val monthly = initial?.freq == PlanRepeatFreq.MONTHLY
            val weekdays = initial?.weekdays?.takeIf { !monthly && it.isNotEmpty() } ?: setOf(setup.startWeekday)
            val monthDays = initial?.monthDays?.takeIf { monthly && it.isNotEmpty() } ?: listOf(PlanMonthDay.weekdayOf(date))
            val freq = initial?.freq ?: PlanRepeatFreq.WEEKLY
            val probe = PlanRepeatPattern(freq, weekdays + setup.startWeekday, monthDays, chosenFor = date)
            val chosenEnd = PlanSeries.earlier(initial?.until ?: PlanSeries.defaultUntil(date, setup.anchor), setup.lastEnd)
            val until = PlanSeries.untilWithTwoDates(chosenEnd, probe, date, setup.anchor)
            val dates = initial?.count ?: PlanSeries.total(probe.copy(until = until), setup.anchor)
            val count = dates.coerceIn(setup.minCount, PlanSeries.MAX_COUNT)
            return PlanRepeatEditor(
                freq = initial?.freq,
                weekdays = weekdays + setup.startWeekday,
                monthDays = monthDays,
                endsOnDate = initial?.count == null,
                until = until,
                count = count,
                ownCount = initial?.count != null,
            )
        }
    }
}
