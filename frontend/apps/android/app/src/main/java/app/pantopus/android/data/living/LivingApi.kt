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
import retrofit2.http.GET
import retrofit2.http.POST
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
}

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
