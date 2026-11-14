@file:Suppress("PackageNaming")

package app.pantopus.android.data.saved_places

import app.pantopus.android.data.api.models.saved_places.AreaTodayBody
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.AroundYouApi
import javax.inject.Inject
import javax.inject.Singleton

/** The place Today shows, as Around you asks about it. */
sealed interface AroundYouPlace {
    data class Home(val id: String) : AroundYouPlace

    data class Saved(val id: String) : AroundYouPlace

    data class Area(val latitude: Double, val longitude: Double) : AroundYouPlace
}

/**
 * Around you (Today's second half) for the place Today shows: a Home (a claimed one included), a saved address, or the
 * city around a point already rounded on the phone.
 */
@Singleton
class AroundYouRepository
    @Inject
    constructor(
        private val api: AroundYouApi,
    ) {
        suspend fun read(place: AroundYouPlace): NetworkResult<AroundYouDto> =
            safeApiCall {
                when (place) {
                    is AroundYouPlace.Home -> api.homeAround(place.id)
                    is AroundYouPlace.Saved -> api.savedPlaceAround(place.id)
                    is AroundYouPlace.Area -> api.areaAround(AreaTodayBody(place.latitude, place.longitude))
                }
            }
    }
