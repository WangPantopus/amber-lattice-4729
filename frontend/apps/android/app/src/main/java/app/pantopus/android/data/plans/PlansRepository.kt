@file:Suppress("TooManyFunctions")

package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.AcceptRequestBody
import app.pantopus.android.data.api.models.plans.AskToJoinBody
import app.pantopus.android.data.api.models.plans.AskToJoinResponse
import app.pantopus.android.data.api.models.plans.CancelPlanBody
import app.pantopus.android.data.api.models.plans.CreatePlanBody
import app.pantopus.android.data.api.models.plans.HostAsBusinessDto
import app.pantopus.android.data.api.models.plans.MyPlansResponse
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanFeedbackBody
import app.pantopus.android.data.api.models.plans.PlanGamesResponse
import app.pantopus.android.data.api.models.plans.PlanGpsInput
import app.pantopus.android.data.api.models.plans.PlanInviteBody
import app.pantopus.android.data.api.models.plans.PlanInviteClaimBody
import app.pantopus.android.data.api.models.plans.PlanInviteLinkBody
import app.pantopus.android.data.api.models.plans.PlanInviteLinkResponse
import app.pantopus.android.data.api.models.plans.PlanInviteListDto
import app.pantopus.android.data.api.models.plans.PlanInvitePeopleResponse
import app.pantopus.android.data.api.models.plans.PlanInvitePlanResponse
import app.pantopus.android.data.api.models.plans.PlanNearbyPlacesResponse
import app.pantopus.android.data.api.models.plans.PlanNextInviteResponse
import app.pantopus.android.data.api.models.plans.PlanOpenLinkBody
import app.pantopus.android.data.api.models.plans.PlanOpenLinkResponse
import app.pantopus.android.data.api.models.plans.PlanPinsResponse
import app.pantopus.android.data.api.models.plans.PlanPlaceSuggestBody
import app.pantopus.android.data.api.models.plans.PlanPlaceSuggestionsResponse
import app.pantopus.android.data.api.models.plans.PlanRemindResponse
import app.pantopus.android.data.api.models.plans.PlanReportBody
import app.pantopus.android.data.api.models.plans.PlanRequestsResponse
import app.pantopus.android.data.api.models.plans.PlanTeamsResponse
import app.pantopus.android.data.api.models.plans.PlansListResponse
import app.pantopus.android.data.api.models.plans.PublicPlanDto
import app.pantopus.android.data.api.models.plans.StillComingBody
import app.pantopus.android.data.api.models.plans.UpdatePlanBody
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.conditionalApiCall
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PlansApi
import app.pantopus.android.data.auth.TokenStorage
import app.pantopus.android.data.store.PlanStoreKeys
import app.pantopus.android.data.store.ScreenStore
import app.pantopus.android.data.store.StoreKeys
import app.pantopus.android.data.store.StoreTopics
import app.pantopus.android.data.store.Stored
import com.squareup.moshi.Moshi
import kotlinx.coroutines.delay
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/** A map viewport (south, west, north, east), rounded so small pans share one stored copy. */
data class PlanViewport(
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
)

/**
 * Nearby Plans' data (brief section 5). The map, the list and "mine" go through the store as kind `nearby`; a
 * plan's detail never does (its private part is re-checked on every visit). Every write marks the Plans entries out
 * of date so the map, the list and Today catch up.
 */
