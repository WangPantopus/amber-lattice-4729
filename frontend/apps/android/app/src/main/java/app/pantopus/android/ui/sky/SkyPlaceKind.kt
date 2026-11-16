package app.pantopus.android.ui.sky

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * What a Pulse post's place tag names, as the server reads it (backend/utils/postPlaceTag.js): a town or an area, an
 * address, or anything else, a venue. Under the Sky only a venue where the draft's photo was taken (within 5 km, the
 * server's `mediaCaptureNear`) keeps an exact pin.
 */
enum class SkyPlaceKind {
    VENUE,
    ADDRESS,
    AREA,
    ;

    companion object {
        private val AREA_KINDS =
            setOf(
                "place", "locality", "neighborhood", "district", "region", "postcode", "country",
                "city", "town", "village", "hamlet", "suburb", "county", "state",
            )
        private val ADDRESS_KINDS = setOf("address", "street", "house")

        /** How far from a place a photo may have been taken and still count as taken there. */
        const val TAKEN_THERE_M = 5000.0

        /** Null with no tag. */
        fun of(
            placeId: String?,
            kind: String?,
        ): SkyPlaceKind? {
            if (placeId.isNullOrEmpty()) return null
            for (name in listOf(kind.orEmpty().lowercase(), placeId.substringBefore('.').lowercase())) {
                if (name in ADDRESS_KINDS) return ADDRESS
                if (name in AREA_KINDS) return AREA
            }
            return VENUE
        }

        /** The distance in metres between two points (haversine). */
        fun meters(
            lat1: Double,
            lng1: Double,
            lat2: Double,
            lng2: Double,
        ): Double {
            val dLat = Math.toRadians(lat2 - lat1)
            val dLng = Math.toRadians(lng2 - lng1)
            val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
            return 2 * EARTH_M * asin(min(1.0, sqrt(a)))
        }

        private const val EARTH_M = 6_371_000.0
    }
}
