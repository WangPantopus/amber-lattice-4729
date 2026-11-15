package app.pantopus.android.data.api.models.posts

import android.net.Uri

/**
 * Where a post's story was published (`post_metadata.source_url`, which only the server sets): an Around you
 * headline's outlet, named in `source_name` ("Read at The Columbian"), or an Official or curator notice's source. A web
 * link only. Mirrors iOS `PostSource`.
 */
data class PostSource(
    val url: String,
    /** The outlet's name, when the post names it. */
    val name: String?,
) {
    /** "Read at The Columbian", or "Source: clark.wa.gov" without a name. */
    val label: String
        get() = name?.let { "Read at $it" } ?: "Source: ${Uri.parse(url).host?.removePrefix("www.") ?: url}"

    companion object {
        /** The source a post's metadata names, or null when it names no web link. */
        fun of(
            url: String?,
            name: String?,
        ): PostSource? {
            val link = url?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val parsed = Uri.parse(link)
            if (parsed.scheme?.lowercase() !in setOf("http", "https") || parsed.host.isNullOrEmpty()) return null
            return PostSource(url = link, name = name?.trim()?.takeIf { it.isNotEmpty() })
        }
    }
}