@Singleton
class PlansRepository
    @Inject
    constructor(
        private val api: PlansApi,
        private val store: ScreenStore,
        private val tokens: TokenStorage,
        private val moshi: Moshi,
    ) {
        /** Public cards seen lately, so a plan opened from the map or a list shows its card at once. */
        private val cards =
            object : LinkedHashMap<String, PlanDto>(CARD_CACHE, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, PlanDto>?): Boolean = size > CARD_CACHE
            }

        private data class CacheSession(val marker: String?, val generation: Long)

        private var cacheMarker: String? = null
        private var cacheGeneration = 0L
        private var rememberedList: List<PlanDto> = emptyList()
        private var browsingOrigin: PlanOrigin? = null

        private fun cacheSession(): CacheSession =
            synchronized(cards) {
                val marker = tokens.sessionMarker()
                if (cacheMarker != marker) {
                    clearCopies()
                    cacheMarker = marker
                }
                CacheSession(marker, cacheGeneration)
            }

        private fun isCurrent(session: CacheSession): Boolean = session.marker != null && session == cacheSession()

        /** Sign-out also retires replies still in flight, before they can repopulate the next session. */
        fun clearAccount() {
            synchronized(cards) {
                clearCopies()
                cacheMarker = null
            }
        }

        /** Called only while holding [cards]. */
        private fun clearCopies() {
            cacheGeneration += 1
            cards.clear()
            rememberedList = emptyList()
            browsingOrigin = null
        }

        fun pinsCopy(
            viewport: PlanViewport,
            kinds: String?,
            window: PlanWindow,
        ): PlanPinsResponse? = store.peek(pinsKey(viewport, kinds, window, origin)).data?.drawable()

        /**
         * Pins for [viewport]; each pin's distance band is measured from where the person browses from. Here and in every
         * read below, a plan of a kind this app can't draw is left out (Plans steps 3 and 4: the next kind needs no marker).
         */
        suspend fun pins(
            viewport: PlanViewport,
            kinds: String?,
            window: PlanWindow,
            force: Boolean = false,
        ): Stored<PlanPinsResponse> {
            val from = origin
            val stored =
                store.read(pinsKey(viewport, kinds, window, from), force) { etag ->
                    conditionalApiCall {
                        api.pins(
                            south = viewport.south,
                            west = viewport.west,
                            north = viewport.north,
                            east = viewport.east,
                            kinds = kinds,
                            window = window.wire,
                            etag = etag,
                            latitude = from?.latitude?.let(StoreKeys::roundCoordinate),
                            longitude = from?.longitude?.let(StoreKeys::roundCoordinate),
                            gpsLatitude = from?.gps?.let { from.latitude },
                            gpsLongitude = from?.gps?.let { from.longitude },
                            gpsTimestamp = from?.gps?.toString(),
                        )
                    }
                }
            return stored.copy(data = stored.data?.drawable())
        }

        private fun pinsKey(
            viewport: PlanViewport,
            kinds: String?,
            window: PlanWindow,
            from: PlanOrigin?,
        ) = PlanStoreKeys.pins(
            viewport.south,
            viewport.west,
            viewport.north,
            viewport.east,
            kinds,
            window.wire,
            from?.latitude?.let(StoreKeys::roundCoordinate),
            from?.longitude?.let(StoreKeys::roundCoordinate),
        )

        fun listCopy(
            latitude: Double?,
            longitude: Double?,
            window: PlanWindow,
            kinds: String?,
        ): PlansListResponse? {
            val session = cacheSession()
            return store.peek(listKey(latitude, longitude, window, kinds)).data?.drawable()?.also { remember(it, session) }
        }

        suspend fun list(
            latitude: Double?,
            longitude: Double?,
            window: PlanWindow,
            kinds: String?,
            force: Boolean = false,
        ): Stored<PlansListResponse> {
            val session = cacheSession()
            val lat = latitude?.let(StoreKeys::roundCoordinate)
            val lng = longitude?.let(StoreKeys::roundCoordinate)
            val gps = origin?.gps
            return store
                .read(listKey(lat, lng, window, kinds), force) { etag ->
                    conditionalApiCall {
                        api.list(
                            latitude = lat,
                            longitude = lng,
                            window = window.wire,
                            kinds = kinds,
                            cursor = null,
                            etag = etag,
                            gpsLatitude = gps?.let { latitude },
                            gpsLongitude = gps?.let { longitude },
                            gpsTimestamp = gps?.toString(),
                        )
                    }
                }.let { stored -> stored.copy(data = stored.data?.drawable()) }
                .also { stored -> stored.data?.let { remember(it, session) } }
        }

        private fun listKey(
            latitude: Double?,
            longitude: Double?,
            window: PlanWindow,
            kinds: String?,
        ) = PlanStoreKeys.list(
            latitude?.let(StoreKeys::roundCoordinate),
            longitude?.let(StoreKeys::roundCoordinate),
            window.wire,
            kinds,
        )

        fun mineCopy(): MyPlansResponse? = store.peek(PlanStoreKeys.mine).data?.drawable()

        fun isMineCurrent(): Boolean = store.isCurrent(PlanStoreKeys.mine)

        suspend fun mine(force: Boolean = false): Stored<MyPlansResponse> {
            val session = cacheSession()
            val read = store.read(PlanStoreKeys.mine, force) { etag -> conditionalApiCall { api.mine(etag) } }
            return read.copy(data = read.data?.drawable()).also { stored ->
                stored.data?.let { reply ->
                    (reply.hosting + reply.going + reply.asked + reply.waitlisted).forEach { rememberCard(it, session) }
                }
            }
        }

        /** The public card last seen for [id], for a first frame while the plan loads. Never the private part. */
        fun card(id: String): PlanDto? =
            synchronized(cards) {
                cacheSession()
                cards[id]
            }

        /** The last list read around the person, for "Other plans this week" (J8). */
        val lastList: List<PlanDto>
            get() =
                synchronized(cards) {
                    cacheSession()
                    rememberedList
                }

        /** `GET /api/public/plans/:id`: what a signed-out page may show (J9 asks it after a 404). */
        suspend fun publicPlan(id: String): NetworkResult<PublicPlanDto> = safeApiCall { api.publicPlan(id) }

        /** Where distances are measured from, and a fresh GPS fix when the person browses by location. */
        private val origin: PlanOrigin?
            get() =
                synchronized(cards) {
                    cacheSession()
                    browsingOrigin
                }

        fun setOrigin(value: PlanOrigin?) {
            synchronized(cards) {
                if (cacheSession().marker != null) browsingOrigin = value
            }
        }

        /** `GET /api/plans/:id`, fresh every time, with what a 404 means (J9 or gone). */
        suspend fun read(id: String): PlanRead {
            val session = cacheSession()
            val from = origin
            val result =
                safeApiCall {
                    api.plan(
                        id = id,
                        latitude = from?.latitude,
                        longitude = from?.longitude,
                        gpsLatitude = from?.gps?.let { from.latitude },
                        gpsLongitude = from?.gps?.let { from.longitude },
                        gpsTimestamp = from?.gps?.toString(),
                    )
                }
            if (!isCurrent(session)) return PlanRead.Failed(NetworkError.Unauthorized)
            return when (result) {
                is NetworkResult.Success -> readResponse(id, result.data, session)
                is NetworkResult.Failure -> PlanRead.Failed(result.error)
            }
        }

        private fun readResponse(
            id: String,
            response: Response<PlanDto>,
            session: CacheSession,
        ): PlanRead {
            val body = response.body()
            // A kind or a place this app can't draw (a later server's): as if it weren't there, never drawn wrong.
            if (response.isSuccessful && body != null && !body.isDrawable) {
                forget(id, session)
                return PlanRead.Missing
            }
            if (response.isSuccessful && body != null) {
                rememberCard(body, session)
                return PlanRead.Found(body)
            }
            val error = runCatching { response.errorBody()?.string() }.getOrNull()
            return when (response.code()) {
                HTTP_NOT_FOUND -> {
                    forget(id, session)
                    val json = error?.let { runCatching { JSONObject(it) }.getOrNull() }
                    if (json?.optString("error") == "needs_verified_address") {
                        PlanRead.Locked(
                            city = json.optJSONObject("plan")?.optString("city")?.takeIf(String::isNotBlank),
                            invitedBy = json.optString("invited_by").takeIf { !json.isNull("invited_by") && it.isNotBlank() },
                        )
                    } else {
                        PlanRead.Missing
                    }
                }
                HTTP_UNAUTHORIZED -> {
                    forget(id, session)
                    PlanRead.Failed(NetworkError.Unauthorized)
                }
                HTTP_FORBIDDEN -> {
                    forget(id, session)
                    PlanRead.Failed(NetworkError.Forbidden(error))
                }
                in HTTP_SERVER_ERRORS -> PlanRead.Failed(NetworkError.Server(response.code(), error))
                else -> PlanRead.Failed(NetworkError.ClientError(response.code(), error))
            }
        }

        /** `GET /api/plans/:id` as a plain result (a 404 of any kind is [NetworkError.NotFound]). */
        suspend fun plan(id: String): NetworkResult<PlanDto> =
            when (val read = read(id)) {
                is PlanRead.Found -> NetworkResult.Success(read.plan)
                is PlanRead.Failed -> NetworkResult.Failure(read.error)
                is PlanRead.Locked, PlanRead.Missing -> NetworkResult.Failure(NetworkError.NotFound)
            }

        /**
         * The businesses this person may post a plan for (Plans with businesses, board B1). Empty for nearly everyone,
         * and on any failure: "Host as" then simply doesn't show.
         */
        suspend fun hostAs(): List<HostAsBusinessDto> = (safeApiCall { api.hostAs() } as? NetworkResult.Success)?.data?.businesses.orEmpty()

        /**
         * A business's upcoming plans for its page (B6). Empty while Plans or the switch is off, for a business with
         * none, and on any failure: the page then shows no section at all.
         */
        suspend fun businessPlans(businessUserId: String): List<PlanDto> {
            val session = cacheSession()
            val reply = (safeApiCall { api.businessPlans(businessUserId) } as? NetworkResult.Success)?.data
            val items = reply?.items.orEmpty().filter { it.isDrawable }
            items.forEach { rememberCard(it, session) }
            return items
        }

        suspend fun create(body: CreatePlanBody): NetworkResult<PlanDto> {
            val session = cacheSession()
            return write { api.create(body) }.also { rememberResult(it, session) }
        }

        suspend fun update(
            id: String,
            body: UpdatePlanBody,
        ): NetworkResult<PlanDto> {
            val session = cacheSession()
            return write(id) { api.update(id, body) }.also { rememberResult(it, session) }
        }

        suspend fun cancel(
            id: String,
            note: String?,
        ): NetworkResult<Unit> = write(id, chats = true) { api.cancel(id, CancelPlanBody(note?.takeIf(String::isNotBlank))) }

        /**
         * Cancels this date of a repeating plan only and posts the next one now (Plans step 2: "Skip Thursday", "Cancel
         * this date"). Success carries the next date's id, or null when the series is over.
         */
        suspend fun cancelThisDate(
            id: String,
            note: String?,
        ): NetworkResult<String?> {
            val body = CancelPlanBody(note?.takeIf(String::isNotBlank), repeat = REPEAT_KEEP)
            return when (val result = write(id, chats = true) { api.cancelThisDate(id, body) }) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.nextPlanId?.takeIf(String::isNotBlank))
                is NetworkResult.Failure -> result
            }
        }

        /** Stops a repeating plan (Plans step 2): `PATCH` with `"repeat": null`; this date stays and none follows. */
        suspend fun stopRepeating(id: String): NetworkResult<PlanDto> = updateStoppingRepeat(id, UpdatePlanBody())

        /**
         * One `PATCH` with [body]'s fields (serialized as [update] sends them) and `"repeat": null`: the change screen's
         * other changes and "Doesn't repeat" together, so either both go through or neither does.
         */
        suspend fun updateStoppingRepeat(
            id: String,
            body: UpdatePlanBody,
        ): NetworkResult<PlanDto> {
            val session = cacheSession()
            val fields = JSONObject(moshi.adapter(UpdatePlanBody::class.java).toJson(body)).put(REPEAT_FIELD, JSONObject.NULL)
            val raw = fields.toString().toRequestBody(JSON_MEDIA_TYPE.toMediaType())
            return write(id) { api.stopRepeating(id, raw) }.also { rememberResult(it, session) }
        }

        suspend fun ask(
            id: String,
            body: AskToJoinBody,
        ): NetworkResult<AskToJoinResponse> {
            val session = cacheSession()
            val gps = origin?.let { from -> from.gps?.let { at -> PlanGpsInput(from.latitude, from.longitude, at.toString()) } }
            val withGps = if (body.gps == null && gps != null) body.copy(gps = gps) else body
            return write(id) { api.ask(id, withGps) }.also { result ->
                (result as? NetworkResult.Success)?.data?.plan?.let { rememberCard(it, session) }
            }
        }

        /** `POST /api/plans/:id/report`. */
        suspend fun report(
            id: String,
            reason: String,
        ): NetworkResult<Unit> = safeApiCall(surfaceForbiddenBody = true) { api.report(id, PlanReportBody(reason)) }

        suspend fun withdraw(id: String): NetworkResult<Unit> = write(id, chats = true) { api.withdraw(id) }

        suspend fun requests(id: String): NetworkResult<PlanRequestsResponse> =
            safeApiCall(
                surfaceForbiddenBody = true,
            ) { api.requests(id) }

        suspend fun accept(
            id: String,
            requestId: String,
            confirmSharesAddress: Boolean,
        ): NetworkResult<Unit> =
            write(id, chats = true) {
                api.accept(id, requestId, AcceptRequestBody(confirmSharesAddress.takeIf { it }))
            }

        suspend fun decline(
            id: String,
            requestId: String,
        ): NetworkResult<Unit> = write(id) { api.decline(id, requestId) }

        suspend fun remove(
            id: String,
            requestId: String,
        ): NetworkResult<Unit> = write(id, chats = true) { api.remove(id, requestId) }

        suspend fun onMyWay(id: String): NetworkResult<Unit> = write(id, chats = true) { api.onMyWay(id) }

        suspend fun stillComing(
            id: String,
            coming: Boolean,
        ): NetworkResult<Unit> = write(id, chats = !coming) { api.stillComing(id, StillComingBody(coming)) }

        suspend fun feedback(
            id: String,
            answer: String,
            note: String?,
        ): NetworkResult<Unit> = write(id) { api.feedback(id, PlanFeedbackBody(answer, note?.takeIf(String::isNotBlank))) }

        suspend fun teams(query: String = ""): NetworkResult<PlanTeamsResponse> =
            safeApiCall { api.teams(query, origin?.latitude, origin?.longitude) }

        suspend fun games(purpose: String = "sheet"): NetworkResult<PlanGamesResponse> {
            val from = origin
            val gps =
                from?.gps?.takeIf {
                    java.time.Duration.between(it, java.time.Instant.now()).seconds in 0..GPS_MAX_AGE_SECONDS
                }
            return when (
                val result =
                    safeApiCall {
                        api.games(
                            latitude = from?.latitude,
                            longitude = from?.longitude,
                            gpsLatitude = gps?.let { from.latitude },
                            gpsLongitude = gps?.let { from.longitude },
                            gpsTimestamp = gps?.toString(),
                            purpose = purpose,
                        )
                    }
            ) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.copy(games = result.data.games.filter { it.isAvailable() }))
                is NetworkResult.Failure -> result
            }
        }

        /**
         * Public places for H6: nearest first, or for [plan] the ones that suit it first, each saying whether it's open
         * then. `loading` asks the caller to try again in a few seconds. [wait] false only starts the server gathering a
         * new area (the host flow opening) and answers at once.
         */
        suspend fun nearbyPlaces(
            latitude: Double,
            longitude: Double,
            query: String? = null,
            plan: PlanPlaceQuery? = null,
            wait: Boolean = true,
        ): NetworkResult<PlanNearbyPlacesResponse> =
            safeApiCall {
                api.nearbyPlaces(
                    latitude = latitude,
                    longitude = longitude,
                    query = query?.trim()?.takeIf(String::isNotEmpty),
                    kind = plan?.kind,
                    sport = plan?.sport,
                    startsAt = plan?.startsAt,
                    endsAt = plan?.endsAt,
                    wait = if (wait) null else "0",
                )
            }

        /**
         * H6's places once the server has them. An area it hasn't looked at yet answers `loading` while it gathers the
         * places (up to a minute when the map servers are busy), so this asks again every 3 seconds, telling
         * [onGathering] each time, for up to [PLACES_GATHER_LIMIT_MS]; the last reply still says `loading` when that ran
         * out.
         */
        suspend fun nearbyPlacesWhenReady(
            latitude: Double,
            longitude: Double,
            query: String? = null,
            plan: PlanPlaceQuery? = null,
            onGathering: (PlanNearbyPlacesResponse) -> Unit = {},
        ): NetworkResult<PlanNearbyPlacesResponse> =
            whenGathered({ nearbyPlaces(latitude, longitude, query, plan) }, { it.loading }, onGathering)

        /** H6's "Suggest places": up to three places for the draft, each with `why`, once the area's places are in. */
        suspend fun suggestPlacesWhenReady(
            body: PlanPlaceSuggestBody,
            onGathering: () -> Unit = {},
        ): NetworkResult<PlanPlaceSuggestionsResponse> =
            whenGathered({ safeApiCall { api.suggestPlaces(body) } }, { it.loading }, { onGathering() })

        private suspend fun <T> whenGathered(
            read: suspend () -> NetworkResult<T>,
            gathering: (T) -> Boolean,
            onGathering: (T) -> Unit,
        ): NetworkResult<T> {
            val started = System.nanoTime()
            while (true) {
                val result = read()
                if (result !is NetworkResult.Success || !gathering(result.data)) return result
                if ((System.nanoTime() - started) / NANOS_PER_MILLI > PLACES_GATHER_LIMIT_MS) return result
                onGathering(result.data)
                delay(PLACES_POLL_MS)
            }
        }

        // ---- Invitations (planInvites.js) ----

        suspend fun invites(id: String): NetworkResult<PlanInviteListDto> = safeApiCall(surfaceForbiddenBody = true) { api.invites(id) }

        suspend fun invitePeople(
            id: String,
            query: String = "",
        ): NetworkResult<PlanInvitePeopleResponse> =
            safeApiCall(surfaceForbiddenBody = true) { api.invitePeople(id, query.takeIf(String::isNotBlank)) }

        /** The people to invite before a private plan exists (its preview). */
        suspend fun invitePeopleBefore(query: String = ""): NetworkResult<PlanInvitePeopleResponse> =
            safeApiCall(surfaceForbiddenBody = true) { api.invitePeopleBefore(query.takeIf(String::isNotBlank)) }

        suspend fun invite(
            id: String,
            body: PlanInviteBody,
        ): NetworkResult<PlanInviteListDto> = write(id) { api.invite(id, body) }

        suspend fun inviteLink(
            id: String,
            confirmSharesAddress: Boolean,
        ): NetworkResult<PlanInviteLinkResponse> = write(id) { api.inviteLink(id, PlanInviteLinkBody(confirmSharesAddress.takeIf { it })) }

        suspend fun cancelInvite(
            id: String,
            inviteId: String,
        ): NetworkResult<PlanInviteListDto> = write(id) { api.cancelInvite(id, inviteId) }

        /** The person opened an email or text invitation: it becomes this account's. */
        suspend fun claimInvite(
            id: String,
            token: String,
        ): NetworkResult<PlanInvitePlanResponse> {
            val session = cacheSession()
            return write(id) { api.claimInvite(id, PlanInviteClaimBody(token)) }.also { result ->
                (result as? NetworkResult.Success)?.data?.plan?.let { rememberCard(it, session) }
            }
        }

        /** "Can't make it" to an invitation. */
        suspend fun declineInvite(id: String): NetworkResult<PlanInvitePlanResponse> = write(id, chats = true) { api.declineInvite(id) }

        // ---- Plans for the holidays, H1 (contract 6.4) ----

        /** The plan's one link for everyone: made the first time, then the same; also saves "I say yes first". */
        suspend fun openLink(
            id: String,
            hostSaysYesFirst: Boolean?,
            confirmSharesAddress: Boolean,
        ): NetworkResult<PlanOpenLinkResponse> =
            write(id) {
                val body = PlanOpenLinkBody(hostSaysYesFirst = hostSaysYesFirst, confirmSharesAddress = confirmSharesAddress.takeIf { it })
                api.openLink(id, body)
            }

        /** "Turn this link off". */
        suspend fun closeOpenLink(id: String): NetworkResult<Unit> = write(id) { api.closeOpenLink(id) }

        /** "Let in": a guest who waits for the host's yes is in. */
        suspend fun letIn(
            id: String,
            inviteId: String,
        ): NetworkResult<PlanInviteListDto> = write(id) { api.letIn(id, inviteId) }

        /** "Remind": everyone who hasn't answered, the way each was invited. */
        suspend fun remind(id: String): NetworkResult<PlanRemindResponse> = write(id) { api.remind(id) }

        /** "Maybe" to an invitation. */
        suspend fun maybeInvite(id: String): NetworkResult<PlanInvitePlanResponse> {
            val session = cacheSession()
            return write(id) { api.maybeInvite(id) }.also { result ->
                (result as? NetworkResult.Success)?.data?.plan?.let { rememberCard(it, session) }
            }
        }

        // ---- Plans for the holidays, H2: the bring list (contract 7) ----

        /** The host's whole list (A9's Done). */
        suspend fun putBring(
            id: String,
            body: PlanBringInput,
        ): NetworkResult<PlanBringResponse> = write(id) { api.putBring(id, body) }

        /** "I'll bring it". */
        suspend fun claimBring(
            id: String,
            itemId: String,
        ): NetworkResult<PlanBringResponse> = write(id) { api.claimBring(id, itemId) }

        /** "Give back". */
        suspend fun giveBackBring(
            id: String,
            itemId: String,
        ): NetworkResult<PlanBringResponse> = write(id) { api.giveBackBring(id, itemId) }

        /** "Bring something else". */
        suspend fun addBring(
            id: String,
            label: String,
        ): NetworkResult<PlanBringResponse> = write(id) { api.addBring(id, PlanBringAddBody(label = label)) }

        /** Right after signing in: the newest invitation not opened yet (an email invite finds its verified address). */
        suspend fun nextInvite(): NetworkResult<PlanNextInviteResponse> = safeApiCall { api.nextInvite() }

        /** Plans changed elsewhere (a push, another device): the next read of every Plans entry asks again. */
        fun changed(planId: String? = null) {
            store.markStale(planId?.let(PlanStoreKeys::topic) ?: PlanStoreKeys.TOPIC)
        }

        private suspend inline fun <T> write(
            id: String? = null,
            chats: Boolean = false,
            crossinline block: suspend () -> T,
        ): NetworkResult<T> {
            val session = cacheSession()
            val result = safeApiCall(surfaceForbiddenBody = true) { block() }
            if (!isCurrent(session)) return NetworkResult.Failure(NetworkError.Unauthorized)
            if (result is NetworkResult.Success) {
                store.markEdited(PlanStoreKeys.TOPIC)
                id?.let { store.markEdited(PlanStoreKeys.topic(it)) }
                if (chats) store.markStale(StoreTopics.CHATS)
            }
            return result
        }

        private fun rememberResult(
            result: NetworkResult<PlanDto>,
            session: CacheSession,
        ) {
            if (result is NetworkResult.Success) rememberCard(result.data, session)
        }

        private fun remember(
            reply: PlansListResponse,
            session: CacheSession,
        ) {
            synchronized(cards) {
                if (!isCurrent(session)) return
                rememberedList = reply.items.map(::publicCard)
                rememberedList.forEach { cards[it.id] = it }
            }
        }

        /** Keeps [plan]'s card, or forgets it when this app can't draw its kind or place (Plans steps 3 and 4). */
        private fun rememberCard(
            plan: PlanDto,
            session: CacheSession,
        ) {
            if (!plan.isDrawable) {
                forget(plan.id, session)
                return
            }
            synchronized(cards) {
                if (isCurrent(session)) cards[plan.id] = publicCard(plan)
            }
        }

        private fun forget(
            id: String,
            session: CacheSession,
        ) {
            synchronized(cards) {
                if (isCurrent(session)) {
                    cards.remove(id)
                    rememberedList = rememberedList.filterNot { it.id == id }
                }
            }
        }

        /** Access-dependent details are re-read on every appearance, including a return from the background. */
        private fun publicCard(plan: PlanDto): PlanDto =
            plan.copy(
                place = null,
                people = null,
                chatRoomId = null,
                chatOpen = null,
                guestNote = null,
                cancelNote = null,
                myRequest = null,
                myInvite = null,
                invites = null,
                requestsCount = null,
                autoRules = null,
                inviteResults = null,
                inviteError = null,
                startsAt = plan.startsAt.takeUnless { plan.kind == "playdate" },
                endsAt = plan.endsAt.takeUnless { plan.kind == "playdate" },
                askingClosesAt = plan.askingClosesAt.takeUnless { plan.kind == "playdate" },
            )

        private companion object {
            const val CARD_CACHE = 64
            const val GPS_MAX_AGE_SECONDS = 300L
            const val REPEAT_KEEP = "keep"
            const val REPEAT_FIELD = "repeat"
            const val JSON_MEDIA_TYPE = "application/json; charset=utf-8"
        }
    }

