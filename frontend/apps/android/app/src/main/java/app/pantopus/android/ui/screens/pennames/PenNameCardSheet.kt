@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.pennames

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.pennames.PenNameCardDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pennames.PenNameRefusal
import app.pantopus.android.data.pennames.PenNamesRepository
import app.pantopus.android.data.posts.PulsePostsRefreshNotifier
import app.pantopus.android.ui.components.DestructiveButton
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The small card's state. */
sealed interface PenNameCardUi {
    data object Loading : PenNameCardUi

    data class Loaded(
        val card: PenNameCardDto,
        val isWorking: Boolean = false,
        /** What the last Mute or Block did, or why it didn't. */
        val note: String? = null,
    ) : PenNameCardUi

    data class Error(val message: String) : PenNameCardUi
}

/** Backs the small card a made-up name opens (`GET /api/pen-names/:id`), with Mute and Block. */
@HiltViewModel
class PenNameCardViewModel
    @Inject
    constructor(
        private val repo: PenNamesRepository,
        private val postsRefresh: PulsePostsRefreshNotifier,
    ) : ViewModel() {
        private val _state = MutableStateFlow<PenNameCardUi>(PenNameCardUi.Loading)
        val state: StateFlow<PenNameCardUi> = _state.asStateFlow()
        private var loadedId: String? = null

        fun load(id: String) {
            if (loadedId == id) return
            loadedId = id
            _state.value = PenNameCardUi.Loading
            viewModelScope.launch {
                _state.value =
                    when (val result = repo.card(id)) {
                        is NetworkResult.Success -> PenNameCardUi.Loaded(result.data)
                        is NetworkResult.Failure ->
                            PenNameCardUi.Error(PenNameRefusal.from(result.error)?.message ?: result.error.message)
                    }
            }
        }

        fun toggleMute() = act(mute = true)

        fun toggleBlock() = act(mute = false)

        private fun act(mute: Boolean) {
            val loaded = _state.value as? PenNameCardUi.Loaded ?: return
            if (loaded.isWorking) return
            val card = loaded.card
            val on = if (mute) !card.muted else !card.blocked
            _state.value = loaded.copy(isWorking = true, note = null)
            viewModelScope.launch {
                val result = if (mute) repo.setMuted(card.id, on) else repo.setBlocked(card.id, on)
                _state.value =
                    when (result) {
                        is NetworkResult.Success -> {
                            // The lists read again without (or with) the name's posts.
                            postsRefresh.notifyPostsDidChange()
                            val updated = if (mute) card.copy(muted = on) else card.copy(blocked = on)
                            PenNameCardUi.Loaded(updated, note = noteFor(mute, on, card.name))
                        }
                        is NetworkResult.Failure ->
                            loaded.copy(isWorking = false, note = PenNameRefusal.from(result.error)?.message ?: result.error.message)
                    }
            }
        }

        private fun noteFor(
            mute: Boolean,
            on: Boolean,
            name: String,
        ): String =
            when {
                mute && on -> PenNameCopy.muted(name)
                mute -> PenNameCopy.unmuted(name)
                on -> PenNameCopy.blocked(name)
                else -> PenNameCopy.unblocked(name)
            }
    }

/**
 * The small card a tap on a made-up name opens: the name, the drawn picture, its marks and the note, with **Mute**,
 * **Block** and **Report** (the post's own report, [onReport]; null leaves it out). Never a profile, Message or
 * Connect. The writer's own name says "Only you can see this is you" and offers nothing.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun PenNameCardSheet(
    penNameId: String,
    onReport: (() -> Unit)?,
    onDismiss: () -> Unit,
    viewModel: PenNameCardViewModel = hiltViewModel(key = "penNameCard_$penNameId"),
) {
    LaunchedEffect(penNameId) { viewModel.load(penNameId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.s4)
                    .padding(bottom = Spacing.s4)
                    .navigationBarsPadding()
                    .testTag("penNameCard"),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            when (val current = state) {
                PenNameCardUi.Loading -> Shimmer(width = 240.dp, height = 56.dp, modifier = Modifier.padding(vertical = Spacing.s5))
                is PenNameCardUi.Error ->
                    Text(text = current.message, style = PantopusTextStyle.body, color = PantopusColors.appTextSecondary)
                is PenNameCardUi.Loaded ->
                    PenNameCardContent(
                        state = current,
                        onMute = viewModel::toggleMute,
                        onBlock = viewModel::toggleBlock,
                        onReport =
                            onReport?.let { report ->
                                {
                                    onDismiss()
                                    report()
                                }
                            },
                    )
            }
        }
    }
}

@Composable
private fun PenNameCardContent(
    state: PenNameCardUi.Loaded,
    onMute: () -> Unit,
    onBlock: () -> Unit,
    onReport: (() -> Unit)?,
) {
    val card = state.card
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
        PenNamePicture(url = card.avatarUrl, size = 56.dp)
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Text(
                text = if (card.isYours) PenNameCopy.you(card.name) else card.name,
                style = PantopusTextStyle.h3,
                color = PantopusColors.appText,
                modifier = Modifier.testTag("penNameCardName"),
            )
            PenNameMarks(verifiedHome = PEN_NAME_BADGE_VERIFIED_HOME in card.badges || card.badges.isEmpty(), testTagSuffix = "card")
        }
    }
    Text(
        text = card.note ?: PenNameCopy.CARD_NOTE,
        style = PantopusTextStyle.body,
        color = PantopusColors.appTextStrong,
        modifier = Modifier.testTag("penNameCardNote"),
    )
    if (card.isYours) {
        PenNameOnlyYouLine(testTagSuffix = "card")
        return
    }
    state.note?.let {
        Text(
            text = it,
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.testTag("penNameCardResult"),
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        GhostButton(
            title = if (card.muted) PenNameCopy.UNMUTE else PenNameCopy.MUTE,
            onClick = onMute,
            isEnabled = !state.isWorking,
            modifier = Modifier.weight(1f).testTag("penNameCardMute"),
        )
        GhostButton(
            title = if (card.blocked) PenNameCopy.UNBLOCK else PenNameCopy.BLOCK,
            onClick = onBlock,
            isEnabled = !state.isWorking,
            modifier = Modifier.weight(1f).testTag("penNameCardBlock"),
        )
    }
    onReport?.let { report ->
        DestructiveButton(
            title = PenNameCopy.REPORT,
            onClick = report,
            modifier = Modifier.fillMaxWidth().testTag("penNameCardReport"),
        )
    }
}
