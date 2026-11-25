@file:Suppress("LongMethod", "TooManyFunctions", "MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.profile.ProfilePieceRepository
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.sheetKeyboardRules
import app.pantopus.android.ui.screens.profile.ProfileAvatar
import app.pantopus.android.ui.theme.PantopusColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Signing for the person themself (P2.5, p2.7): what others asked them to sign ("Asked of you", credit asks only:
 * roles come with roles), Sign and "Not me", and on a piece they signed their two choices and "Take my name off".
 * [changed] moves after each change so the page and the open piece are read again.
 */
@HiltViewModel
class ProfileTiesViewModel
    @Inject
    constructor(
        private val pieces: ProfilePieceRepository,
    ) : ViewModel() {
        private val _asks = MutableStateFlow<List<ProfileAsk>>(emptyList())
        val asks: StateFlow<List<ProfileAsk>> = _asks.asStateFlow()

        private val _busy = MutableStateFlow<Set<String>>(emptySet())
        val busy: StateFlow<Set<String>> = _busy.asStateFlow()

        private val _notice = MutableStateFlow<String?>(null)
        val notice: StateFlow<String?> = _notice.asStateFlow()

        private val _changed = MutableStateFlow(0)
        val changed: StateFlow<Int> = _changed.asStateFlow()

        fun loadAsks() {
            viewModelScope.launch {
                val result = pieces.asks()
                if (result is NetworkResult.Success) _asks.value = result.data.filter { it.kind == "credit" }
            }
        }

        fun sign(
            ask: ProfileAsk,
            choices: TieChoices,
        ) = answer(ask, if (choices.showOnMyWork) "Signed. It's on your Work too." else "Signed.") { pieces.sign(ask.id, choices) }

        fun decline(ask: ProfileAsk) = answer(ask, "Done. ${ask.fromName} sees you didn't confirm.") { pieces.decline(ask.id) }

        /** The signer's two choices on a piece they signed (the credit's id is its tie). */
        fun change(
            credit: PieceCredit,
            choices: TieChoices,
        ) = act(credit.id, "Saved.") { pieces.updateTie(credit.id, choices) }

        /** Takes the signer's name off: it leaves the piece and their own Work at once. */
        fun takeNameOff(tieId: String) = act(tieId, "Your name is off it.") { pieces.removeTie(tieId) }

        fun dismissNotice() {
            _notice.value = null
        }

        private fun answer(
            ask: ProfileAsk,
            done: String,
            call: suspend () -> NetworkResult<Unit>,
        ) = act(ask.id, done) {
            val result = call()
            // Gone already (the piece hidden, the ask taken back): it leaves the list either way.
            if (result is NetworkResult.Success || (result as? NetworkResult.Failure)?.error == NetworkError.NotFound) {
                _asks.update { list -> list.filterNot { it.id == ask.id } }
            }
            result
        }

        private fun act(
            key: String,
            done: String?,
            call: suspend () -> NetworkResult<Unit>,
        ) {
            if (key in _busy.value) return
            _busy.update { it + key }
            viewModelScope.launch {
                val result = call()
                _busy.update { it - key }
                _notice.value =
                    when (result) {
                        is NetworkResult.Success -> done
                        is NetworkResult.Failure ->
                            when (val error = result.error) {
                                NetworkError.NotFound -> "That isn't there any more."
                                is NetworkError.ClientError -> error.message
                                else -> "That didn't go through. Try again."
                            }
                    }
                if (result is NetworkResult.Success) _changed.update { it + 1 }
            }
        }
    }

/** Who was on it (board 8), for a viewer signed in: the owner's row (their own piece), and the signer's own actions. */
internal data class PieceCreditActions(
    val owner: ProfilePageHeader?,
    val onOpenPerson: (String) -> Unit,
    val onTakeNameOff: (tieId: String) -> Unit,
    val onChangeChoices: (PieceCredit, TieChoices) -> Unit,
)

/** Someone to ask or name on a piece: a person on Pantopus ([userId]) or, with none, a typed name. */
data class CreditCandidate(
    val userId: String?,
    val name: String,
    val portraitUrl: String?,
    /** Why they are offered first ("who hired you"); null for a connection. */
    val why: String? = null,
    val relation: String? = null,
)

/**
 * "Who was on it" on an opened piece (board 8): the owner's own part, then each person with what they did and where
 * their credit stands (Signed, Said; the owner also sees "Asked" and "Did not confirm"; nobody else ever sees a
 * refusal). A person who signed sees their own two choices and "Take my name off" under their row.
 */
@Composable
internal fun WhoWasOnIt(
    detail: ProfilePieceDetail,
    owner: ProfilePageHeader?,
    onOpenPerson: (String) -> Unit,
    onTakeNameOff: (PieceCredit) -> Unit,
    onChangeChoices: (PieceCredit, TieChoices) -> Unit,
) {
    if (detail.credits.isEmpty()) return
    var confirmOff by remember { mutableStateOf<PieceCredit?>(null) }
    Column(
        modifier = Modifier.sourcesCard().padding(16.dp).testTag("profileSources.piece.credits"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        SourcesOverline("Who was on it")
        if (owner != null) {
            PersonRow(
                name = owner.name,
                portraitUrl = owner.portraitUrl,
                seed = owner.userId,
                subtitle = detail.ownerRole,
                trailing = {},
                onOpen = null,
            )
        }
        detail.credits.forEach { credit ->
            if (owner != null || credit != detail.credits.first()) SourcesDivider()
            PersonRow(
                name = credit.name ?: credit.did.orEmpty(),
                portraitUrl = credit.portraitUrl,
                seed = credit.userId ?: credit.id,
                subtitle = credit.role?.takeIf { credit.name != null },
                trailing = { CreditStatus(credit) },
                onOpen = credit.userId?.let { id -> { onOpenPerson(id) } },
            )
            credit.mine?.let { saved ->
                // The switch moves at once; the piece read again after the save brings the server's answer.
                var choices by remember(credit.id, saved) { mutableStateOf(saved) }
                val change: (TieChoices) -> Unit = { next ->
                    choices = next
                    onChangeChoices(credit, next)
                }
                Column(Modifier.padding(start = 52.dp, bottom = 8.dp)) {
                    Text("What shows", style = SourcesType.rowTitle, modifier = Modifier.semantics { heading() })
                    ChoiceRow("Show this piece on my Work too", choices.showOnMyWork) { change(choices.copy(showOnMyWork = it)) }
                    ChoiceRow(
                        "Show my name on pages opened by a link",
                        choices.showNameOnLinks,
                        note = "Off: those pages say what you did, not who you are.",
                    ) { change(choices.copy(showNameOnLinks = it)) }
                    Text(
                        "Take my name off",
                        style = SourcesType.link.copy(color = PantopusColors.error),
                        modifier =
                            Modifier
                                .heightIn(min = 48.dp)
                                .clickable(role = Role.Button) { confirmOff = credit }
                                .padding(vertical = 14.dp),
                    )
                }
            }
        }
    }
    confirmOff?.let { credit ->
        AlertDialog(
            onDismissRequest = { confirmOff = null },
            title = { Text("Take your name off?") },
            text = { Text("It leaves this piece and your own Work at once.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmOff = null
                    onTakeNameOff(credit)
                }) { Text("Take it off", color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmOff = null }) { Text("Keep it") } },
        )
    }
}

/** A credit's status on the right: the ink with its word, or the owner's "Asked today" / "Did not confirm". */
@Composable
private fun CreditStatus(credit: PieceCredit) {
    when (credit.status) {
        "asked" -> Text(credit.how ?: "Asked", style = SourcesType.caption)
        "did_not_confirm" -> Text(credit.how ?: "Did not confirm", style = SourcesType.caption)
        else ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                InkGlyph(credit.ink)
                Text(credit.how ?: credit.ink.word, style = SourcesType.caption.copy(color = PantopusColors.appTextSecondary))
            }
    }
}

