package app.pantopus.android.data.homerecord

import android.content.Context
import app.pantopus.android.BuildConfig
import app.pantopus.android.data.api.models.homerecord.HomeRecord
import app.pantopus.android.data.api.models.homerecord.HomeRecordBarsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordCardBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordClosedGroupBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordFactsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordHeader
import app.pantopus.android.data.api.models.homerecord.HomeRecordIntroBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordMetersBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordNoteBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordNoticeBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPhotoYearsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPictureBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordPromiseBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordRowsBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordSectionLabelBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordTilesBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordTimelineBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordValueBlock
import app.pantopus.android.data.api.models.homerecord.HomeRecordWire
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.HomeRecordApi
import com.squareup.moshi.Moshi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Which record the page shows: a looked-up address, or a Home the person has. */
sealed interface HomeRecordSource {
    data class Lookup(val address: String) : HomeRecordSource

    data class Home(val homeId: String) : HomeRecordSource
}

/**
 * Reads the home record page. Nothing is kept: the page asks each time it opens, and the server answers the open
 * part from the caches the lookup already fills.
 */
@Singleton
class HomeRecordRepository
    @Inject
    constructor(
        private val api: HomeRecordApi,
        moshi: Moshi,
        @ApplicationContext private val context: Context,
    ) {
        private val decoder = HomeRecordDecoder(moshi)

        suspend fun load(source: HomeRecordSource): NetworkResult<HomeRecord> {
            HomeRecordFixtures.forced.takeIf { BuildConfig.DEBUG }?.let { name ->
                return withContext(Dispatchers.IO) { decoder.fixture(context, name) }
            }
            return when (
                val wire =
                    safeApiCall {
                        when (source) {
                            is HomeRecordSource.Lookup -> api.lookup(source.address)
                            is HomeRecordSource.Home -> api.forHome(source.homeId)
                        }
                    }
            ) {
                is NetworkResult.Success -> NetworkResult.Success(decoder.read(wire.data))
                is NetworkResult.Failure -> wire
            }
        }
    }

/**
 * Debug builds only: `adb shell am start … --es PANTOPUS_DEBUG_HOME_RECORD lookup|member|owner` answers every record
 * page from the design's sample answers (`src/debug/assets/home-record/`), whose `fixture://` pictures name files
 * there too. Empty turns it off.
 */
object HomeRecordFixtures {
    const val EXTRA = "PANTOPUS_DEBUG_HOME_RECORD"

    /** Where `fixture://<name>` pictures are read from in a debug build. */
    const val ASSET_FOLDER = "home-record"

    @Volatile
    var forced: String? = null
        private set

    fun take(name: String?) {
        if (!BuildConfig.DEBUG) return
        forced = name?.trim()?.takeIf { it in setOf("lookup", "member", "owner") }
    }

    /** A `fixture://` picture as an address the image loader reads; anything else as it is. */
    fun imageModel(url: String): String =
        if (url.startsWith("fixture://")) "file:///android_asset/$ASSET_FOLDER/" + url.removePrefix("fixture://") else url
}

/** Reads the page's blocks one at a time, so a kind this app doesn't know, or one it can't read, is left out. */
class HomeRecordDecoder(
    private val moshi: Moshi,
) {
    private val kinds: Map<String, Class<out HomeRecordBlock>> =
        mapOf(
            "picture" to HomeRecordPictureBlock::class.java,
            "facts" to HomeRecordFactsBlock::class.java,
            "meters" to HomeRecordMetersBlock::class.java,
            "intro" to HomeRecordIntroBlock::class.java,
            "closed_group" to HomeRecordClosedGroupBlock::class.java,
            "promise" to HomeRecordPromiseBlock::class.java,
            "note" to HomeRecordNoteBlock::class.java,
            "section_label" to HomeRecordSectionLabelBlock::class.java,
            "value" to HomeRecordValueBlock::class.java,
            "photo_years" to HomeRecordPhotoYearsBlock::class.java,
            "timeline" to HomeRecordTimelineBlock::class.java,
            "notice" to HomeRecordNoticeBlock::class.java,
            "rows" to HomeRecordRowsBlock::class.java,
            "tiles" to HomeRecordTilesBlock::class.java,
            "bars" to HomeRecordBarsBlock::class.java,
            "card" to HomeRecordCardBlock::class.java,
        )

    fun read(wire: HomeRecordWire): HomeRecord =
        HomeRecord(
            state = wire.state ?: "lookup",
            header = wire.header ?: HomeRecordHeader(),
            blocks = wire.blocks.orEmpty().mapNotNull(::block),
            footer = wire.footer,
        )

    private fun block(raw: Map<String, Any?>): HomeRecordBlock? {
        val kind = raw["kind"] as? String ?: return null
        val type = kinds[kind] ?: return null
        return runCatching { moshi.adapter(type).fromJsonValue(raw) }
            .onFailure { Timber.w(it, "Home record: left out a %s block it could not read", kind) }
            .getOrNull()
    }

    /** A debug build's sample answer, read like a server answer. */
    fun fixture(
        context: Context,
        name: String,
    ): NetworkResult<HomeRecord> =
        runCatching {
            val json = context.assets.open("${HomeRecordFixtures.ASSET_FOLDER}/$name.json").bufferedReader().use { it.readText() }
            read(requireNotNull(moshi.adapter(HomeRecordWire::class.java).fromJson(json)))
        }.fold(
            onSuccess = { NetworkResult.Success(it) },
            onFailure = { NetworkResult.Failure(app.pantopus.android.data.api.net.NetworkError.Decoding(it)) },
        )
}
