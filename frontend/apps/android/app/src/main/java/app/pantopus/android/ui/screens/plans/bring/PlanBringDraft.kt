package app.pantopus.android.ui.screens.plans.bring

import app.pantopus.android.data.api.models.plans.PlanBringDto
import app.pantopus.android.data.api.models.plans.PlanBringInput
import app.pantopus.android.data.api.models.plans.PlanBringItemInput
import java.util.UUID

/** One thing while the host edits the bring list (Plans for the holidays, A9). */
data class BringDraftItem(
    /** This screen's own key for the row; a saved item's [id] is the server's. */
    val key: String = UUID.randomUUID().toString(),
    val id: String? = null,
    val label: String,
    val note: String = "",
    /** Someone else is bringing it: their first name. Null while it's open or the host's. */
    val claimName: String? = null,
    /** The host is bringing it. */
    val mine: Boolean = false,
)

/** The bring list as the host edits it: its items and whether guests can add their own. */
data class BringDraft(
    val items: List<BringDraftItem> = emptyList(),
    val guestsCanAdd: Boolean = true,
) {
    /** Room for one more (up to 30). */
    val canAdd: Boolean get() = items.size < MAX_ITEMS

    /** What the host sends: kept items by id; the host's own claim as `mine` (others' claims stay as they are). */
    fun toInput(): PlanBringInput =
        PlanBringInput(
            items =
                items.map { item ->
                    PlanBringItemInput(
                        id = item.id,
                        label = item.label.trim(),
                        note = item.note.trim().takeIf(String::isNotEmpty),
                        mine = item.mine.takeIf { item.claimName == null },
                    )
                },
            guestsCanAdd = guestsCanAdd,
        )

    fun add(label: String): BringDraft {
        val clean = label.trim().take(MAX_LABEL)
        if (clean.isEmpty() || !canAdd) return this
        return copy(items = items + BringDraftItem(label = clean))
    }

    fun remove(key: String): BringDraft = copy(items = items.filterNot { it.key == key })

    fun replace(item: BringDraftItem): BringDraft = copy(items = items.map { if (it.key == item.key) item else it })

    companion object {
        const val MAX_ITEMS = 30
        const val MAX_LABEL = 60
        const val MAX_NOTE = 80

        /** The list as a card carries it (`bring`), or a new empty list. */
        fun from(dto: PlanBringDto?): BringDraft =
            if (dto == null) {
                BringDraft()
            } else {
                BringDraft(
                    items =
                        dto.items.map { item ->
                            BringDraftItem(
                                id = item.id,
                                label = item.label,
                                note = item.note.orEmpty(),
                                claimName = item.claim?.takeIf { !it.mine }?.name,
                                mine = item.claim?.mine == true,
                            )
                        },
                    guestsCanAdd = dto.guestsCanAdd,
                )
            }
    }
}