/** How long H6 keeps asking while the server gathers a new area's places, and how often. */
const val PLACES_GATHER_LIMIT_MS = 150_000L
const val PLACES_POLL_MS = 3_000L
private const val NANOS_PER_MILLI = 1_000_000L

/**
 * What H6's list is for: the plan's [kind] (the places that suit it come first), a pickup game's [sport], and its time
 * (each place says whether it's open then), as instants (`2026-10-24T19:00:00Z`).
 */
data class PlanPlaceQuery(
    val kind: String,
    val sport: String?,
    val startsAt: String,
    val endsAt: String,
)

/** Where the person browses from: distances are measured from here; [gps] is the fix time when it's GPS. */
data class PlanOrigin(
    val latitude: Double,
    val longitude: Double,
    val gps: java.time.Instant?,
)

/** What `GET /api/plans/:id` said. */
sealed interface PlanRead {
    data class Found(
        val plan: PlanDto,
    ) : PlanRead

    /** A playdate the viewer can't see without a verified address (J9); [invitedBy] is the host's first name when they invited them. */
    data class Locked(
        val city: String?,
        val invitedBy: String? = null,
    ) : PlanRead

    /** Gone, hidden, or the flag is off. */
    data object Missing : PlanRead

    data class Failed(
        val error: NetworkError,
    ) : PlanRead
}

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403
private const val HTTP_NOT_FOUND = 404
private val HTTP_SERVER_ERRORS = 500..599

/** The machine code of a Plans error reply (`{ error, message }`), such as `not_near` or `full`. */
val NetworkError.planCode: String?
    get() {
        val body =
            when (this) {
                is NetworkError.ClientError -> body
                is NetworkError.Forbidden -> body
                is NetworkError.Server -> body
                else -> null
            } ?: return null
        return runCatching { JSONObject(body).optString("error") }.getOrNull()?.takeIf { it.isNotBlank() }
    }

/** The sentence for people from a Plans error reply, else the error's own copy. */
val NetworkError.planMessage: String
    get() {
        val body =
            when (this) {
                is NetworkError.ClientError -> body
                is NetworkError.Forbidden -> body
                else -> null
            }
        val sentence = body?.let { runCatching { JSONObject(it).optString("message") }.getOrNull() }?.takeIf { it.isNotBlank() }
        return sentence ?: message
    }
