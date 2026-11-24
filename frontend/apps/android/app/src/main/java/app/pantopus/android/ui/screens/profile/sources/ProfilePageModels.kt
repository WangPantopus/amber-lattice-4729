package app.pantopus.android.ui.screens.profile.sources

import app.pantopus.android.data.api.models.profile.ProfileInCommonResponse

/*
 * The page as the app draws it (contract v1 §2–3), mapped from the server's answer by `ProfilePageMapper`. Everything
 * here is something this viewer may see: the server never sends what they may not (SPEC §4.2), so nothing here is
 * hidden by the app.
 */

/** Who the page was drawn for (contract §4). */
enum class ProfileView(
    val key: String,
) {
    Owner("owner"),
    Household("household"),
    Connection("connection"),
    Member("member"),
    Link("link"),
    ;

    companion object {
        /** An unknown view reads as the narrowest signed-in one. */
        fun fromApi(value: String?): ProfileView = entries.firstOrNull { it.key == value?.trim()?.lowercase() } ?: Member
    }
}

/** What a tap opens (contract §3.3); an unknown kind is null and the line draws without a tap. */
sealed interface ProfilePageLink {
    data class Tab(
        val key: String,
    ) : ProfilePageLink

    data object Record : ProfilePageLink

    data class Month(
        val month: String,
    ) : ProfilePageLink

    data class Piece(
        val id: String,
    ) : ProfilePageLink

    data class Business(
        val username: String,
    ) : ProfilePageLink

    data class Profile(
        val userId: String?,
        val username: String?,
    ) : ProfilePageLink

    data class Plan(
        val id: String,
    ) : ProfilePageLink

    data class Gig(
        val id: String,
    ) : ProfilePageLink

    data class SupportTrain(
        val id: String,
    ) : ProfilePageLink

    data class Posts(
        val userId: String,
    ) : ProfilePageLink

    data class Moments(
        val userId: String,
    ) : ProfilePageLink

    data class Url(
        val url: String,
        val site: String?,
    ) : ProfilePageLink
}

/** "All 6 lines" and where it goes. */
data class ProfileMore(
    val text: String,
    val link: ProfilePageLink?,
)

/** The city, its clock and its sky (contract §2.1 `place`). */
data class ProfilePlace(
    val label: String,
    val time: String?,
    val zone: String?,
    /** dawn | day | evening | night: the part before "_". */
    val sky: String?,
)

data class ProfilePageHeader(
    val userId: String,
    val username: String?,
    val name: String,
    val accountName: String?,
    val firstName: String,
    val headline: String?,
    val portraitUrl: String?,
    val seenAs: String?,
    val place: ProfilePlace?,
    val rings: ProfileRings,
)

/** An action under the name (contract §2.4), in the server's order. */
sealed interface ProfilePageAction {
    data object Edit : ProfilePageAction

    data class PreviewAs(
        val views: List<ProfileView>,
    ) : ProfilePageAction

    data class Share(
        val url: String?,
    ) : ProfilePageAction

    data class Connect(
        /** none · requested · incoming */
        val state: String,
    ) : ProfilePageAction

    data object Message : ProfilePageAction

    data class Call(
        val phone: String,
    ) : ProfilePageAction

    data class Email(
        val email: String,
    ) : ProfilePageAction

    data class LeaveCard(
        val note: String?,
    ) : ProfilePageAction
}

/** A line written about the person (contract §3.4). */
data class KnownForLine(
    val line: ProfileLine,
    val whoName: String?,
    val whoPortrait: String?,
    val whoDid: String?,
    val whoUserId: String?,
    val whenText: String?,
)

/** A door (contract §3.5). */
data class ProfileDoor(
    val key: String,
    val text: String,
    val note: String?,
    val link: ProfilePageLink?,
)

data class ShelfObject(
    val id: String,
    val pictureUrl: String?,
    val caption: String,
)

/** A Get to know answer: the catalog key (the app owns the question) and the person's words. */
data class PromptLine(
    val key: String,
    val answer: String,
    val line: ProfileLine,
)

data class ProfileRow(
    val key: String,
    val title: String,
    val detail: String?,
    val link: ProfilePageLink?,
)

/** A skill on Work (contract §3.6). */
data class CanDoSkill(
    val name: String,
    val pieces: Int,
    val seen: Int,
    val signed: Int,
    val said: Int,
    val line: ProfileLine,
)

/** A piece of work (contract §3.6). */
data class WorkPiece(
    val id: String,
    val title: String,
    /** did | built | owns | null */
    val kind: String?,
    val whenText: String?,
    val coverUrl: String?,
    val photos: Int,
    val videos: Int,
    val documents: Int,
    val links: Int,
    val line: ProfileLine,
    /** Phase 2 (P2.1): the started and finished months (`YYYY-MM`), city and state, and pinned. */
    val fromMonth: String? = null,
    val toMonth: String? = null,
    val place: String? = null,
    val pinned: Boolean = false,
) {
    /** The year the piece belongs to: its finished month, else its started month, else the year in its "when". */
    val year: Int?
        get() =
            (toMonth ?: fromMonth)?.take(YEAR_CHARS)?.toIntOrNull()
                ?: whenText?.let { Regex("""\b(\d{4})\b""").findAll(it).lastOrNull()?.value?.toIntOrNull() }

    /** The month in words without its year ("August"), for a list already split by year. */
    val monthWord: String?
        get() = whenText?.replace(Regex("""\s*\b\d{4}\b\s*"""), " ")?.trim()?.takeIf { it.isNotEmpty() }

    private companion object {
        const val YEAR_CHARS = 4
    }
}

