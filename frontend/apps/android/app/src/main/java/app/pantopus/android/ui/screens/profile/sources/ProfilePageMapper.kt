@file:Suppress("TooManyFunctions", "CyclomaticComplexMethod", "LongMethod")

package app.pantopus.android.ui.screens.profile.sources

import app.pantopus.android.data.api.models.profile.ProfileInCommonResponse
import app.pantopus.android.data.api.models.profile.ProfilePageDto
import app.pantopus.android.data.api.models.profile.ProfilePageMonthDto
import app.pantopus.android.data.api.models.profile.ProfilePageRingsDto
import app.pantopus.android.data.api.models.profile.ProfilePieceDto
import com.squareup.moshi.Moshi
import java.time.LocalDate

/*
 * The server's answer → the page the app draws (contract §0): a block kind, link kind, action kind or tab key the app
 * doesn't know is skipped; a block left with nothing to draw is skipped; a tab left with no blocks is skipped. Ink is
 * taken as sent (unknown reads as Said, never higher). Nothing is added.
 */

/** The page, or null when the answer has no header or person to draw (the app then keeps today's screen). */
fun mapProfilePage(
    dto: ProfilePageDto,
    moshi: Moshi,
): ProfilePage? {
    val header = dto.header ?: return null
    val userId = header.userId?.takeIf { it.isNotBlank() }
    val name = header.name?.trim()?.takeIf { it.isNotEmpty() }
    val rings = mapRings(header.rings)
    if (userId == null || name == null || rings == null) return null
    val firstName = header.firstName?.trim()?.takeIf { it.isNotEmpty() } ?: name.substringBefore(' ')
    val inCommonAdapter = moshi.adapter(ProfileInCommonResponse::class.java)
    val tabs =
        dto.tabs.orEmpty().mapNotNull { tab ->
            val key = tab.key?.trim()?.lowercase() ?: return@mapNotNull null
            if (key !in KNOWN_TABS) return@mapNotNull null
            val blocks =
                tab.blocks.orEmpty().mapNotNull {
                    mapBlock(
                        it,
                    ) { body -> runCatching { inCommonAdapter.fromJsonValue(body) }.getOrNull() }
                }
            if (blocks.isEmpty()) return@mapNotNull null
            ProfilePageTab(
                key = key,
                title = tab.title?.trim()?.takeIf { it.isNotEmpty() } ?: defaultTabTitle(key, firstName),
                blocks = blocks,
            )
        }
    val summary =
        dto.summary.let {
            ProfileSummary(
                years = it?.years ?: rings.years.size,
                seenMonths = it?.seenMonths ?: 0,
                signedMonths = it?.signedMonths ?: 0,
                saidMonths = it?.saidMonths ?: 0,
            )
        }
    return ProfilePage(
        view = ProfileView.fromApi(dto.view),
        listed = dto.listed == true,
        header =
            ProfilePageHeader(
                userId = userId,
                username = header.username?.takeIf { it.isNotBlank() },
                name = name,
                accountName = header.accountName?.trim()?.takeIf { it.isNotEmpty() },
                firstName = firstName,
                headline = header.headline?.trim()?.takeIf { it.isNotEmpty() },
                portraitUrl = header.portraitUrl?.takeIf { it.isNotBlank() },
                seenAs = header.seenAs?.trim()?.takeIf { it.isNotEmpty() },
                place =
                    header.place?.let { place ->
                        place.label?.trim()?.takeIf { it.isNotEmpty() }?.let { label ->
                            ProfilePlace(
                                label = label,
                                time = place.time?.takeIf { it.isNotBlank() },
                                zone = place.tz?.takeIf { it.isNotBlank() },
                                sky = place.sky?.substringBefore('_')?.lowercase()?.takeIf { it.isNotBlank() },
                            )
                        }
                    },
                rings = rings,
            ),
        summary = summary,
        tabs = tabs,
        actions = dto.actions.orEmpty().mapNotNull(::mapAction),
        footer = dto.footer?.text?.trim()?.takeIf { it.isNotEmpty() },
        previewAs = dto.previewAs?.let { ProfileView.fromApi(it) },
    )
}

