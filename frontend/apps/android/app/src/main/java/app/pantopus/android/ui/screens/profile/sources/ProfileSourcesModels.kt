@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.ui.graphics.Color
import app.pantopus.android.ui.theme.PantopusColors
import java.time.LocalDate

/**
 * How we know a line (SPEC §2, "three inks"): Seen (Pantopus's own records), Signed (a named other party confirmed
 * it), Said (the person's own words). The ink always comes from the server; an app never raises one, and a value it
 * doesn't know reads as Said (SPEC §4.1).
 */
enum class ProfileInk(
    val word: String,
    internal val rank: Int,
) {
    Seen("Seen", 3),
    Signed("Signed", 2),
    Said("Said", 1),
    ;

    companion object {
        /** The server's `ink`; anything else (or nothing) is Said. */
        fun fromApi(value: String?): ProfileInk =
            when (value?.trim()?.lowercase()) {
                "seen" -> Seen
                "signed" -> Signed
                else -> Said
            }

        /** One month of a ring string: `0` none, `1` said, `2` signed, `3` seen; anything else is none. */
        fun fromDigit(digit: Char): ProfileInk? =
            when (digit) {
                '3' -> Seen
                '2' -> Signed
                '1' -> Said
                else -> null
            }
    }
}

/** The three lines through a year (SPEC §2): home, work, with others, in the app's home, business and personal colours. */
enum class ProfileLane(
    val key: String,
    val label: String,
) {
    Home("home", "Home"),
    Work("work", "Work"),
    Others("others", "With others"),
    ;

    val color: Color
        get() =
            when (this) {
                Home -> PantopusColors.home
                Work -> PantopusColors.business
                Others -> PantopusColors.personal
            }

    companion object {
        fun fromApi(value: String?): ProfileLane? = entries.firstOrNull { it.key == value?.trim()?.lowercase() }
    }
}

/** One line anywhere on the page (contract §3.1): `{ ink, text, how, lane, link }`. */
data class ProfileLine(
    val ink: ProfileInk,
    val text: String,
    val how: String? = null,
    val lane: ProfileLane? = null,
    val link: ProfilePageLink? = null,
)

/**
 * The person's rings (SPEC §3 `header.rings`): one 12-character string a year from [from], per month `0` none, `1`
 * said, `2` signed, `3` seen, for each lane. Always whole: the mark is the person's, not a part.
 */
data class ProfileRings(
    val from: Int,
    val now: LocalDate,
    val home: List<String> = emptyList(),
    val work: List<String> = emptyList(),
    val others: List<String> = emptyList(),
) {
    /** The years drawn, oldest first: [from] to this year (at least one). */
    val years: List<Int>
        get() {
            val last = maxOf(now.year, from + maxOf(home.size, work.size, others.size) - 1, from)
            return (from..last).toList()
        }

    /** A lane's months, one list of 12 a year in [years] order; a missing year or month is none. */
    fun lane(lane: ProfileLane): List<List<ProfileInk?>> {
        val rows =
            when (lane) {
                ProfileLane.Home -> home
                ProfileLane.Work -> work
                ProfileLane.Others -> others
            }
        return years.indices.map { i -> monthsOf(rows.getOrNull(i)) }
    }

    /** The strongest ink per month across the three lanes (the mark around a portrait). */
    fun merged(): List<List<ProfileInk?>> {
        val lanes = ProfileLane.entries.map(::lane)
        return years.indices.map { y ->
            (0 until MONTHS).map { m -> lanes.mapNotNull { it[y][m] }.maxByOrNull { it.rank } }
        }
    }

    /** Where this year is drawn to: the month index plus the part of this month gone (Nov 23 is 10.77). */
    val nowFraction: Float
        get() = now.monthValue - 1 + now.dayOfMonth.toFloat() / now.lengthOfMonth()

    /** Whether any month on any lane is Seen. */
    val hasAnySeen: Boolean
        get() = merged().any { row -> row.any { it == ProfileInk.Seen } }

    companion object {
        const val MONTHS = 12

        internal fun monthsOf(row: String?): List<ProfileInk?> = (0 until MONTHS).map { m -> row?.getOrNull(m)?.let(ProfileInk::fromDigit) }
    }
}

/** A run of months with one ink on one ring: [start] to [end] in months (0 = January's start, 12 = December's end). */
internal data class RingRun(
    val start: Float,
    val end: Float,
    val ink: ProfileInk,
)

/**
 * The runs of a 12-month row (`make_assets.py` `runs`): consecutive months with the same ink join. [lastFraction]
 * trims the final run at the growing edge (this year, up to today).
 */
internal fun ringRuns(
    row: List<ProfileInk?>,
    lastFraction: Float? = null,
): List<RingRun> {
    val out = mutableListOf<RingRun>()
    var i = 0
    while (i < ProfileRings.MONTHS) {
        val ink = row.getOrNull(i)
        if (ink == null) {
            i++
            continue
        }
        var j = i
        while (j < ProfileRings.MONTHS && row.getOrNull(j) == ink) j++
        out += RingRun(i.toFloat(), j.toFloat(), ink)
        i = j
    }
    if (lastFraction != null && out.isNotEmpty()) {
        val last = out.last()
        out[out.lastIndex] = last.copy(end = minOf(last.end, lastFraction))
    }
    return out.filter { it.end > it.start }
}

/** The page's summary (SPEC §3 `summary`), worked out by the server from shown parts only. */
data class ProfileSummary(
    val years: Int,
    val seenMonths: Int,
    val signedMonths: Int,
    val saidMonths: Int,
) {
    val totalMonths: Int get() = seenMonths + signedMonths + saidMonths
}

/** "8 months", "1 year", "9 years": a span of months in plain words. */
fun monthsInWords(months: Int): String =
    when {
        months < 12 -> if (months == 1) "1 month" else "$months months"
        months < 24 -> "1 year"
        else -> "${months / 12} years"
    }

/** "12 years on record"; "1 year on record" for someone whose first ring is this year. */
fun yearsOnRecord(years: Int): String =
    when {
        years <= 1 -> "1 year on record"
        else -> "$years years on record"
    }
