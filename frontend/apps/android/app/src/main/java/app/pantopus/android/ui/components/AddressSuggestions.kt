package app.pantopus.android.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.geo.GeoResolveRequest
import app.pantopus.android.data.api.models.geo.GeoSuggestion
import app.pantopus.android.data.api.models.geo.NormalizedAddress
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.GeoApi
import app.pantopus.android.data.homes.HomesRepository
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Address suggestions under a street field. Typing asks `GET /api/geo/autocomplete` (debounced); picking one
 * resolves it with `POST /api/geo/resolve` so the form can fill its street, city, state and ZIP. The field itself
 * stays the screen's own, so every form keeps its look; [AddressSuggestionList] adds the list under it. A failed
 * lookup just shows no list: the field still takes a typed address.
 * Parity: iOS `AddressSuggestions` (Features/Shared/AddressSuggestions).
 *
 * Screens get one from [rememberAddressSuggestions], so no view-model has to change.
 */
class AddressSuggestions(
    private val geoApi: GeoApi,
    private val scope: CoroutineScope,
    private val streetOnly: Boolean = true,
) {
    private val _suggestions = MutableStateFlow<List<GeoSuggestion>>(emptyList())
    val suggestions: StateFlow<List<GeoSuggestion>> = _suggestions.asStateFlow()
    private val _resolving = MutableStateFlow(false)
    val resolving: StateFlow<Boolean> = _resolving.asStateFlow()

    /** Favor suggestions near this point (latitude to longitude), e.g. the person's own home. */
    var near: Pair<Double, Double>? = null

    private var searchJob: Job? = null

    /** The address a pick wrote into the field: an answer, not a new question. */
    private var pickedText: String? = null

    /** Call on every change of the street field's text. */
    fun onTextChanged(text: String) {
        searchJob?.cancel()
        val query = text.trim()
        if (query.length < MIN_QUERY || text == pickedText) {
            _suggestions.value = emptyList()
            return
        }
        pickedText = null
        searchJob =
            scope.launch {
                delay(DEBOUNCE_MS)
                val point = near
                val result =
                    safeApiCall {
                        geoApi.autocomplete(
                            query,
                            lat = point?.first?.roughly(),
                            lng = point?.second?.roughly(),
                            kind = if (streetOnly) "address" else null,
                        )
                    }
                if (!isActive) return@launch
                _suggestions.value = (result as? NetworkResult.Success)?.data?.suggestions.orEmpty()
            }
    }

    /** Resolves a picked suggestion into its parts; null when it can't be resolved, and the typed text stays. */
    suspend fun choose(suggestion: GeoSuggestion): NormalizedAddress? {
        if (_resolving.value || _suggestions.value.none { it.suggestionId == suggestion.suggestionId }) return null
        searchJob?.cancel()
        _resolving.value = true
        try {
            val result = safeApiCall { geoApi.resolve(GeoResolveRequest(suggestion.suggestionId)) }
            val normalized = (result as? NetworkResult.Success)?.data?.normalized ?: return null
            _suggestions.value = emptyList()
            pickedText = normalized.address
            return normalized
        } finally {
            _resolving.value = false
        }
    }

    /** Resolves [suggestion] on the screen's scope and hands the address to [onPicked]. */
    fun pick(
        suggestion: GeoSuggestion,
        onPicked: (NormalizedAddress) -> Unit,
    ) {
        scope.launch { choose(suggestion)?.let(onPicked) }
    }

    fun dismiss() {
        searchJob?.cancel()
        _suggestions.value = emptyList()
    }

    private companion object {
        const val MIN_QUERY = 4
        const val DEBOUNCE_MS = 250L
    }
}

/** About a kilometer: a bias needs no more, and the exact point stays on the phone. */
private fun Double.roughly(): Double = (this * 100).roundToLong() / 100.0

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface AddressSuggestionsEntryPoint {
    fun geoApi(): GeoApi

    fun homesRepository(): HomesRepository
}

/**
 * Suggestions for one street field, living as long as the screen. With [nearHomeId], suggestions near that home come
 * first (the stored My Homes has its point); without it, near the person's default Home, or their first Home with a
 * point (FASTVERIFY section 11: every address field passes a search area). Null in previews and snapshot tests, which
 * have no app graph: the field then works as a plain text field.
 */
@Composable
fun rememberAddressSuggestions(
    nearHomeId: String? = null,
    streetOnly: Boolean = true,
): AddressSuggestions? {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val graph =
        remember(context) {
            runCatching {
                EntryPointAccessors.fromApplication(context.applicationContext, AddressSuggestionsEntryPoint::class.java)
            }.getOrNull()
        }
    val suggestions = remember(graph, scope, streetOnly) { graph?.let { AddressSuggestions(it.geoApi(), scope, streetOnly) } }
    LaunchedEffect(suggestions, nearHomeId) {
        if (suggestions != null) suggestions.near = graph?.homePoint(nearHomeId)
    }
    return suggestions
}

