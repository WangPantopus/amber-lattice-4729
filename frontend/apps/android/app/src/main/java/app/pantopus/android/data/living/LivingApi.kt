package app.pantopus.android.data.living

import app.pantopus.android.data.api.models.reinvented.Lossy
import com.squareup.moshi.JsonClass
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import retrofit2.http.GET
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
}

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
