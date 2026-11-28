package app.pantopus.android.data.api.models.moments

import com.squareup.moshi.JsonClass

/**
 * "Pulse, reinvented" (CONTRACT 10c): the two colours of the backdrop a whole picture sits on, `#RRGGBB` upper-case, so a
 * screen wider or taller than the picture continues the author's backdrop around it.
 */
@JsonClass(generateAdapter = true)
data class MomentBackdropDto(
    val top: String,
    val bottom: String,
)