/** The point of [nearHomeId] or, without one, of the person's default Home (or their first Home with a point). */
private suspend fun AddressSuggestionsEntryPoint.homePoint(nearHomeId: String?): Pair<Double, Double>? {
    val homes = runCatching { homesRepository().myHomesStored().data?.homes }.getOrNull().orEmpty()
    val home =
        if (nearHomeId != null) {
            homes.firstOrNull { it.id == nearHomeId }
        } else {
            homes.firstOrNull { it.isDefault == true && it.location != null } ?: homes.firstOrNull { it.location != null }
        }
    return home?.location?.let { it.latitude to it.longitude }
}

/**
 * The search area for a screen that runs its own address search (the task composers, a home task's "Find location"):
 * the person's default Home, or their first Home with a point, to about a kilometer, as latitude to longitude
 * (FASTVERIFY section 11). Null with no Home, before the stored Homes are read, and in previews and snapshot tests.
 */
@Composable
fun rememberAddressSearchArea(): Pair<Double, Double>? {
    val context = LocalContext.current
    val area by produceState<Pair<Double, Double>?>(initialValue = null, context) {
        val graph =
            runCatching {
                EntryPointAccessors.fromApplication(context.applicationContext, AddressSuggestionsEntryPoint::class.java)
            }.getOrNull()
        value = graph?.homePoint(null)?.let { it.first.roughly() to it.second.roughly() }
    }
    return area
}

/**
 * The suggestions under a street field; a tapped one is resolved and handed to [onPicked]. Results under a text box
 * take a first tap to put the keyboard away (KeyboardRules).
 *
 * [keepAboveKeyboard] is for a field low on a scrolling page: see [ListKeptAboveKeyboard].
 */
@Composable
fun AddressSuggestionList(
    suggestions: AddressSuggestions?,
    testTagPrefix: String,
    modifier: Modifier = Modifier,
    keepAboveKeyboard: Boolean = false,
    onPicked: (NormalizedAddress) -> Unit,
) {
    if (suggestions == null) return
    val items by suggestions.suggestions.collectAsStateWithLifecycle()
    val resolving by suggestions.resolving.collectAsStateWithLifecycle()
    if (items.isEmpty()) return
    if (keepAboveKeyboard) {
        ListKeptAboveKeyboard(items) { SuggestionRows(suggestions, items, resolving, testTagPrefix, modifier, onPicked) }
    } else {
        SuggestionRows(suggestions, items, resolving, testTagPrefix, modifier, onPicked)
    }
}

/**
 * Keeps a list under a low field above the keyboard, also for a screen that draws its own rows (the task composers).
 * The app's pages don't shrink for the keyboard (they only move the typed line into view), so a list under such a
 * field would sit behind it. While [rows] isn't empty with the keyboard up, the list gets the keyboard's height of
 * room below it and the page scrolls it into view, with the field still on screen above it. With no rows [content]
 * is drawn as it is. [spacing] is the gap the screen's own column leaves between rows.
 */
@Composable
@OptIn(ExperimentalFoundationApi::class)
fun ListKeptAboveKeyboard(
    rows: List<*>,
    spacing: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    if (rows.isEmpty()) {
        content()
        return
    }
    val listAndRoom = remember { BringIntoViewRequester() }
    val lastRow = remember { BringIntoViewRequester() }
    val density = LocalDensity.current
    val keyboard = WindowInsets.ime.getBottom(density)
    // The room under the list, in pixels: the keyboard's height until the page is measured (ROOM_UNMEASURED), then only
    // what the keyboard covers of the page. A page that ends above the screen's bottom (over a button bar) needs less,
    // and with less the field stays on screen above the list.
    var room by remember(keyboard) { mutableIntStateOf(ROOM_UNMEASURED) }
    var placed by remember { mutableStateOf<LayoutCoordinates?>(null) }
    LaunchedEffect(rows, keyboard) {
        if (keyboard <= 0) return@LaunchedEffect
        // One pass on a still page. A bar that slides away while the page scrolls (the tab bar) leaves the list lower
        // than it was measured for: the page is then measured once more, when the bar has stopped.
        for (pass in 1..PASSES) {
            if (room == ROOM_UNMEASURED || pass > 1) {
                // The list is laid out before the page is measured: two frames on a still page, longer while the
                // page's end still moves.
                awaitStillPage { placed }
                val needed = placed?.let { roomThePageNeeds(it, keyboard) } ?: ROOM_UNMEASURED
                if (needed != room) {
                    room = needed
                    repeat(2) { withFrameNanos {} }
                }
            }
            listAndRoom.bringIntoView()
            // The window had moved up to show the typed line while it sat low. List plus room can be taller than what
            // the keyboard leaves, and the system keeps its old shift for a request that can't fit, which leaves
            // the field and the first rows off the top of the screen. The last row alone, now above the
            // keyboard, fits: asking for it lets the window settle back.
            lastRow.bringIntoView()
            val settled = placed?.takeIf { it.isAttached }?.let { listEndsAboveKeyboard(it, room, keyboard) } ?: true
            if (settled || pass == PASSES) break
        }
    }
    Column(modifier = Modifier.fillMaxWidth().bringIntoViewRequester(listAndRoom).onGloballyPositioned { placed = it }) {
        Box {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(spacing)) { content() }
            Spacer(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(48.dp).bringIntoViewRequester(lastRow))
        }
        Spacer(Modifier.height(with(density) { (if (room == ROOM_UNMEASURED) keyboard else room).toDp() }))
    }
}