@Composable
private fun PersonRow(
    name: String,
    portraitUrl: String?,
    seed: String?,
    subtitle: String?,
    trailing: @Composable () -> Unit,
    onOpen: (() -> Unit)?,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                .padding(vertical = 8.dp)
                .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ProfileAvatar(name = name, photoUrl = portraitUrl, seed = seed, size = 40.dp)
        Column(Modifier.weight(1f)) {
            Text(name, style = SourcesType.rowTitle)
            subtitle?.let { Text(it, style = SourcesType.caption) }
        }
        trailing()
    }
}

@Composable
private fun ChoiceRow(
    label: String,
    on: Boolean,
    note: String? = null,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(value = on, role = Role.Switch, onValueChange = onChange)
                .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = SourcesType.secondary.copy(color = PantopusColors.appText))
            note?.let { Text(it, style = SourcesType.caption) }
        }
        Switch(checked = on, onCheckedChange = null)
    }
}

/**
 * "Asked of you" at the top of the person's own Work (P2.5): each piece someone asked them to sign, with Sign (and its
 * two choices) and "Not me". A tap on the piece opens it.
 */
@Composable
internal fun AskedOfYou(
    asks: List<ProfileAsk>,
    busy: Set<String>,
    onOpen: (ProfileAsk) -> Unit,
    onSign: (ProfileAsk, TieChoices) -> Unit,
    onDecline: (ProfileAsk) -> Unit,
) {
    if (asks.isEmpty()) return
    var signing by remember { mutableStateOf<ProfileAsk?>(null) }
    var declining by remember { mutableStateOf<ProfileAsk?>(null) }
    Column(Modifier.sourcesCard().padding(16.dp).testTag("profileSources.asked"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SourcesOverline("Asked of you")
        asks.forEachIndexed { index, ask ->
            if (index > 0) SourcesDivider()
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .then(
                            if (ask.pieceId != null) {
                                Modifier.clickable(onClickLabel = "Open the piece", role = Role.Button) { onOpen(ask) }
                            } else {
                                Modifier
                            },
                        )
                        .padding(vertical = 6.dp)
                        .semantics(mergeDescendants = true) { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ProfileAvatar(name = ask.fromName, photoUrl = ask.fromPortraitUrl, seed = ask.fromUserId, size = 40.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(ask.fromName) }
                            append(" named you on a piece")
                            ask.role?.let { role ->
                                append(" as ")
                                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(role) }
                            }
                            append(".")
                        },
                        style = SourcesType.body,
                    )
                    ask.pieceTitle?.let { title ->
                        Text(listOfNotNull(title, ask.pieceWhen).joinToString(" · "), style = SourcesType.link)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AskButton("Sign", primary = true, enabled = ask.id !in busy, modifier = Modifier.weight(1f)) { signing = ask }
                AskButton("Not me", primary = false, enabled = ask.id !in busy, modifier = Modifier.weight(1f)) { declining = ask }
            }
        }
    }
    signing?.let { ask ->
        SignDialog(
            ask = ask,
            onDismiss = { signing = null },
            onSign = { choices ->
                signing = null
                onSign(ask, choices)
            },
        )
    }
    declining?.let { ask ->
        AlertDialog(
            onDismissRequest = { declining = null },
            title = { Text("Not you on this piece?") },
            text = { Text("${ask.fromName} will see that you didn't confirm. Nobody else does.") },
            confirmButton = {
                TextButton(onClick = {
                    declining = null
                    onDecline(ask)
                }) { Text("Not me") }
            },
            dismissButton = { TextButton(onClick = { declining = null }) { Text("Keep it") } },
        )
    }
}

