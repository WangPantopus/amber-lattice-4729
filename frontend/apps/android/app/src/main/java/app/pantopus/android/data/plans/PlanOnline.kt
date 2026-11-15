package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.MyPlansResponse
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanPinDto
import app.pantopus.android.data.api.models.plans.PlanPinsResponse
import app.pantopus.android.data.api.models.plans.PlansListResponse
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.util.Locale

/*
 * Plans steps 3 and 4 (contract `CONTRACT-step3-4.md`): online plans, the four newer kinds, and reading safely what a
 * later server may add.
 */

/** Where a plan meets (`place_kind`): a public place, the host's home, or online (Plans step 3). */
object PlanPlaceKind {
    const val PUBLIC = "public"
    const val HOME = "home"
    const val ONLINE = "online"

    private val KNOWN = setOf(PUBLIC, HOME, ONLINE)

    /** A place kind this app can draw; none at all (an older server) reads as a public place. */
    fun isKnown(raw: String?): Boolean = raw == null || raw in KNOWN
}

/** An online plan (Plans step 3): people join with a link. No pin, no map, no directions and no distance. */
val PlanDto.isOnline: Boolean get() = placeKind == PlanPlaceKind.ONLINE

/**
 * A plan this app can draw: a kind and a place kind it knows. Anything else (a kind a later server adds) is left out of
 * every list and opens as "This plan isn't available", never drawn as something it isn't.
 */
val PlanDto.isDrawable: Boolean get() = planKind != null && PlanPlaceKind.isKnown(placeKind)

/** A pin of a kind this app can draw. */
val PlanPinDto.isDrawable: Boolean get() = planKind != null

/** The list without the plans this app can't draw. */
fun PlansListResponse.drawable(): PlansListResponse =
    if (items.all { it.isDrawable }) this else copy(items = items.filter { it.isDrawable })

/** The viewer's plans without the ones this app can't draw. */
fun MyPlansResponse.drawable(): MyPlansResponse =
    copy(
        hosting = hosting.filter { it.isDrawable },
        going = going.filter { it.isDrawable },
        asked = asked.filter { it.isDrawable },
        waitlisted = waitlisted.filter { it.isDrawable },
        invited = invited.filter { it.isDrawable },
        recent = recent.filter { it.isDrawable },
    )

/** The pins without the ones this app can't draw. */
fun PlanPinsResponse.drawable(): PlanPinsResponse =
    if (markers.all { it.isDrawable }) this else copy(markers = markers.filter { it.isDrawable })

/**
 * The link people join an online plan with, checked on the phone the way the server checks it
 * (`planPlace.parseOnlineLink`): trimmed, at most 300 characters, no spaces, an `https` URL whose host is a name with a
 * dot, never an IP address or `localhost`. The server's sentence is the one shown when it isn't.
 */
object PlanOnlineLink {
    const val MAX_LENGTH = 300

    /** The server's sentence for a link it refuses (422 `validation`). */
    const val PROBLEM = "Add the link people will join with. It has to start with https://"

    private val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")

    /** The link as it is saved, and the name of the site it opens ("meet.google.com", without a leading `www.`). */
    data class Parsed(
        val link: String,
        val host: String,
    )

    fun parse(raw: String?): Parsed? {
        val link = raw?.trim().orEmpty()
        val plain = link.none { it.isWhitespace() || it.isISOControl() }
        val url = link.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH && plain }?.toHttpUrlOrNull() ?: return null
        val host = url.host.lowercase(Locale.US).trimEnd('.')
        val refused =
            url.scheme != "https" ||
                '.' !in host ||
                ':' in host ||
                IPV4.matches(host) ||
                host == "localhost" ||
                host.endsWith(".localhost")
        return if (refused) null else Parsed(link, host.removePrefix("www."))
    }

    /** Why the link can't be posted (the server's sentence), or null when it can. */
    fun problem(raw: String?): String? = if (parse(raw) == null) PROBLEM else null
}

/**
 * The details of the four newer kinds (Plans step 4): each choice's wire value and words, in the order the chips show
 * them, the first being the server's default; the same words as on iPhone. "Something else" has none: its title says
 * what it is.
 */
object PlanKindDetails {
    val FOOD: List<Pair<String, String>> =
        listOf(
            "dinner" to "Dinner",
            "potluck" to "Potluck",
            "drinks" to "Drinks",
            "brunch" to "Brunch",
            "bbq" to "BBQ",
            "other" to "Other",
        )

    val GAMES: List<Pair<String, String>> =
        listOf(
            "board_games" to "Board games",
            "cards" to "Cards",
            "trivia" to "Trivia",
            "video_games" to "Video games",
            "other" to "Other",
        )

    val OUTDOORS: List<Pair<String, String>> =
        listOf(
            "hike" to "Hike",
            "bike_ride" to "Bike ride",
            "run" to "Run",
            "other" to "Other",
        )

    const val PACE_EASY = "easy"

    /** The words a plan page shows for a choice ("Potluck"); none for `other` or a value this app doesn't know. */
    fun label(
        choices: List<Pair<String, String>>,
        wire: String?,
    ): String? = choices.firstOrNull { it.first == wire && it.first != OTHER }?.second

    private const val OTHER = "other"
}
