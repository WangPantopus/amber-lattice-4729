package app.pantopus.android.data.api.models.homerecord

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * The home record page as the server draws it (contract v1): a header, a list of blocks in order and a footer.
 * `GET /api/public/home-record` for a looked-up address and `GET /api/homes/:id/record` for a Home.
 *
 * The blocks arrive raw ([HomeRecordWire.blocks]) and are read one at a time by kind
 * ([app.pantopus.android.data.homerecord.HomeRecordDecoder]), so a kind this app doesn't know, or a block it can't
 * read, is left out instead of failing the page. Every string is the server's final words.
 */
@JsonClass(generateAdapter = true)
data class HomeRecordWire(
    val v: Int? = null,
    val state: String? = null,
    val header: HomeRecordHeader? = null,
    val blocks: List<Map<String, Any?>>? = null,
    val footer: String? = null,
    /** A buyer's row under the header (SPEC section 8): `save`, `share`, `claim`; read one at a time like blocks. */
    val actions: List<Map<String, Any?>>? = null,
)

/** The page once its blocks are read. [state] is `lookup`, `buyer`, `member` or `owner`. */
data class HomeRecord(
    val state: String,
    val header: HomeRecordHeader,
    val blocks: List<HomeRecordBlock>,
    val footer: String?,
    val actions: List<HomeRecordAction> = emptyList(),
)

/** One of a buyer's actions under the header: [id] is `save`, `share` or `claim`; an id this app doesn't know is left out. */
@JsonClass(generateAdapter = true)
data class HomeRecordAction(
    val id: String = "",
    val label: String = "",
    val url: String = "",
)

@JsonClass(generateAdapter = true)
data class HomeRecordHeader(
    val chip: HomeRecordChip? = null,
    val title: String = "",
    val subtitle: String? = null,
)

/** `{ tone, text }`; tone is `success`, `warning` or `neutral`. */
@JsonClass(generateAdapter = true)
data class HomeRecordChip(
    val tone: String? = null,
    val text: String = "",
)

/** An action or button: an https page, or an app link starting with `/`. */
@JsonClass(generateAdapter = true)
data class HomeRecordLink(
    val label: String = "",
    val url: String = "",
)

/** One block of the page. Each kind is its own class; [id] is unique on the page. */
sealed interface HomeRecordBlock {
    val id: String
}

// ─── picture ────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordPictureBlock(
    override val id: String = "picture",
    val above: HomeRecordAbove? = null,
    /** iOS draws a street picture from this point; Android has no free one and shows [above] only. */
    val street: HomeRecordPoint? = null,
    val caption: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordAbove(
    @Json(name = "image_url") val imageUrl: String = "",
    /** `[x, y]` fractions of the image, or null. */
    val outline: List<List<Double>>? = null,
    val chips: List<HomeRecordImageChip>? = null,
)

/** A chip on the picture; [at] is `bl` (bottom left) or `br` (bottom right). */
@JsonClass(generateAdapter = true)
data class HomeRecordImageChip(
    val at: String? = null,
    val text: String = "",
)

@JsonClass(generateAdapter = true)
data class HomeRecordPoint(
    val lat: Double? = null,
    val lng: Double? = null,
)

// ─── facts ──────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordFactsBlock(
    override val id: String = "facts",
    val tiles: List<HomeRecordFactTile>? = null,
    val line: String? = null,
    val source: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordFactTile(
    val label: String = "",
    val value: String = "",
    val unit: String? = null,
)

// ─── meters ─────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordMetersBlock(
    override val id: String = "meters",
    val title: String? = null,
    val groups: List<HomeRecordMeterGroup>? = null,
    val note: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordMeterGroup(
    val title: String? = null,
    val rows: List<HomeRecordMeterRow>? = null,
)

/** [level] is 1 to 5; [tone] is `low`, `mid` or `high`. */
@JsonClass(generateAdapter = true)
data class HomeRecordMeterRow(
    val label: String = "",
    val level: Int = 0,
    val tone: String? = null,
    val word: String? = null,
)

// ─── intro, closed groups, promise, note, section label ─────