/** Signing (P2.5): the piece on your own Work too (on), and your name on pages opened by a link (off, rule 4.5). */
@Composable
private fun SignDialog(
    ask: ProfileAsk,
    onDismiss: () -> Unit,
    onSign: (TieChoices) -> Unit,
) {
    var onWork by remember { mutableStateOf(true) }
    var onLinks by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sign ${ask.pieceTitle ?: "this piece"}?") },
        text = {
            Column {
                ChoiceRow("Show this piece on my Work too", onWork) { onWork = it }
                ChoiceRow("Show my name on pages opened by a link", onLinks, note = "Off: those pages say what you did, not who you are.") {
                    onLinks = it
                }
                Spacer(Modifier.size(8.dp))
                Text(
                    "Signing says you were on this piece. You can take your name off at any time.",
                    style = SourcesType.secondary,
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSign(TieChoices(onWork, onLinks)) }) { Text("Sign") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun AskButton(
    title: String,
    primary: Boolean,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (primary && enabled) PantopusColors.primary600 else PantopusColors.appSurface)
                .then(
                    if (primary && enabled) Modifier else Modifier.border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(12.dp)),
                )
                .clickable(role = Role.Button, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            style =
                SourcesType.title.copy(
                    color =
                        when {
                            !enabled -> PantopusColors.appTextMuted
                            primary -> PantopusColors.appTextInverse
                            else -> PantopusColors.appText
                        },
                ),
        )
    }
}

