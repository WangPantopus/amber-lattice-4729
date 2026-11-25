@file:Suppress("MatchingDeclarationName")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.profile.ProfilePieceRepository
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The owner's pieces and offers (`GET /me/pieces`), for the top of their own Work tab. */
@HiltViewModel
class ProfileOwnerWorkViewModel
    @Inject
    constructor(
        private val pieces: ProfilePieceRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow<OwnerPieces?>(null)
        val state: StateFlow<OwnerPieces?> = _state.asStateFlow()

        fun load() {
            viewModelScope.launch {
                val result = pieces.mine()
                if (result is NetworkResult.Success) _state.value = result.data
            }
        }
    }

/**
 * The top of the owner's own Work tab (board 10's way in): each job done and plan hosted that is not yet a piece, one
 * tap to start one from it (Seen), and "Add a piece" for one of their own. Nobody else sees this card.
 */
@Composable
internal fun OwnerWorkStart(
    offers: List<PieceOffer>,
    onStart: (PieceOffer) -> Unit,
    onAdd: () -> Unit,
) {
    Column(Modifier.sourcesCard().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 12.dp).testTag("profileSources.ownerWork")) {
        SourcesOverline("Add to your Work")
        offers.forEach { offer ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(onClickLabel = "Start a piece from it", role = Role.Button) { onStart(offer) }
                        .padding(vertical = 12.dp)
                        .semantics(mergeDescendants = true) { },
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.padding(start = 3.dp)) { InkGlyph(ProfileInk.Seen) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(offer.text, style = SourcesType.body)
                    Text("Seen · a piece from it shows as Seen", style = SourcesType.caption)
                }
                Text("Start", style = SourcesType.link)
            }
            SourcesDivider()
        }
        Row(
            modifier =
                Modifier
                    .padding(top = 12.dp)
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, PantopusColors.appBorderStrong, RoundedCornerShape(12.dp))
                    .background(PantopusColors.appSurface)
                    .clickable(role = Role.Button, onClick = onAdd)
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .testTag("profileSources.ownerWork.add"),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 18.dp, tint = PantopusColors.appText)
            Text("Add a piece", style = SourcesType.title)
        }
    }
}
