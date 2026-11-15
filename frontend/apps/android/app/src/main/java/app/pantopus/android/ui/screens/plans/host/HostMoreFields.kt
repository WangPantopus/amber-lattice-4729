@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.PlanKindDetails
import app.pantopus.android.ui.screens.plans.components.PlanChoice
import app.pantopus.android.ui.screens.plans.components.PlanChoiceGroup
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanSegmented
import app.pantopus.android.ui.screens.plans.components.PlanStepperRow
import app.pantopus.android.ui.screens.plans.components.PlanTextArea
import app.pantopus.android.ui.theme.PantopusIcon

/*
 * The details step's parts of Plans steps 3 and 4: Where's "Online" choice and the link field (board Details), and the
 * four newer kinds' forms (board Type → Details), each with its chips (Something else has none).
 */

/**
 * Where's choice (board Details): "A place", the home ([homeLabel], "My place" or "My porch") and "Online" while Online
 * is offered; without it, "A public place" and the home, as before. [homeLabel] null leaves the home out (a study group).
 */
@Composable
internal fun WhereChoice(
    ui: HostUi,
    vm: HostFlowViewModel,
    homeLabel: String?,
) {
    val online = ui.showsOnline
    val options =
        buildList {
            add(HostWhere.PUBLIC to if (online) "A place" else "A public place")
            homeLabel?.let { add(HostWhere.HOME to it) }
            if (online) add(HostWhere.ONLINE to "Online")
        }
    val selected =
        when {
            ui.isOnline -> HostWhere.ONLINE
            ui.draft.atHome && homeLabel != null -> HostWhere.HOME
            else -> HostWhere.PUBLIC
        }
    PlanSegmented(
        options = options,
        selected = selected,
        onSelect = vm::setWhere,
        optionTags = options.map { (id, _) -> HostWhere.tag(id) },
        optionIcons = options.map { (id, _) -> PantopusIcon.Video.takeIf { id == HostWhere.ONLINE } },
    )
}

/** What an online plan's link field says, and what TalkBack calls it (contract section 3). */
internal const val ONLINE_LINK_PROMPT = "Paste the link people will join with"

/** An online plan's link (Plans step 3) and the promise under it. */
@Composable
internal fun OnlineLinkField(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    OnlineLinkInput(value = ui.draft.link, onValue = vm::setLink)
}

/** The link field and "The link shows only to people who are in." (the host flow and H11 share it). */
@Composable
internal fun OnlineLinkInput(
    value: String,
    onValue: (String) -> Unit,
) {
    Box(modifier = Modifier.testTag("planOnlineLink")) {
        PlanTextArea(
            value = value,
            onValue = onValue,
            placeholder = ONLINE_LINK_PROMPT,
            label = ONLINE_LINK_PROMPT,
            singleLine = true,
            keyboardOptions =
                KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
        )
    }
    PlanScopeLine("The link shows only to people who are in.")
}

/** A public place, or (while Online is offered) "A place / Online" over the place row or the link: a study group's Where. */
@Composable
internal fun PlaceOrOnline(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    if (ui.showsOnline) WhereChoice(ui, vm, homeLabel = null)
    if (ui.isOnline) OnlineLinkField(ui, vm) else PlaceRow(ui, onClick = vm::openPlaces)
}

/** Food & drinks (Plans step 4): what kind of get-together, then the common fields. */
@Composable
internal fun ColumnScope.FoodFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words =
        NewKindWords(
            title = "Tacos on the patio",
            note = "We'll be at the long table by the window.",
            about = "Bring a dish to share, or just come hungry.",
        )
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips("Kind of get-together", PlanKindDetails.FOOD, ui.draft.foodKind, "planFoodKind") { id ->
            vm.pickDetail(PlanKind.FOOD_DRINKS, id)
        }
    }
}

/** Game night (Plans step 4): what kind of game, then the common fields. */
@Composable
internal fun ColumnScope.GameNightFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words =
        NewKindWords(
            title = "Thursday trivia night",
            note = "Bring a game you love.",
            about = "Six rounds, teams of two. Bring your own snacks.",
        )
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips("Kind of game", PlanKindDetails.GAMES, ui.draft.gameKind, "planGameKind") { id ->
            vm.pickDetail(PlanKind.GAME_NIGHT, id)
        }
    }
}