@JsonClass(generateAdapter = true)
data class HomeRecordIntroBlock(
    override val id: String = "intro",
    val title: String = "",
    val body: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordClosedGroupBlock(
    override val id: String = "closed_group",
    val title: String = "",
    val chip: String? = null,
    val items: List<HomeRecordClosedItem>? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordClosedItem(
    val icon: String? = null,
    val title: String = "",
    val line: String? = null,
)

@JsonClass(generateAdapter = true)
data class HomeRecordPromiseBlock(
    override val id: String = "promise",
    val title: String = "",
    val body: String? = null,
    val steps: List<HomeRecordStep>? = null,
    val button: HomeRecordLink? = null,
    val alt: HomeRecordAlt? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordStep(
    val title: String = "",
    val line: String? = null,
)

/** The quieter second way: "[lead] [label]", the label a link. */
@JsonClass(generateAdapter = true)
data class HomeRecordAlt(
    val lead: String? = null,
    val label: String = "",
    val url: String = "",
)

@JsonClass(generateAdapter = true)
data class HomeRecordNoteBlock(
    override val id: String = "note",
    val icon: String? = null,
    val text: String = "",
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordSectionLabelBlock(
    override val id: String = "section_label",
    val text: String = "",
) : HomeRecordBlock

// ─── value ──────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordValueBlock(
    override val id: String = "value",
    val label: String? = null,
    val value: String = "",
    val chip: HomeRecordChip? = null,
    val bars: List<HomeRecordValueBar>? = null,
    val source: String? = null,
    val estimate: HomeRecordEstimate? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordValueBar(
    val year: String = "",
    val amount: Double = 0.0,
)

/** [low], [high] and [mark] are 0 to 1 along the track. */
@JsonClass(generateAdapter = true)
data class HomeRecordEstimate(
    val label: String? = null,
    val text: String? = null,
    val low: Double? = null,
    val high: Double? = null,
    val mark: Double? = null,
    val note: String? = null,
)

// ─── photo years ────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordPhotoYearsBlock(
    override val id: String = "photo_years",
    val title: String? = null,
    val count: String? = null,
    /** Newest last. */
    val photos: List<HomeRecordYearPhoto>? = null,
    val note: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordYearPhoto(
    val year: String = "",
    val label: String? = null,
    @Json(name = "image_url") val imageUrl: String = "",
    val outline: List<List<Double>>? = null,
)

// ─── timeline ───────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordTimelineBlock(
    override val id: String = "timeline",
    val title: String? = null,
    val items: List<HomeRecordTimelineItem>? = null,
    val note: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordTimelineItem(
    val title: String = "",
    val right: String? = null,
    val strong: Boolean = false,
    val line: String? = null,
    val mono: String? = null,
)

// ─── notice ─────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordNoticeBlock(
    override val id: String = "notice",
    val eyebrow: String? = null,
    val title: String = "",
    val line: String? = null,
) : HomeRecordBlock

// ─── rows ───────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordRowsBlock(
    override val id: String = "rows",
    val title: String? = null,
    val lead: String? = null,
    val rows: List<HomeRecordRow>? = null,
    val note: String? = null,
    val action: HomeRecordLink? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordRow(
    val label: String = "",
    val value: String? = null,
    val mono: Boolean = false,
    val chip: HomeRecordChip? = null,
)

// ─── tiles ──────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordTilesBlock(
    override val id: String = "tiles",
    val title: String? = null,
    val tiles: List<HomeRecordTile>? = null,
    val rows: List<HomeRecordPlainRow>? = null,
    val note: String? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordTile(
    val label: String = "",
    val value: String = "",
    val line: String? = null,
)

@JsonClass(generateAdapter = true)
data class HomeRecordPlainRow(
    val label: String = "",
    val value: String? = null,
)

// ─── bars ───────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordBarsBlock(
    override val id: String = "bars",
    val title: String? = null,
    val items: List<HomeRecordBarItem>? = null,
    val note: String? = null,
) : HomeRecordBlock

/** [fill] is 0 to 1; [tone] is `low`, `mid` or `high`. */
@JsonClass(generateAdapter = true)
data class HomeRecordBarItem(
    val title: String = "",
    val right: String? = null,
    val tone: String? = null,
    val fill: Double = 0.0,
    val line: String? = null,
)

// ─── card (the money card shape) ────────────────────────────

@JsonClass(generateAdapter = true)
data class HomeRecordCardBlock(
    override val id: String = "card",
    val title: String = "",
    val chip: HomeRecordChip? = null,
    val lead: String? = null,
    val rows: List<HomeRecordCardRow>? = null,
    val notes: List<String>? = null,
    val source: String? = null,
    val action: HomeRecordLink? = null,
) : HomeRecordBlock

@JsonClass(generateAdapter = true)
data class HomeRecordCardRow(
    val id: String? = null,
    val label: String = "",
    val value: String? = null,
)
