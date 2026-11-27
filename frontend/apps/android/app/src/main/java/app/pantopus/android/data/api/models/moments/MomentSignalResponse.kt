package app.pantopus.android.data.api.models.moments

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * The answer to a signal (CONTRACT 4, `PUT /api/moments/:id/reaction` with `{ "signal": … }`): the nearest emoji, which
 * today's screens and older apps read, and the signal itself.
 */
@JsonClass(generateAdapter = true)
data class MomentSignalResponse(
    @Json(name = "my_reaction") val myReaction: String? = null,
    @Json(name = "my_signal") val mySignal: String? = null,
)
