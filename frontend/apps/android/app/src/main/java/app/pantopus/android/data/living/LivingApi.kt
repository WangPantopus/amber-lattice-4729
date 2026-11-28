package app.pantopus.android.data.living

import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.reinvented.Lossy
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import javax.inject.Singleton

/**
 * "Pulse, reinvented" phase 4, the living world (CONTRACT 9). Only while the switch is on for the caller
 * (`403 PULSE_REINVENTED_OFF` otherwise). Routes in `backend/routes/reinvented.js`.
 */
interface LivingApi {
    /** CONTRACT 9h: the live beams in the map's box. */
    @GET("api/reinvented/beams")
    suspend fun beams(
        @Query("south") south: String,
        @Query("west") west: String,
        @Query("north") north: String,
        @Query("east") east: String,
    ): LivingBeamsResponse

    /** CONTRACT 9b, Ask the map: the words and the map's box and time, in the body (never in the address). */
    @POST("api/reinvented/map/ask")
    suspend fun askMap(
        @Body body: LivingAskBody,
    ): LivingAskAnswer

    /** CONTRACT 9b, Atlas search: 20 a page, newest first; the words in the body. */
    @POST("api/reinvented/atlas/search")
    suspend fun atlasSearch(
        @Body body: LivingAtlasSearchBody,
    ): LivingAtlasSearchPage

    /** CONTRACT 9c: the person's own followed places (private to them). */
    @GET("api/reinvented/places")
    suspend fun places(): LivingPlacesResponse

    /** CONTRACT 9c: follow a place; the same place again answers the one kept. `409 PLACES_FULL`, `400 PLACE_INVALID`. */
    @POST("api/reinvented/places")
    suspend fun follow(
        @Body body: LivingFollowBody,
    ): LivingFollowAnswer

    /** CONTRACT 9c: stop following it. */
    @DELETE("api/reinvented/places/{id}")
    suspend fun unfollow(
        @Path("id") id: String,
    )

    /** CONTRACT 9c: curiosity constellations within five miles; the phone's place in the body, never kept or logged. */
    @POST("api/reinvented/constellations")
    suspend fun constellations(
        @Body body: LivingPointDto,
    ): LivingConstellationsDto

    /** CONTRACT 9d: a person's cabinet; the reader's own always, another's only when connected and shown. */
    @GET("api/reinvented/cabinet/{userId}")
    suspend fun cabinet(
        @Path("userId") userId: String,
    ): LivingCabinetEnvelope

    /** CONTRACT 9d: the reader's own yearly poster (Pacific year). */
    @GET("api/reinvented/poster/{year}")
    suspend fun poster(
        @Path("year") year: Int,
    ): LivingPosterEnvelope

    /** CONTRACT 9d: "Show my cabinet to people I know" (the person's own choice, on by default). */
    @PATCH("api/reinvented/settings")
    suspend fun showCabinet(
        @Body body: LivingCabinetChoice,
    )
}

/** CONTRACT 9d: numbers about what a person did, never who follows them (no follower or view count anywhere). */
@JsonClass(generateAdapter = true)
data class LivingCabinetDto(
    @Json(name = "places_stood") val placesStood: Int = 0,
    @Json(name = "highest_ft") val highestFt: Int? = null,
    val specimens: Int = 0,
    @Json(name = "questions_helped") val questionsHelped: Int = 0,
    @Json(name = "strands_sparked") val strandsSparked: Int = 0,
    val canvases: Int = 0,
    val since: String? = null,
    @Json(name = "shown_to") val shownTo: String? = null,
)

@JsonClass(generateAdapter = true)
data class LivingCabinetEnvelope(
    val cabinet: LivingCabinetDto,
)

/** One month of the poster: the person's own kept Moment most people marked that month. */
@JsonClass(generateAdapter = true)
data class LivingPosterMonthDto(
    val month: Int,
    val moment: MomentDto,
)

