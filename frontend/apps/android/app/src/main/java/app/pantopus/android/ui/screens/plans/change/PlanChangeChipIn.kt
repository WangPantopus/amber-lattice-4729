package app.pantopus.android.ui.screens.plans.change

import app.pantopus.android.data.api.models.plans.PlanChipInInput
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.ui.screens.plans.host.ChipInDraft
import app.pantopus.android.ui.screens.plans.host.of
import app.pantopus.android.ui.screens.plans.host.toInput

/*
 * The holidays' chip in on the Change screen (08-extras section 3, "Changing it"): the host form's "Chip in" card on the
 * Change screen of a private plan a person hosts, while `plans_chip_in` is on for the host. Only a change is sent: a new
 * value keeps who paid, and `"chip_in": null` takes it away and forgets who paid. A refusal shows the server's sentence
 * under the field it names (`amount_cents`, `note` or `link`). As iPhone #4294.
 */

/** Chip in as the plan has it ([original], null when it has none) and as changed here ([draft], null: off). */
data class PlanChangeChipIn(
    val shows: Boolean = false,
    val original: ChipInDraft? = null,
    val draft: ChipInDraft? = null,
    /** The server's sentence under a field it refused. */
    val errors: Map<String, String> = emptyMap(),
) {
    val changed: Boolean get() = shows && draft != original

    /** Save takes chip in away (`"chip_in": null`). */
    val removes: Boolean get() = changed && draft == null && original != null

    /** The new value Save sends, only when it changed. */
    val toSend: PlanChipInInput? get() = draft?.takeIf { changed }?.toInput()

    companion object {
        /** [chipInOn]: `plans_chip_in` is on for the host (the Change screen is the host's). */
        fun of(
            plan: PlanDto,
            chipInOn: Boolean,
        ): PlanChangeChipIn {
            val shows = chipInOn && plan.isPrivate && plan.business == null && plan.planKind != PlanKind.PLAYDATE
            if (!shows) return PlanChangeChipIn()
            val chip = plan.chipIn?.let { ChipInDraft.of(it.amountCents, it.note, it.link) }
            return PlanChangeChipIn(shows = true, original = chip, draft = chip)
        }
    }
}