/** One month, opened; null when it has no lines. */
fun mapProfileMonth(dto: ProfilePageMonthDto): ProfileMonth? {
    val lines = dto.lines.orEmpty().mapNotNull(::mapLine)
    if (lines.isEmpty()) return null
    return ProfileMonth(
        month = dto.month.orEmpty(),
        title = dto.title?.takeIf { it.isNotBlank() } ?: dto.month.orEmpty(),
        subtitle = dto.subtitle?.takeIf { it.isNotBlank() },
        lines = lines,
    )
}

private val KNOWN_TABS = setOf("person", "work", "record")

private fun defaultTabTitle(
    key: String,
    firstName: String,
): String =
    when (key) {
        "person" -> firstName
        "work" -> "Work"
        else -> "Record"
    }

internal fun mapRings(dto: ProfilePageRingsDto?): ProfileRings? {
    val from = dto?.from ?: return null
    val now = dto.now?.let { runCatching { LocalDate.parse(it.take(DAY_CHARS)) }.getOrNull() } ?: return null
    return ProfileRings(from = from, now = now, home = dto.home.orEmpty(), work = dto.work.orEmpty(), others = dto.others.orEmpty())
}

private const val DAY_CHARS = 10

// ── loose JSON helpers ────────────────────────────────────────────────────────

private fun Map<String, Any?>.str(key: String): String? = (this[key] as? String)?.trim()?.takeIf { it.isNotEmpty() }

private fun Map<String, Any?>.int(key: String): Int? = (this[key] as? Number)?.toInt()

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.obj(key: String): Map<String, Any?>? = this[key] as? Map<String, Any?>

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.objs(key: String): List<Map<String, Any?>> =
    (this[key] as? List<*>).orEmpty().mapNotNull { it as? Map<String, Any?> }

private fun Map<String, Any?>.strs(key: String): List<String> =
    (this[key] as? List<*>).orEmpty().mapNotNull {
        (it as? String)?.takeIf(String::isNotBlank)
    }

internal fun mapLink(map: Map<String, Any?>?): ProfilePageLink? {
    map ?: return null
    return when (map.str("kind")) {
        "tab" -> map.str("tab")?.let { ProfilePageLink.Tab(it) }
        "record" -> ProfilePageLink.Record
        "month" -> map.str("month")?.let { ProfilePageLink.Month(it) }
        "piece" -> map.str("id")?.let { ProfilePageLink.Piece(it) }
        "business" -> map.str("username")?.let { ProfilePageLink.Business(it) }
        "profile" ->
            ProfilePageLink
                .Profile(map.str("user_id"), map.str("username"))
                .takeIf { it.userId != null || it.username != null }
        "plan" -> map.str("id")?.let { ProfilePageLink.Plan(it) }
        "gig" -> map.str("id")?.let { ProfilePageLink.Gig(it) }
        "support_train" -> map.str("id")?.let { ProfilePageLink.SupportTrain(it) }
        "posts" -> map.str("user_id")?.let { ProfilePageLink.Posts(it) }
        "moments" -> map.str("user_id")?.let { ProfilePageLink.Moments(it) }
        "url" ->
            map.str(
                "url",
            )?.takeIf { it.startsWith("https://") || it.startsWith("http://") }?.let { ProfilePageLink.Url(it, map.str("site")) }
        else -> null
    }
}

internal fun mapLine(map: Map<String, Any?>?): ProfileLine? {
    map ?: return null
    val text = map.str("text") ?: return null
    return ProfileLine(
        ink = ProfileInk.fromApi(map.str("ink")),
        text = text,
        how = map.str("how"),
        lane = ProfileLane.fromApi(map.str("lane")),
        link = mapLink(map.obj("link")),
        who =
            map.obj("who")?.let { who ->
                ProfileWho(who.str("name"), who.str("portrait_url"), who.str("did"), who.str("user_id"), who.str("username"))
                    .takeIf { it.name != null || it.did != null }
            },
        whenText = map.str("when"),
    )
}