private const val ROOM_UNMEASURED = -1
private const val PASSES = 2
private const val EDGE_SLACK = 2f
private const val STILL_FRAMES = 30

/**
 * Waits until the page ends at the same place on two frames in a row (around the list as [placed]), for
 * [STILL_FRAMES] frames at most: two frames on a still page, and the length of its slide while a bar moves away.
 */
private suspend fun awaitStillPage(placed: () -> LayoutCoordinates?) {
    var before: Float? = null
    repeat(STILL_FRAMES) { frame ->
        withFrameNanos {}
        val now = placed()?.let(::shownPageBottom)
        if (frame > 0 && now == before) return
        before = now
    }
}

/**
 * How much of the page the keyboard covers ([listAndRoom] as placed, [keyboard] pixels high). Null when the page
 * cuts nothing off around the list: the keyboard's height then stays.
 */
private fun roomThePageNeeds(
    listAndRoom: LayoutCoordinates,
    keyboard: Int,
): Int? {
    val pageBottom = shownPageBottom(listAndRoom) ?: return null
    val keyboardTop = listAndRoom.findRootCoordinates().size.height - keyboard
    return (pageBottom - keyboardTop).roundToInt().coerceIn(0, keyboard)
}

/**
 * Where the page stops showing its content, in the window: the bottom at which [node], or the nearest layout around
 * it that reaches further down than the page shows, is cut off. A list that starts below what the page shows is found
 * through the layouts around it. Null when nothing around [node] is cut off at the bottom.
 */
private fun shownPageBottom(node: LayoutCoordinates): Float? {
    var at: LayoutCoordinates? = node
    while (at != null && at.isAttached) {
        val shown = at.boundsInRoot()
        if (shown.height > 0f && shown.bottom < at.positionInRoot().y + at.size.height - 1f) return shown.bottom
        at = at.parentLayoutCoordinates
    }
    return null
}

/** Whether the list ends at the keyboard's top or higher ([listAndRoom] as placed, over [room] pixels of room). */
private fun listEndsAboveKeyboard(
    listAndRoom: LayoutCoordinates,
    room: Int,
    keyboard: Int,
): Boolean {
    val listBottom = listAndRoom.positionInRoot().y + listAndRoom.size.height - (if (room == ROOM_UNMEASURED) keyboard else room)
    return listBottom <= listAndRoom.findRootCoordinates().size.height - keyboard + EDGE_SLACK
}

@Composable
@Suppress("LongParameterList")
private fun SuggestionRows(
    suggestions: AddressSuggestions,
    items: List<GeoSuggestion>,
    resolving: Boolean,
    testTagPrefix: String,
    modifier: Modifier,
    onPicked: (NormalizedAddress) -> Unit,
) {
    val shape = RoundedCornerShape(Radii.md)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .firstTapClosesKeyboard(),
    ) {
        items.forEachIndexed { index, suggestion ->
            if (index > 0) HorizontalDivider(color = PantopusColors.appBorderSubtle)
            val description = listOfNotNull(suggestion.primaryText, suggestion.secondaryText).joinToString(", ")
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(enabled = !resolving) { suggestions.pick(suggestion, onPicked) }
                        .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                        .semantics(mergeDescendants = true) { contentDescription = description }
                        .testTag("$testTagPrefix.$index"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                Box(
                    modifier = Modifier.size(32.dp).clip(RoundedCornerShape(Radii.md)).background(PantopusColors.appSurfaceSunken),
                    contentAlignment = Alignment.Center,
                ) {
                    PantopusIconImage(
                        icon = PantopusIcon.MapPin,
                        contentDescription = null,
                        size = 15.dp,
                        tint = PantopusColors.appTextSecondary,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        suggestion.primaryText,
                        style = PantopusTextStyle.body,
                        color = PantopusColors.appTextStrong,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    suggestion.secondaryText?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            it,
                            style = PantopusTextStyle.caption,
                            color = PantopusColors.appTextSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

/** A picked suggestion as one address line, for a field that holds a whole address: "616 Northeast 4th Avenue, Camas, WA 98607". */
fun NormalizedAddress.oneLine(): String {
    val region = listOfNotNull(state?.trim(), zipcode?.trim()).filter { it.isNotEmpty() }.joinToString(" ")
    return listOfNotNull(address?.trim(), city?.trim(), region).filter { it.isNotEmpty() }.joinToString(", ")
}