@JsonClass(generateAdapter = true)
data class LivingPosterDto(
    val year: Int,
    val numbers: LivingCabinetDto,
    @Lossy val months: List<LivingPosterMonthDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class LivingPosterEnvelope(
    val poster: LivingPosterDto,
)

@JsonClass(generateAdapter = true)
data class LivingCabinetChoice(
    @Json(name = "cabinet_shown") val cabinetShown: Boolean,
)

/** A place the person follows (a hometown, Kyoto): its point rounded by the server to about a kilometre. */
@JsonClass(generateAdapter = true)
data class LivingFollowedPlaceDto(
    val id: String,
    val label: String,
    val latitude: Double,
    val longitude: Double,
)

@JsonClass(generateAdapter = true)
data class LivingPlacesResponse(
    @Lossy val places: List<LivingFollowedPlaceDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class LivingFollowBody(
    val label: String,
    val latitude: Double,
    val longitude: Double,
)

@JsonClass(generateAdapter = true)
data class LivingFollowAnswer(
    val place: LivingFollowedPlaceDto? = null,
)

/** CONTRACT 9c: what is near, each something the reader may already open. */
@JsonClass(generateAdapter = true)
data class LivingConstellationsDto(
    @Lossy val retakes: List<LivingRetakeStarDto> = emptyList(),
    @Lossy val skies: List<LivingSkyStarDto> = emptyList(),
    @Lossy val specimens: List<LivingSpecimenStarDto> = emptyList(),
    @Lossy val answers: List<LivingAnswerStarDto> = emptyList(),
) {
    val isEmpty: Boolean get() = retakes.isEmpty() && skies.isEmpty() && specimens.isEmpty() && answers.isEmpty()
}

/** A Retake start and how many frames the reader may see. */
@JsonClass(generateAdapter = true)
data class LivingRetakeStarDto(
    val id: String,
    val title: String? = null,
    val frames: Int? = null,
)

/** A Convergence piece and how many pieces it holds. */
@JsonClass(generateAdapter = true)
data class LivingSkyStarDto(
    val id: String,
    val kind: String? = null,
    val title: String? = null,
    val pieces: Int? = null,
)

/** A Moment or a post with kept field cards, and the cards' names. */
@JsonClass(generateAdapter = true)
data class LivingSpecimenStarDto(
    val type: String,
    val id: String,
    val names: List<String> = emptyList(),
)

/** An Ask marked solved, or an Eyes-on Ask with answers. */
@JsonClass(generateAdapter = true)
data class LivingAnswerStarDto(
    val id: String,
    val question: String? = null,
    val answers: Int? = null,
)

@JsonClass(generateAdapter = true)
data class LivingAskBody(
    val q: String,
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
    val time: String,
)

/** A pin the words matched: a Moment or a post, and which words. */
@JsonClass(generateAdapter = true)
data class LivingAskMatchDto(
    val type: String,
    val id: String,
    val words: List<String> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class LivingAskAnswer(
    @Lossy val matches: List<LivingAskMatchDto> = emptyList(),
    val more: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class LivingAtlasSearchBody(
    val q: String,
    val cursor: String? = null,
)

/** A card in the reader's field guide (CONTRACT 7f), as Atlas search answers it. */
@JsonClass(generateAdapter = true)
data class LivingFieldCardDto(
    val name: String,
    val scientific: String? = null,
)

@JsonClass(generateAdapter = true)
data class LivingFieldCardEntryDto(
    val card: LivingFieldCardDto,
)

/** One result of Atlas search: a Moment, a post, or a card in the reader's field guide, and why it is there. */
@JsonClass(generateAdapter = true)
data class LivingAtlasResultDto(
    val type: String,
    val id: String,
    val at: String? = null,
    val why: String = "",
    val moment: MomentDto? = null,
    val post: FeedPost? = null,
    val card: LivingFieldCardEntryDto? = null,
) {
    /** Unique across kinds (a post and a Moment never share a key in the list). */
    val key: String get() = "$type:$id"

    /** A kind this app draws, with what it needs. */
    val drawable: Boolean
        get() =
            when (type) {
                "moment" -> moment != null
                "post" -> post != null
                "card" -> card != null
                else -> false
            }
}

@JsonClass(generateAdapter = true)
data class LivingAtlasSearchPage(
    @Lossy val results: List<LivingAtlasResultDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
)

/** One point of a beam: a capture's spot, or where they all looked. */
@JsonClass(generateAdapter = true)
data class LivingPointDto(
    val latitude: Double,
    val longitude: Double,
)

/** One live beam (CONTRACT 9h): where several people's captures were all looking, and from where. */
@JsonClass(generateAdapter = true)
data class LivingBeamDto(
    val at: String,
    val target: LivingPointDto,
    @Lossy val from: List<LivingPointDto> = emptyList(),
) {
    val id: String get() = "$at/${target.latitude},${target.longitude}"
}

@JsonClass(generateAdapter = true)
data class LivingBeamsResponse(
    @Lossy val beams: List<LivingBeamDto> = emptyList(),
)

/** The living world's requests, made from the app's one Retrofit (no change to today's network setup). */
@Module
@InstallIn(SingletonComponent::class)
object LivingModule {
    @Provides
    @Singleton
    fun provideLivingApi(retrofit: Retrofit): LivingApi = retrofit.create(LivingApi::class.java)
}
