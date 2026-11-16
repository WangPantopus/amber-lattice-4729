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

/** Food & drinks (Plans step 4): its "Kind", then the common fields. */
@Composable
internal fun ColumnScope.FoodFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words = NewKindWords(title = "Potluck dinner in the backyard", note = "Bring a side to share. We'll have drinks.")
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips(PlanKindDetails.FOOD, ui.draft.foodKind, "planFoodKind") { id -> vm.edit { it.copy(foodKind = id) } }
    }
}

/** Game night (Plans step 4): its "Kind", then the common fields. */
@Composable
internal fun ColumnScope.GameNightFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words = NewKindWords(title = "Board games and snacks", note = "Bring a game if you like. Snacks are on me.")
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips(PlanKindDetails.GAMES, ui.draft.gameKind, "planGameKind") { id -> vm.edit { it.copy(gameKind = id) } }
    }
}

/** Outdoors (Plans step 4): its "Kind" and pace (the walk's), then the common fields. It always meets in person. */
@Composable
internal fun ColumnScope.OutdoorsFields(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    val words = NewKindWords(title = "Saturday hike around the lake", note = "Meet at the trailhead lot. Bring water.")
    NewKindFields(ui = ui, vm = vm, words = words) {
        DetailChips(PlanKindDetails.OUTDOORS, ui.draft.outdoorKind, "planOutdoorKind") { id -> vm.edit { it.copy(outdoorKind = id) } }
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
    NewKindFields(ui = ui, vm = vm, words = NewKindWords(title = "Book club at the café", note = "Meet by the front door."))
}

/** A newer kind's hints (as on iPhone): the title, and the note for people who are in (an online plan's is its own). */
private data class NewKindWords(
    val title: String,
    val note: String,
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
    val note = if (ui.isOnline) ONLINE_NOTE_HINT else words.note
    NoteField(draft.note, label = "Note for people who are in", placeholder = note) { text -> vm.edit { it.copy(note = text) } }
    PlanField(label = "About · everyone sees this") {
        PlanTextArea(
            value = draft.about,
            onValue = { text -> vm.edit { it.copy(about = text.take(ABOUT_MAX)) } },
            // iPhone's hint for every person's plan.
            placeholder = "Big screen in the backyard. Kids welcome.",
            label = "About, everyone sees this",
        )
    }
}

/**
 * One detail's chips under "Kind" (the walk's label, as on iPhone), one chosen; the group's test id is [tag] and each
 * chip's [tag] plus "." and its value.
 */
@Composable
private fun DetailChips(
    choices: List<Pair<String, String>>,
    selected: String,
    tag: String,
    onSelect: (String) -> Unit,
) {
    PlanField(label = "Kind", modifier = Modifier.testTag(tag)) {
        PlanChoiceGroup(
            choices = choices.map { (id, words) -> PlanChoice(id, words) },
            isSelected = { it.id == selected },
            onSelect = { choice -> onSelect(choice.id) },
            tagPrefix = tag,
        )
    }
}