private fun mapMore(map: Map<String, Any?>?): ProfileMore? {
    val text = map?.str("text") ?: return null
    return ProfileMore(text, mapLink(map.obj("link")))
}

private fun mapAction(map: Map<String, Any?>): ProfilePageAction? =
    when (map.str("kind")) {
        "edit" -> ProfilePageAction.Edit
        "preview_as" ->
            ProfilePageAction
                .PreviewAs(map.strs("views").mapNotNull { v -> ProfileView.entries.firstOrNull { it.key == v } })
                .takeIf { it.views.isNotEmpty() }
        "share" -> ProfilePageAction.Share(map.str("url"))
        "connect" -> ProfilePageAction.Connect(map.str("state") ?: "none")
        "message" -> ProfilePageAction.Message
        "call" -> map.str("phone")?.let { ProfilePageAction.Call(it) }
        "email" -> map.str("email")?.let { ProfilePageAction.Email(it) }
        "leave_card" -> ProfilePageAction.LeaveCard(map.str("note"))
        else -> null
    }

/** A block the app can draw, or null (an unknown kind, or nothing left in it). */
private fun mapBlock(
    map: Map<String, Any?>,
    inCommon: (Map<String, Any?>) -> ProfileInCommonResponse?,
): ProfileBlock? {
    val kind = map.str("kind") ?: return null
    val id = map.str("id") ?: kind
    val title = map.str("title")
    return when (kind) {
        "lines" ->
            map.objs("lines").mapNotNull(::mapLine).takeIf { it.isNotEmpty() }?.let {
                ProfileBlock.Lines(id, title, it, mapMore(map.obj("more")))
            }
        "says" -> mapLine(map.obj("line"))?.let { ProfileBlock.Says(id, title, it) }
        "known_for" ->
            map
                .objs("lines")
                .mapNotNull { line ->
                    val base = mapLine(line) ?: return@mapNotNull null
                    val who = line.obj("who")
                    KnownForLine(
                        line = base,
                        whoName = who?.str("name"),
                        whoPortrait = who?.str("portrait_url"),
                        whoDid = who?.str("did"),
                        whoUserId = who?.str("user_id"),
                        whenText = line.str("when"),
                    )
                }.takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.KnownFor(id, title, it, mapMore(map.obj("more"))) }
        "in_common" -> inCommon(map)?.takeIf { it.hasAnything() }?.let { ProfileBlock.InCommon(id, title, it) }
        "doors" -> {
            val doors =
                map.objs("doors").mapNotNull { door ->
                    val text = door.str("text") ?: return@mapNotNull null
                    ProfileDoor(door.str("key").orEmpty(), text, door.str("note"), mapLink(door.obj("link")))
                }
            val leave = map.obj("leave_card")
            if (doors.isEmpty() && leave == null) {
                null
            } else {
                ProfileBlock.Doors(id, title, doors, leave?.str("text"), leave?.str("note"), map.str("sign_in_note"))
            }
        }
        "shelf" ->
            map
                .objs("objects")
                .mapNotNull { o ->
                    val caption = o.str("caption") ?: return@mapNotNull null
                    ShelfObject(o.str("id") ?: caption, o.str("picture_url"), caption)
                }.take(SHELF_MOST)
                .takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.Shelf(id, title, it) }
        "prompts" ->
            map
                .objs("prompts")
                .mapNotNull { p ->
                    val key = p.str("key") ?: return@mapNotNull null
                    val answer = p.str("answer") ?: p.str("text") ?: return@mapNotNull null
                    val line = mapLine(p) ?: ProfileLine(ProfileInk.Said, answer)
                    PromptLine(key, answer, line)
                }.takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.Prompts(id, title, it) }
        "pinned_posts" -> map.str("user_id")?.let { ProfileBlock.PinnedPosts(id, title, it) }
        "rows" ->
            map
                .objs("rows")
                .mapNotNull { r ->
                    val rowTitle = r.str("title") ?: return@mapNotNull null
                    ProfileRow(r.str("key").orEmpty(), rowTitle, r.str("detail"), mapLink(r.obj("link")))
                }.takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.Rows(id, title, it) }
        "can_do" ->
            map
                .objs("skills")
                .mapNotNull { s ->
                    val line = mapLine(s) ?: return@mapNotNull null
                    val inks = s.obj("inks")
                    CanDoSkill(
                        name = s.str("name") ?: line.text,
                        pieces = s.int("pieces") ?: 0,
                        seen = inks?.int("seen") ?: 0,
                        signed = inks?.int("signed") ?: 0,
                        said = inks?.int("said") ?: 0,
                        line = line,
                    )
                }.takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.CanDo(id, title, map.str("subtitle"), it) }
        "pieces" ->
            map
                .objs("pieces")
                .mapNotNull(::mapPiece)
                .takeIf { it.isNotEmpty() }
                ?.let {
                    ProfileBlock.Pieces(
                        id = id,
                        title = title,
                        pinned = map.str("style") == "pinned",
                        subtitle = map.str("subtitle"),
                        pieces = it,
                        more = mapMore(map.obj("more")),
                        filters = map.strs("filters").map(String::lowercase).filter { f -> f in PIECE_FILTERS },
                    )
                }
        "work_rings" -> mapWorkRings(map, id, title)
        "owns" ->
            map
                .objs("lines")
                .mapNotNull { l ->
                    val line = mapLine(l) ?: return@mapNotNull null
                    val badge = l.obj("badge")
                    OwnsLine(line, badge?.str("initials"), badge?.str("picture_url"))
                }.takeIf { it.isNotEmpty() }
                ?.let { ProfileBlock.Owns(id, title, it) }
        "record_chart" -> mapRecordChart(map, id, title)
        "more_closer" ->
            map.str("text")?.let { text ->
                ProfileBlock.MoreCloser(id, title, text, connect = map.obj("action")?.str("kind") == "connect")
            }
        else -> null
    }
}

