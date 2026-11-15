package app.pantopus.android.ui.screens.plans.repeat

import app.pantopus.android.data.plans.PlanMonthDay
import app.pantopus.android.data.plans.PlanRepeatFreq
import app.pantopus.android.data.plans.PlanRepeatPattern
import app.pantopus.android.data.plans.PlanSeries
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * What the Repeats screen works from (Plans step 2): the plan's [start] and [end] as the host has them now, the series'
 * first date [anchor] (the plan's own date for a new series), which date of the series this plan is ([index]), the kind
 * (for "24 walks") and the pattern chosen so far ([initial]; null for "Doesn't repeat").
 */
data class PlanRepeatSetup(
    val start: LocalDateTime,
    val end: LocalDateTime?,
    val anchor: LocalDate = start.toLocalDate(),
    val index: Int = 1,
    val kind: String? = null,
    val walkKind: String? = null,
    val initial: PlanRepeatPattern? = null,
) {
    /** The plan's own date: its weekday (or its day of the month) is always one of the pattern's days. */
    val date: LocalDate get() = start.toLocalDate()

    val startWeekday: Int get() = date.dayOfWeek.value

    /** The earliest end date: the plan's own date (the server refuses one before it). */
    val firstEnd: LocalDate get() = date

    /** The latest end date: a year from the series' first date. */
    val lastEnd: LocalDate get() = PlanSeries.latestEnd(anchor)

    /** The fewest times: 2, and never fewer than this date's place in a running series. */
    val minCount: Int get() = maxOf(PlanSeries.MIN_COUNT, index)
}

/**
 * The Repeats screen's choices. Each frequency keeps its own days, so switching between them keeps what was picked; the
 * end keeps both its date and its count. Every change keeps what the server would refuse out: the plan's own day stays
 * on, there are 1 to 4 monthly days, the end date is within the year and the count 2 to 100.
 */
data class PlanRepeatEditor(
    val freq: PlanRepeatFreq?,
    val weekdays: Set<Int>,
    val monthDays: List<PlanMonthDay>,
    val endsOnDate: Boolean,
    val until: LocalDate,
    val count: Int,
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

    fun choose(freq: PlanRepeatFreq?): PlanRepeatEditor = copy(freq = freq)

    /** A day button: on or off, except the plan's own day, which stays on. */
    fun toggleDay(
        day: Int,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor {
        if (day == setup.startWeekday || day !in 1..7) return this
        return copy(weekdays = if (day in weekdays) weekdays - day else weekdays + day)
    }

    /** A monthly day can go unless it's the only one the plan's own date falls on. */
    fun canRemove(
        day: PlanMonthDay,
        setup: PlanRepeatSetup,
    ): Boolean = monthDays.size > 1 && (!day.matches(setup.date) || monthDays.count { it.matches(setup.date) } > 1)

    fun remove(
        day: PlanMonthDay,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = if (canRemove(day, setup)) copy(monthDays = monthDays - day) else this

    /** Up to 4 days a month. */
    val canAdd: Boolean get() = monthDays.size < PlanSeries.MONTH_DAYS

    fun add(day: PlanMonthDay): PlanRepeatEditor =
        if (!canAdd || !day.isValid || day in monthDays) this else copy(monthDays = (monthDays + day).sortedBy { it.order })

    fun endOnDate(onDate: Boolean): PlanRepeatEditor = copy(endsOnDate = onDate)

    fun withUntil(
        date: LocalDate,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = copy(until = PlanSeries.clamp(date, setup.firstEnd, setup.lastEnd), endsOnDate = true)

    fun withCount(
        times: Int,
        setup: PlanRepeatSetup,
    ): PlanRepeatEditor = copy(count = times.coerceIn(setup.minCount, PlanSeries.MAX_COUNT), endsOnDate = false)

    companion object {
        /**
         * The screen as it opens: the pattern chosen so far (moved to the plan's current date), else every week on the
         * plan's own weekday, "the 3rd Saturday" for a month, ending 12 weeks out; the count starts at what that end makes.
         */
        fun start(setup: PlanRepeatSetup): PlanRepeatEditor {
            val date = setup.date
            val initial = setup.initial?.alignedTo(date, setup.anchor)
            val monthly = initial?.freq == PlanRepeatFreq.MONTHLY
            val weekdays = initial?.weekdays?.takeIf { !monthly && it.isNotEmpty() } ?: setOf(setup.startWeekday)
            val monthDays = initial?.monthDays?.takeIf { monthly && it.isNotEmpty() } ?: listOf(PlanMonthDay.weekdayOf(date))
            val until = PlanSeries.clamp(initial?.until ?: PlanSeries.defaultUntil(date, setup.anchor), setup.firstEnd, setup.lastEnd)
            val probe = PlanRepeatPattern(initial?.freq ?: PlanRepeatFreq.WEEKLY, weekdays, monthDays, until = until, chosenFor = date)
            val count = (initial?.count ?: PlanSeries.total(probe, setup.anchor)).coerceIn(setup.minCount, PlanSeries.MAX_COUNT)
            return PlanRepeatEditor(
                freq = initial?.freq,
                weekdays = weekdays + setup.startWeekday,
                monthDays = monthDays,
                endsOnDate = initial?.count == null,
                until = until,
                count = count,
            )
        }
    }
}
