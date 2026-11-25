@file:Suppress("PackageNaming")

package app.pantopus.android.data.saved_places

import app.pantopus.android.data.api.models.saved_places.AreaAroundListBody
import app.pantopus.android.data.api.models.saved_places.AreaTodayBody
import app.pantopus.android.data.api.models.saved_places.AroundYouDto
import app.pantopus.android.data.api.models.saved_places.AroundYouListPageDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.conditionalApiCall
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.AroundYouApi
import app.pantopus.android.data.store.ScreenStore
import app.pantopus.android.data.store.StoreKey
import app.pantopus.android.data.store.StoreKeys
import app.pantopus.android.data.store.asResult
import retrofit2.Response
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
 * city around a point already rounded on the phone. A Home's and a saved address's answers go through the screen store,
 * which keeps the last one (saved on the phone) for Today's first frame.
 */
@Singleton
class AroundYouRepository
    @Inject
    constructor(
        private val api: AroundYouApi,
        private val store: ScreenStore,
    ) {
        /** The answer kept for [place], without a request; none for an area, whose read is never kept. */
        fun copy(place: AroundYouPlace): AroundYouDto? =
            when (place) {
                is AroundYouPlace.Home -> store.peek(StoreKeys.homeAround(place.id)).data
                is AroundYouPlace.Saved -> store.peek(StoreKeys.savedPlaceAround(place.id)).data
                is AroundYouPlace.Area -> null
            }

        /** Asks the server every time, as before; the store keeps the answer for the next first look. */
        suspend fun read(place: AroundYouPlace): NetworkResult<AroundYouDto> =
            when (place) {
                is AroundYouPlace.Home -> stored(StoreKeys.homeAround(place.id)) { etag -> api.homeAround(place.id, etag) }
                is AroundYouPlace.Saved -> stored(StoreKeys.savedPlaceAround(place.id)) { etag -> api.savedPlaceAround(place.id, etag) }
                // The point stays out of the URL (a POST body), so the store can't key it and nothing is kept.
                is AroundYouPlace.Area -> safeApiCall { api.areaAround(AreaTodayBody(place.latitude, place.longitude)) }
            }

        /**
         * A page of one of Around you's lists for [place]: [list] is `all` (the earlier stories), `talked` or a topic,
         * [before] the last page's `next` (null: the list's first page). Never kept: a list is read as it is scrolled.
         */
        suspend fun readList(
            place: AroundYouPlace,
            list: String,
            before: String?,
        ): NetworkResult<AroundYouListPageDto> =
            safeApiCall {
                when (place) {
                    is AroundYouPlace.Home -> api.homeAroundList(place.id, list, before)
                    is AroundYouPlace.Saved -> api.savedPlaceAroundList(place.id, list, before)
                    is AroundYouPlace.Area -> api.areaAroundList(AreaAroundListBody(place.latitude, place.longitude, list, before))
                }
            }

        private suspend fun stored(
            key: StoreKey<AroundYouDto>,
            fetch: suspend (etag: String?) -> Response<AroundYouDto>,
        ): NetworkResult<AroundYouDto> = store.read(key, force = true) { etag -> conditionalApiCall { fetch(etag) } }.asResult()
    }
