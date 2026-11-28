@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.living

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.reinvented.ReinventedListItemDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.living.LivingConstellationsDto
import app.pantopus.android.data.living.LivingFollowedPlaceDto
import app.pantopus.android.data.living.LivingRepository
import app.pantopus.android.data.location.LocationProvider
import app.pantopus.android.ui.screens.compose.placepicker.PlacePickerLimits
import app.pantopus.android.ui.screens.compose.placepicker.PlacePickerSheet
import app.pantopus.android.ui.screens.feed.reinvented.MomentPicture
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * "Pulse, reinvented" phase 4, places you follow and curiosity constellations (PHASE-4 piece 4; CONTRACT 9c), as the
 * iPhone's (`ReinventedPlacesYouFollow.swift`, `ReinventedConstellations.swift`) and the web's.
 *
 * - Places you follow, at the top of Explore: up to five far places (a hometown, Kyoto) whose Explore items come into
 *   Explore. They are the person's own choice and private: nobody is ever told or shown what someone follows. A place is
 *   found with today's place picker and sent as its name and point; the server rounds the point to about a kilometre.
 *   Explore's first page then brings "From <place>, a place you follow" items, shown here as a row of cards.
 * - Constellations, "Near you" in My Atlas while nothing is searched: within five miles of the phone, the Retakes people
 *   keep adding to, the skies several caught, the field specimens named, and the questions people answered. The phone's
 *   place goes only in the POST body and is never kept; with no place, nothing is asked and nothing shows.
 */

data class LivingPlacesState(
    val places: List<LivingFollowedPlaceDto> = emptyList(),
    val error: String? = null,
    val saving: Boolean = false,
)

@HiltViewModel
class LivingPlacesViewModel
    @Inject
    constructor(
        private val repository: LivingRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(LivingPlacesState())
        val state: StateFlow<LivingPlacesState> = _state.asStateFlow()

        fun load() {
            viewModelScope.launch {
                val answer = repository.places() as? NetworkResult.Success ?: return@launch
                _state.update { it.copy(places = answer.data) }
            }
        }

        /** Follows a place; [then] runs when it went through (Explore reads again). */
        fun follow(
            label: String,
            latitude: Double,
            longitude: Double,
            then: () -> Unit,
        ) {
            if (_state.value.saving) return
            _state.update { it.copy(saving = true, error = null) }
            viewModelScope.launch {
                when (val answer = repository.follow(label, latitude, longitude)) {
                    is NetworkResult.Success -> {
                        val places = (repository.places() as? NetworkResult.Success)?.data ?: _state.value.places
                        _state.update { it.copy(places = places, saving = false) }
                        then()
                    }
                    is NetworkResult.Failure -> {
                        val words =
                            when (answer.error.code) {
                                HTTP_CONFLICT -> "You follow five places. Stop following one to add another."
                                HTTP_BAD_REQUEST -> "That place couldn't be followed. Pick it from the list."
                                else -> "That didn't save. Try again."
                            }
                        _state.update { it.copy(saving = false, error = words) }
                    }
                }
            }
        }

        fun unfollow(
            place: LivingFollowedPlaceDto,
            then: () -> Unit,
        ) {
            viewModelScope.launch {
                when (repository.unfollow(place.id)) {
                    is NetworkResult.Success -> {
                        _state.update { now -> now.copy(places = now.places.filterNot { it.id == place.id }, error = null) }
                        then()
                    }
                    is NetworkResult.Failure -> _state.update { it.copy(error = "That didn't save. Try again.") }
                }
            }
        }

        companion object {
            const val MOST = 5
            private const val HTTP_BAD_REQUEST = 400
            private const val HTTP_CONFLICT = 409
        }
    }

private const val FOLLOW_NOTE =
    "Follow a hometown or a far place, and what people there share with everyone comes into Explore. Nobody sees what you follow."

/**
 * At the top of Explore: the places followed, "Follow a place", and what came from them ([followed], Explore's first
 * page). Explore reads again after a follow or an unfollow ([onRefresh]), so its items come and go.
 */
@Composable
internal fun LivingFollowedPlaces(
    followed: List<ReinventedListItemDto>,
    onRefresh: () -> Unit,
    onOpenMoment: (MomentDto) -> Unit,
    viewModel: LivingPlacesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var finding by remember { mutableStateOf(false) }
    LaunchedEffect(viewModel) { viewModel.load() }
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4).padding(bottom = Spacing.s2).testTag("reinventedPlaces"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            "Places you follow",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            state.places.forEach { place -> PlaceChip(place) { viewModel.unfollow(place, onRefresh) } }
            if (state.places.size < LivingPlacesViewModel.MOST) FollowButton(enabled = !state.saving) { finding = true }
        }
        if (state.places.isEmpty()) Text(FOLLOW_NOTE, fontSize = 13.sp, color = PantopusColors.appTextSecondary)
        state.error?.let { Text(it, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.error) }
        if (followed.isNotEmpty()) {
            Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                followed.forEach { entry -> FollowedCard(entry, onOpenMoment) }
            }
        }
    }
    if (finding) {
        PlacePickerSheet(
            currentTag = null,
            onSelect = { tag ->
                finding = false
                viewModel.follow(tag.name, tag.latitude, tag.longitude, onRefresh)
            },
            onRemove = {},
            onDismiss = { finding = false },
            limits = PlacePickerLimits(anchorChips = false, showLocality = false),
        )
    }
}