/** The editor's "Who was on it?" (board 10): each person with where they stand, and "Add a person and ask them to sign". */
@Composable
internal fun EditorCredits(
    credits: List<PieceCredit>,
    suggested: List<SuggestedCredit>,
    saved: Boolean,
    asking: Boolean,
    onAsk: (SuggestedCredit) -> Unit,
    onAdd: () -> Unit,
    onRemove: (PieceCredit) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Who was on it?", style = SourcesType.title, modifier = Modifier.semantics { heading() })
        if (!saved) {
            Text("Once the piece is saved, you can ask the people who were on it to sign it.", style = SourcesType.caption)
            return@Column
        }
        Column(Modifier.sourcesCard()) {
            // "<Name>, who hired you" first (p2.6): one tap asks them, relation `for`, no role.
            suggested.forEach { person ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ProfileAvatar(name = person.name, photoUrl = person.portraitUrl, seed = person.userId, size = 40.dp)
                    Text(
                        listOfNotNull(person.name, person.why).joinToString(", "),
                        style = SourcesType.rowTitle,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "Ask to sign",
                        style = SourcesType.link.copy(color = if (asking) PantopusColors.appTextMuted else PantopusColors.primary600),
                        modifier =
                            Modifier
                                .heightIn(min = 48.dp)
                                .clickable(
                                    enabled = !asking,
                                    onClickLabel = "Ask ${person.name} to sign",
                                    role = Role.Button,
                                ) { onAsk(person) }
                                .padding(horizontal = 12.dp, vertical = 14.dp),
                    )
                }
                SourcesDivider(Modifier.padding(horizontal = 16.dp))
            }
            credits.forEachIndexed { index, credit ->
                if (index > 0) SourcesDivider(Modifier.padding(horizontal = 16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ProfileAvatar(
                        name = credit.name ?: credit.did.orEmpty(),
                        photoUrl = credit.portraitUrl,
                        seed = credit.userId ?: credit.id,
                        size = 40.dp,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(credit.name ?: credit.did.orEmpty(), style = SourcesType.rowTitle)
                        credit.role?.let { Text(it, style = SourcesType.caption) }
                    }
                    StatusChip(credit)
                    Text(
                        "Remove",
                        style = SourcesType.link.copy(color = PantopusColors.appTextSecondary),
                        modifier =
                            Modifier
                                .heightIn(min = 48.dp)
                                .clickable(
                                    onClickLabel = "Take ${credit.name ?: "them"} off this piece",
                                    role = Role.Button,
                                ) { onRemove(credit) }
                                .padding(horizontal = 8.dp, vertical = 14.dp),
                    )
                }
            }
            if (credits.isNotEmpty()) SourcesDivider(Modifier.padding(horizontal = 16.dp))
            Text(
                "+ Add a person and ask them to sign",
                style = SourcesType.link,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button, onClick = onAdd)
                        .padding(16.dp)
                        .testTag("profileSources.pieceEditor.addCredit"),
            )
        }
    }
}