private const val SHELF_MOST = 5

private fun ProfileInCommonResponse.hasAnything(): Boolean {
    val shared = (connections?.count ?: 0) > 0
    return shared || plans.isNotEmpty() || supportTrains.isNotEmpty() || skills.isNotEmpty()
}

private fun mapPiece(map: Map<String, Any?>): WorkPiece? {
    val id = map.str("id") ?: return null
    val title = map.str("title") ?: map.str("text") ?: return null
    val line = mapLine(map) ?: ProfileLine(ProfileInk.Said, title)
    // A block's piece sends the counts; v1's piece read sent `media` as the list itself, so count that instead.
    val counts = map.obj("media")
    val list = map.objs("media")

    fun count(
        key: String,
        kind: String,
    ): Int = counts?.int(key) ?: list.count { it.str("kind") == kind }
    return WorkPiece(
        id = id,
        title = title,
        kind = map.str("kind")?.lowercase()?.takeIf { it in setOf("did", "built", "owns") },
        whenText = map.str("when"),
        coverUrl = map.str("cover_url"),
        photos = count("photos", "photo"),
        videos = count("videos", "video"),
        documents = count("documents", "document"),
        links = counts?.int("links") ?: map.objs("links").size,
        line = line,
        fromMonth = map.str("from")?.takeIf { MONTH_KEY.matches(it) },
        toMonth = map.str("to")?.takeIf { MONTH_KEY.matches(it) },
        place = map.str("place"),
        pinned = map["pinned"] == true,
    )
}

private val MONTH_KEY = Regex("""\d{4}-\d{2}""")

/**
 * One piece opened (§5, P2.2), or null when there is no piece to draw. Photos and videos come from phase 2's
 * `attachments`, else from v1's `media` list; a kind the app doesn't know is skipped; links are words only.
 */