@Composable
private fun PlaceChip(
    place: LivingFollowedPlaceDto,
    onUnfollow: () -> Unit,
) {
    val shape = RoundedCornerShape(percent = 50)
    Row(
        modifier =
            Modifier
                .height(32.dp)
                .background(PantopusColors.appSurface, shape)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(start = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 13.dp, tint = PantopusColors.primary600)
        Text(place.label, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText, maxLines = 1)
        Box(
            contentAlignment = Alignment.Center,
            modifier =
                Modifier
                    .size(28.dp)
                    .clickable(role = Role.Button, onClick = onUnfollow)
                    .semantics { contentDescription = "Stop following ${place.label}" }
                    .testTag("reinventedPlaces.unfollow.${place.id}"),
        ) {
            PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 12.dp, tint = PantopusColors.appTextSecondary)
        }
    }
}

@Composable
private fun FollowButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .height(32.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(PantopusColors.primary600)
                .clickable(role = Role.Button, enabled = enabled, onClick = onClick)
                .padding(horizontal = 12.dp)
                .testTag("reinventedPlaces.follow"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 13.dp, tint = Color.White)
        Text("Follow a place", fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

/** One Explore item from a followed place: a Moment's picture or a post's words, and "From Kyoto, a place you follow". */
@Composable
private fun FollowedCard(
    entry: ReinventedListItemDto,
    onOpenMoment: (MomentDto) -> Unit,
) {
    val shape = RoundedCornerShape(10.dp)
    val moment = entry.moment
    val post = entry.post
    Column(
        modifier =
            Modifier
                .width(128.dp)
                .clickable(role = Role.Button) {
                    when {
                        moment != null -> onOpenMoment(moment)
                        post != null -> DeepLinkRouter.handle("/posts/${post.id}")
                    }
                }.testTag("reinventedPlaces.item.${entry.id}"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (moment != null) {
            MomentPicture(moment, Modifier.width(128.dp).height(150.dp).clip(shape))
        } else {
            Text(
                post?.title?.takeIf { it.isNotBlank() } ?: post?.content.orEmpty(),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.appText,
                maxLines = 5,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(128.dp).height(150.dp).background(PantopusColors.appSurface, shape).padding(10.dp),
            )
        }
        entry.why?.let { Text(it, fontSize = 12.sp, color = PantopusColors.appTextSecondary, maxLines = 2) }
    }
}

// Constellations

@HiltViewModel
class LivingConstellationsViewModel
    @Inject
    constructor(
        private val repository: LivingRepository,
        private val location: LocationProvider,
    ) : ViewModel() {
        private val _found = MutableStateFlow<LivingConstellationsDto?>(null)
        val found: StateFlow<LivingConstellationsDto?> = _found.asStateFlow()
        private var read = false

        /** Once per screen: with no place on the phone, nothing is asked. */
        fun load() {
            if (read) return
            read = true
            viewModelScope.launch {
                val here = location.cachedCoordinate() ?: location.requestCurrent() ?: return@launch
                val answer = repository.constellations(here.latitude, here.longitude) as? NetworkResult.Success ?: return@launch
                _found.value = answer.data
            }
        }
    }

/** "Near you" in My Atlas: nothing while it loads, with no place, or with nothing near. */
@Composable
internal fun LivingConstellations(viewModel: LivingConstellationsViewModel = hiltViewModel()) {
    val found by viewModel.found.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    val near = found?.takeUnless { it.isEmpty } ?: return
    Column(modifier = Modifier.testTag("reinventedAtlas.constellations"), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            "Near you",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            near.retakes.forEach { retake ->
                Star(PantopusIcon.Camera, retake.title ?: "A Retake", count(retake.frames, "frame")) {
                    DeepLinkRouter.handle("/moments/${retake.id}")
                }
            }
            near.skies.forEach { sky ->
                val title = sky.title ?: sky.kind?.replaceFirstChar { it.uppercase() } ?: "A sky"
                Star(PantopusIcon.Sun, title, count(sky.pieces, "piece"), open = null)
            }
            near.specimens.forEach { specimen ->
                Star(PantopusIcon.Leaf, specimen.names.take(2).joinToString(", "), "Named nearby") {
                    DeepLinkRouter.handle(if (specimen.type == "post") "/posts/${specimen.id}" else "/moments/${specimen.id}")
                }
            }
            near.answers.forEach { answer ->
                Star(PantopusIcon.MessageCircle, answer.question ?: "A question", count(answer.answers, "answer")) {
                    DeepLinkRouter.handle("/posts/${answer.id}")
                }
            }
        }
    }
}

private fun count(
    value: Int?,
    word: String,
): String = value?.let { "$it $word" + if (it == 1) "" else "s" }.orEmpty()

@Composable
private fun Star(
    icon: PantopusIcon,
    title: String,
    line: String,
    open: (() -> Unit)?,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .width(150.dp)
                .height(96.dp)
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .clickable(role = Role.Button, enabled = open != null) { open?.invoke() }
                .padding(10.dp)
                .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 16.dp, tint = PantopusColors.primary600)
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (line.isNotEmpty()) Text(line, fontSize = 12.sp, color = PantopusColors.appTextSecondary)
    }
}