@Composable
private fun StatusChip(credit: PieceCredit) {
    val (text, background, color) =
        when (credit.status) {
            "signed" -> Triple("Signed", PantopusColors.appSurfaceSunken, PantopusColors.success)
            "asked" -> Triple(credit.how ?: "Asked", PantopusColors.appSurfaceSunken, PantopusColors.appTextSecondary)
            "did_not_confirm" -> Triple("Did not confirm", PantopusColors.appSurfaceSunken, PantopusColors.appTextMuted)
            else -> Triple("Said", PantopusColors.appSurfaceSunken, PantopusColors.appTextSecondary)
        }
    Text(
        text,
        style = SourcesType.caption.copy(color = color, fontWeight = FontWeight.SemiBold),
        modifier = Modifier.clip(RoundedCornerShape(50)).background(background).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/**
 * Adding a person to a piece (board 10): someone suggested (the person who hired you), one of your connections, or a
 * name typed for someone not on Pantopus (Said); what they did and how you worked together. A person on Pantopus gets
 * one notification and signs on their own phone.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun AddCreditSheet(
    suggested: List<CreditCandidate>,
    connections: List<CreditCandidate>,
    saving: Boolean,
    notice: String?,
    onDismiss: () -> Unit,
    onAdd: (candidate: CreditCandidate, role: String?, relation: String) -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var chosen by remember { mutableStateOf<CreditCandidate?>(null) }
    var typed by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var relation by remember { mutableStateOf("with") }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = PantopusColors.appBg,
        modifier = Modifier.sheetKeyboardRules(),
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Who was on it?", style = SourcesType.h3, modifier = Modifier.semantics { heading() })
            val pick = chosen
            if (pick == null) {
                if (suggested.isNotEmpty()) {
                    SourcesOverline("Suggested")
                    suggested.forEach { c ->
                        CandidateRow(c) {
                            chosen = c
                            c.relation?.let { relation = it }
                        }
                    }
                }
                SourcesOverline("Your connections")
                OutlinedTextField(
                    value = filter,
                    onValueChange = { filter = it },
                    singleLine = true,
                    placeholder = { Text("Find a connection") },
                    modifier = Modifier.fillMaxWidth(),
                )
                val shown = connections.filter { filter.isBlank() || it.name.contains(filter.trim(), ignoreCase = true) }.take(30)
                if (shown.isEmpty()) Text("No connections match.", style = SourcesType.caption)
                shown.forEach { c -> CandidateRow(c) { chosen = c } }
                SourcesOverline("Someone not on Pantopus")
                OutlinedTextField(
                    value = typed,
                    onValueChange = { typed = it.take(60) },
                    singleLine = true,
                    placeholder = { Text("Their name") },
                    supportingText = { Text("Shows as Said; their name never shows on a page opened by a link.") },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (typed.isNotBlank()) {
                    Text(
                        "Use this name",
                        style = SourcesType.link,
                        modifier =
                            Modifier
                                .heightIn(min = 48.dp)
                                .clickable(role = Role.Button) { chosen = CreditCandidate(null, typed.trim(), null) }
                                .padding(vertical = 14.dp),
                    )
                }
            } else {
                CandidateRow(pick) { chosen = null }
                OutlinedTextField(
                    value = role,
                    onValueChange = { role = it.take(40) },
                    singleLine = true,
                    label = { Text("What they did") },
                    placeholder = { Text("Carpenter") },
                    supportingText = { Text("${role.length} of 40") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("How you worked together", style = SourcesType.rowTitle)
                FlowRow(
                    modifier = Modifier.selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("with" to "Worked with me", "led" to "I led them", "learned_from" to "I learned from them", "for" to "Hired me")
                        .forEach { (key, words) ->
                            val selected = relation == key
                            Text(
                                words,
                                style =
                                    SourcesType.secondary.copy(
                                        color = if (selected) PantopusColors.appTextInverse else PantopusColors.appText,
                                        fontWeight = FontWeight.SemiBold,
                                    ),
                                modifier =
                                    Modifier
                                        .heightIn(min = 48.dp)
                                        .selectable(selected = selected, role = Role.RadioButton) { relation = key }
                                        .padding(vertical = 6.dp)
                                        .clip(RoundedCornerShape(50))
                                        .background(if (selected) PantopusColors.appText else PantopusColors.appSurfaceSunken)
                                        .padding(horizontal = 14.dp, vertical = 8.dp),
                            )
                        }
                }
                notice?.let { Text(it, style = SourcesType.secondary.copy(color = PantopusColors.error)) }
                PrimaryButton(
                    title = if (pick.userId != null) "Ask ${pick.name} to sign" else "Add their name",
                    onClick = { onAdd(pick, role.trim().takeIf { it.isNotEmpty() }, relation) },
                    isEnabled = !saving,
                    isLoading = saving,
                    modifier = Modifier.fillMaxWidth().testTag("profileSources.pieceEditor.askCredit"),
                )
            }
        }
    }
}

@Composable
private fun CandidateRow(
    candidate: CreditCandidate,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(12.dp))
                .clickable(role = Role.Button, onClick = onClick)
                .padding(vertical = 6.dp)
                .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ProfileAvatar(name = candidate.name, photoUrl = candidate.portraitUrl, seed = candidate.userId ?: candidate.name, size = 40.dp)
        Column(Modifier.weight(1f)) {
            Text(candidate.name, style = SourcesType.rowTitle)
            candidate.why?.let { Text(it.replaceFirstChar(Char::uppercase), style = SourcesType.caption) }
        }
    }
}