/** Outdoors (Plans step 4): what kind of outing and its pace, then the common fields. It always meets in person. */
@Composable
internal fun ColumnScope.OutdoorsFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words =
        NewKindWords(
            title = "Morning hike at the lake",
            note = "Meet at the trailhead sign.",
            about = "About 3 miles with a few hills. Bring water.",
        )
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips("Kind of outing", PlanKindDetails.OUTDOORS, ui.draft.outdoorKind, "planOutdoorKind") { id ->
            vm.pickDetail(PlanKind.OUTDOORS, id)
        }
        PlanField(label = "Pace") {
            PlanSegmented(
                options = listOf(PlanKindDetails.PACE_EASY to "Easy", "brisk" to "Brisk"),
                selected = ui.draft.pace,
                onSelect = { pace -> vm.edit { it.copy(pace = pace) } },
            )
        }
    }
}

/** Something else (Plans step 4): no details, the title says what it is. */
@Composable
internal fun ColumnScope.SomethingElseFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words =
        NewKindWords(
            title = "Book club at the library",
            note = "Here's how to find us.",
            about = "Tell people what it is and what to bring.",
        )
    NewKindFields(ui = ui, vm = vm, words = words)
}

/** A newer kind's chip (Plans step 4): the choice, and the title it suggests until the host typed their own. */
private fun HostFlowViewModel.pickDetail(
    kind: PlanKind,
    id: String,
) {
    edit { draft ->
        val chosen =
            when (kind) {
                PlanKind.FOOD_DRINKS -> draft.copy(foodKind = id)
                PlanKind.GAME_NIGHT -> draft.copy(gameKind = id)
                PlanKind.OUTDOORS -> draft.copy(outdoorKind = id)
                else -> draft
            }
        if (draft.titleEdited) chosen else chosen.copy(title = PlanKindDetails.title(kind, id))
    }
}

/** A newer kind's placeholders: the title, the note for people who are in, and the about line everyone sees. */
private data class NewKindWords(
    val title: String,
    val note: String,
    val about: String,
)

/**
 * The fields every newer kind shares, as a watch party's: its chips first ([details]), the title, when, where (a
 * public place, the host's home, or online where the kind can be), who can see it, spots, how people get in (the
 * address rule and people hosted before; never "Anyone nearby"), the note and the about line.
 */
@Composable
private fun ColumnScope.NewKindFields(
    ui: HostUi,
    vm: HostFlowViewModel,
    words: NewKindWords,
    details: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val draft = ui.draft
    details?.invoke(this)
    TitleField(draft.title, vm::setTitle, placeholder = words.title)
    WhenField(ui, vm)
    WhereField(ui, vm, homeLabel = "My place")
    AudienceField(ui, vm)
    PlanStepperRow(
        title = "Spots",
        caption = "People who can join, besides you",
        value = draft.spots,
        range = 1..MAX_SPOTS,
        onChange = { value -> vm.edit { it.copy(spots = value) } },
    )
    HowPeopleGetIn(ui, vm)
    NoteField(draft.note, label = "Note for people who are in", placeholder = words.note) { text -> vm.edit { it.copy(note = text) } }
    PlanField(label = "About · everyone sees this") {
        PlanTextArea(
            value = draft.about,
            onValue = { text -> vm.edit { it.copy(about = text.take(ABOUT_MAX)) } },
            placeholder = words.about,
            label = "About, everyone sees this",
        )
    }
}

/** One detail's chips (a newer kind's `…_kind`), one chosen; each chip's test id is [tagPrefix] plus "." and its value. */
@Composable
private fun DetailChips(
    label: String,
    choices: List<Pair<String, String>>,
    selected: String,
    tagPrefix: String,
    onSelect: (String) -> Unit,
) {
    PlanField(label = label) {
        PlanChoiceGroup(
            choices = choices.map { (id, words) -> PlanChoice(id, words) },
            isSelected = { it.id == selected },
            onSelect = { choice -> onSelect(choice.id) },
            tagPrefix = tagPrefix,
        )
    }
}