/** A piece's dot on the work line (board 7). */
data class WorkDot(
    val pieceId: String,
    val year: Int,
    /** 0–11 */
    val month: Int,
    val ink: ProfileInk?,
)

/** One attachment on an opened piece (P2.2): a photo, a video or a document. */
data class PieceAttachment(
    val id: String,
    val kind: Kind,
    val url: String,
    val thumbnailUrl: String?,
    val title: String?,
    /** "Video · 48 seconds", "Document · PDF" */
    val detail: String?,
) {
    enum class Kind { Photo, Video, Document }
}

/** A link on a piece, read by the server into a card of words (P2.4, board 11): never a picture from the page. */
data class PieceLinkCard(
    val url: String,
    /** site | video | code | app | article | paper */
    val kind: String,
    val site: String?,
    val title: String?,
    val description: String?,
    val ink: ProfileInk,
    val how: String?,
)

/** One piece opened (board 8, contract §5 and P2.2). */
data class ProfilePieceDetail(
    val piece: WorkPiece,
    /** The person's own words, Said. */
    val description: ProfileLine?,
    /** Each source its own line: the job or plan (Seen), each signed credit (Signed), the person's words (Said). */
    val howWeKnow: List<ProfileLine>,
    val showsCan: List<String>,
    /** Photos and videos, in the person's order, for the pager. */
    val gallery: List<PieceAttachment>,
    /** Videos and documents, listed under "Attached". */
    val attached: List<PieceAttachment>,
    val links: List<PieceLinkCard>,
    /** What the person who hired them wrote (v1.2 review lines, with who and when). */
    val written: List<ProfileLine>,
    val keptOnce: String?,
)

/** An owned thing: a business, a credential, a tool, with its badge. */
data class OwnsLine(
    val line: ProfileLine,
    val initials: String?,
    val pictureUrl: String?,
)

/** One block of a tab (contract §3.2), in the server's order. */
sealed interface ProfileBlock {
    val id: String
    val title: String?

    data class Lines(
        override val id: String,
        override val title: String?,
        val lines: List<ProfileLine>,
        val more: ProfileMore?,
    ) : ProfileBlock

    data class Says(
        override val id: String,
        override val title: String?,
        val line: ProfileLine,
    ) : ProfileBlock

    data class KnownFor(
        override val id: String,
        override val title: String?,
        val lines: List<KnownForLine>,
        val more: ProfileMore?,
    ) : ProfileBlock

    data class InCommon(
        override val id: String,
        override val title: String?,
        val body: ProfileInCommonResponse,
    ) : ProfileBlock

    data class Doors(
        override val id: String,
        override val title: String?,
        val doors: List<ProfileDoor>,
        val leaveCardText: String?,
        val leaveCardNote: String?,
        val signInNote: String?,
    ) : ProfileBlock

    data class Shelf(
        override val id: String,
        override val title: String?,
        val objects: List<ShelfObject>,
    ) : ProfileBlock

    data class Prompts(
        override val id: String,
        override val title: String?,
        val prompts: List<PromptLine>,
    ) : ProfileBlock

    data class PinnedPosts(
        override val id: String,
        override val title: String?,
        val userId: String,
    ) : ProfileBlock

    data class Rows(
        override val id: String,
        override val title: String?,
        val rows: List<ProfileRow>,
    ) : ProfileBlock

    data class CanDo(
        override val id: String,
        override val title: String?,
        val subtitle: String?,
        val skills: List<CanDoSkill>,
    ) : ProfileBlock

    data class Pieces(
        override val id: String,
        override val title: String?,
        val pinned: Boolean,
        val subtitle: String?,
        val pieces: List<WorkPiece>,
        val more: ProfileMore?,
        /** The kinds a viewer can narrow the list to (board 7's All / Did / Built): `all`, `did`, `built`, `owns`. */
        val filters: List<String> = emptyList(),
    ) : ProfileBlock

    data class WorkRings(
        override val id: String,
        override val title: String?,
        val rings: ProfileRings,
        /** A dot a piece, at its year and month (0–11); its ink when the server sends it. */
        val dots: List<WorkDot>,
        val years: List<Pair<Int, Int>>,
    ) : ProfileBlock

    data class Owns(
        override val id: String,
        override val title: String?,
        val lines: List<OwnsLine>,
    ) : ProfileBlock

    data class RecordChart(
        override val id: String,
        override val title: String?,
        val subtitle: String?,
        val rings: ProfileRings,
        val lanes: Set<ProfileLane>,
        val note: String?,
    ) : ProfileBlock

    data class MoreCloser(
        override val id: String,
        override val title: String?,
        val text: String,
        val connect: Boolean,
    ) : ProfileBlock
}

data class ProfilePageTab(
    /** person | work | record */
    val key: String,
    val title: String,
    val blocks: List<ProfileBlock>,
)

/** The whole page for one viewer. */
data class ProfilePage(
    val view: ProfileView,
    val listed: Boolean,
    val header: ProfilePageHeader,
    val summary: ProfileSummary,
    val tabs: List<ProfilePageTab>,
    val actions: List<ProfilePageAction>,
    val footer: String?,
    val previewAs: ProfileView?,
) {
    val isOwner: Boolean get() = view == ProfileView.Owner && previewAs == null
}

/** One month of the rings, opened (board 13, contract §5). */
data class ProfileMonth(
    val month: String,
    val title: String,
    val subtitle: String?,
    val lines: List<ProfileLine>,
)