fun mapProfilePiece(dto: ProfilePieceDto): ProfilePieceDetail? {
    val map = dto.piece ?: return null
    val piece = mapPiece(map) ?: return null
    val attachments =
        (map.objs("attachments").ifEmpty { map.objs("media") }).mapIndexedNotNull { index, item ->
            val url = item.str("url") ?: return@mapIndexedNotNull null
            val kind =
                when (item.str("kind")) {
                    "photo" -> PieceAttachment.Kind.Photo
                    "video" -> PieceAttachment.Kind.Video
                    "document" -> PieceAttachment.Kind.Document
                    else -> return@mapIndexedNotNull null
                }
            PieceAttachment(
                id = item.str("id") ?: "${piece.id}-$index",
                kind = kind,
                url = url,
                thumbnailUrl = item.str("thumbnail_url"),
                title = item.str("title"),
                detail = item.str("detail"),
            )
        }
    val links =
        map.objs("links").mapNotNull { link ->
            val url = link.str("url")?.takeIf { it.startsWith("https://") || it.startsWith("http://") } ?: return@mapNotNull null
            PieceLinkCard(
                url = url,
                kind = link.str("kind")?.takeIf { it in LINK_KINDS } ?: "site",
                site = link.str("site"),
                title = link.str("title"),
                description = link.str("description"),
                ink = ProfileInk.fromApi(link.str("ink")),
                how = link.str("how"),
            )
        }
    return ProfilePieceDetail(
        piece = piece,
        description = mapLine(map.obj("description")),
        howWeKnow = map.objs("how_we_know").mapNotNull(::mapLine),
        showsCan = map.strs("shows_can").ifEmpty { map.strs("skills") }.take(MAX_SKILLS),
        gallery = attachments.filter { it.kind != PieceAttachment.Kind.Document },
        attached = attachments.filter { it.kind != PieceAttachment.Kind.Photo },
        links = links,
        written = map.objs("written").mapNotNull(::mapLine),
        keptOnce = map.str("kept_once"),
    )
}

private val LINK_KINDS = setOf("site", "video", "code", "app", "article", "paper")
private const val MAX_SKILLS = 5

private fun mapWorkRings(
    map: Map<String, Any?>,
    id: String,
    title: String?,
): ProfileBlock? {
    val from = map.int("from") ?: return null
    val now = map.str("now")?.let { runCatching { LocalDate.parse(it.take(DAY_CHARS)) }.getOrNull() } ?: return null
    val months = map.strs("months")
    if (months.none { row -> row.any { it in "123" } }) return null
    val dots =
        map.objs("dots").mapNotNull { d ->
            val piece = d.str("piece_id") ?: return@mapNotNull null
            val month = d.str("month") ?: return@mapNotNull null
            val year = month.take(YEAR_CHARS).toIntOrNull() ?: return@mapNotNull null
            val m = month.drop(YEAR_CHARS + 1).take(2).toIntOrNull()?.minus(1) ?: return@mapNotNull null
            WorkDot(piece, year, m, d.str("ink")?.let(ProfileInk::fromApi))
        }
    val years = map.objs("years").mapNotNull { y -> y.int("year")?.let { it to (y.int("pieces") ?: 0) } }
    return ProfileBlock.WorkRings(id, title, ProfileRings(from = from, now = now, work = months), dots, years)
}

private const val YEAR_CHARS = 4
private val PIECE_FILTERS = setOf("all", "did", "built", "owns")

private fun mapRecordChart(
    map: Map<String, Any?>,
    id: String,
    title: String?,
): ProfileBlock? {
    val from = map.int("from") ?: return null
    val now = map.str("now")?.let { runCatching { LocalDate.parse(it.take(DAY_CHARS)) }.getOrNull() } ?: return null
    val lanes =
        map.objs("lanes").mapNotNull { l ->
            val lane = ProfileLane.fromApi(l.str("lane")) ?: return@mapNotNull null
            lane to l.strs("months")
        }.toMap()
    if (lanes.isEmpty()) return null
    val rings =
        ProfileRings(
            from = from,
            now = now,
            home = lanes[ProfileLane.Home].orEmpty(),
            work = lanes[ProfileLane.Work].orEmpty(),
            others = lanes[ProfileLane.Others].orEmpty(),
        )
    return ProfileBlock.RecordChart(id, title, map.str("subtitle"), rings, lanes.keys, map.str("note"))
}
