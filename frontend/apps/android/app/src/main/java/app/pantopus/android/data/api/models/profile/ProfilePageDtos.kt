package app.pantopus.android.data.api.models.profile

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/* The profile with sources: `~/pantopus-profile-sources/CONTRACT.md`. */

/** `GET /api/profile-page/marks?ids=…` (contract §7): the outer ring for avatars (board 6). */
@JsonClass(generateAdapter = true)
data class ProfileMarksResponse(
    val marks: List<ProfileMarkDto>? = null,
)

@JsonClass(generateAdapter = true)
data class ProfileMarkDto(
    @Json(name = "user_id") val userId: String? = null,
    /** The first month with anything in a lane that reaches this viewer, `YYYY-MM`. */
    val since: String? = null,
    /** Whether any such month is Seen. */
    val seen: Boolean? = null,
)
