package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanSpotDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * The holidays' one person pays for the group, the claimer's side (08-extras section 7): a page opened from a spot link
 * (`/plan-link/:id?spot=`). While the offer is live the page's action is the free "I'm in" (the server's `button`), never
 * the paid "Join" or its pay sheet. Only a clear answer leads to the ordinary page: the server's 404 (the plan isn't
 * there for this link) or an offer that is closed (its own words). Any other failure, reading the offer or claiming it,
 * keeps the link and says "Couldn't check your spot. Try again." with "Try again", which reads the offer again.
 */

/** Where the spot link stands for the reader. */
sealed interface SpotOffer {
    /** No link, or the server's 404 for it: the ordinary page. */
    data object None : SpotOffer

    /** The offer is being read (from the page's first moment, so the paid "Join" never shows first). */
    data object Checking : SpotOffer

    /** "{Chris} got you a spot": the footer is "I'm in". */
    data class Live(
        val offer: PlanSpotDto,
    ) : SpotOffer

    /** The link takes nobody now: its words, and the ordinary page. */
    data class Closed(
        val offer: PlanSpotDto,
    ) : SpotOffer

    /** Reading or claiming failed without the server's refusal: the link is kept; "Try again". */
    data object Failed : SpotOffer
}

/** While this holds, the page's footer is the spot's (never the paid "Join"). */
val SpotOffer.holdsFooter: Boolean get() = this is SpotOffer.Checking || this is SpotOffer.Live || this is SpotOffer.Failed

data class PlanSpotUi(
    val spot: SpotOffer = SpotOffer.None,
    val claiming: Boolean = false,
    /** The server's refusal of a claim ("All the spots on this link are taken."), shown on the card. */
    val refusal: String? = null,
)

@HiltViewModel
class PlanSpotViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlanExtrasRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()

        /** `?spot=` from the link someone sent; kept until the server answers clearly. */
        private val token: String? = savedStateHandle.get<String>(PlansRoutes.SPOT_KEY)?.takeIf(String::isNotBlank)
        private val _ui = MutableStateFlow(PlanSpotUi(spot = if (token != null) SpotOffer.Checking else SpotOffer.None))
        val ui: StateFlow<PlanSpotUi> = _ui.asStateFlow()
        private var reading: Job? = null
        private var read = false

        /** Reads the offer, once ([again]: "Try again" or after a refusal). */
        fun readOffer(again: Boolean = false) {
            val spot = token ?: return
            if ((read && !again) || reading?.isActive == true) return
            read = true
            _ui.update { it.copy(spot = SpotOffer.Checking) }
            reading =
                viewModelScope.launch {
                    val next =
                        when (val result = repository.spot(planId, spot)) {
                            is NetworkResult.Success -> offerOf(result.data.spot)
                            is NetworkResult.Failure -> if (result.error == NetworkError.NotFound) SpotOffer.None else SpotOffer.Failed
                        }
                    _ui.update { it.copy(spot = next) }
                }
        }

        /** "Try again": the offer is read again. */
        fun retry() {
            _ui.update { it.copy(refusal = null) }
            readOffer(again = true)
        }

        /** "I'm in": in, free to the reader; [then] reads the plan again. */
        fun claim(then: () -> Unit) {
            val spot = token ?: return
            if (_ui.value.claiming || _ui.value.spot !is SpotOffer.Live) return
            _ui.update { it.copy(claiming = true, refusal = null) }
            viewModelScope.launch {
                when (val result = repository.claimSpot(planId, spot)) {
                    is NetworkResult.Success -> {
                        _ui.update { PlanSpotUi() }
                        then()
                    }
                    is NetworkResult.Failure -> claimFailed(result.error)
                }
            }
        }

        /**
         * The server's refusal (taken, stopped, already in, not shown to this person) is a clear answer: its sentence, and
         * the offer read again so the page shows what it now is. Anything else keeps the link with "Try again".
         */
        private fun claimFailed(error: NetworkError) {
            val refused = error is NetworkError.ClientError || error is NetworkError.Forbidden || error == NetworkError.NotFound
            if (!refused) {
                _ui.update { it.copy(claiming = false, spot = SpotOffer.Failed) }
                return
            }
            _ui.update { it.copy(claiming = false, refusal = error.planMessage) }
            readOffer(again = true)
        }
    }

/** A live offer, a closed one, or none (the server answered without one). */
private fun offerOf(spot: PlanSpotDto?): SpotOffer =
    when {
        spot == null -> SpotOffer.None
        spot.open -> SpotOffer.Live(spot)
        else -> SpotOffer.Closed(spot)
    }

/** The spot's card under the title: who got the reader a spot, the closed words, or that it couldn't be checked. */
@Composable
internal fun PlanSpotCard(ui: PlanSpotUi) {
    val line =
        when (val spot = ui.spot) {
            SpotOffer.None -> null
            SpotOffer.Checking -> "Checking your spot…"
            is SpotOffer.Live -> spot.offer.text
            // A link that stopped names nobody: its own sentence is the card's line ("This link isn't taking anyone now.").
            is SpotOffer.Closed -> spot.offer.text ?: spot.offer.closedText
            SpotOffer.Failed -> COULD_NOT_CHECK
        } ?: return
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planSpotOffer"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            PlanIconTile(
                PantopusIcon.Gift,
                PantopusColors.appSurfaceSunken,
                PantopusColors.appTextStrong,
                size = 40.dp,
                glyph = 20.dp,
                corner = 12.dp,
            )
            Text(text = line, style = SEMIBOLD, color = PantopusColors.appText, modifier = Modifier.weight(1f))
        }
        val closed = ui.spot as? SpotOffer.Closed
        if (closed?.offer?.text != null) {
            closed.offer.closedText?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary) }
        }
        ui.refusal?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
    }
}

/** The page's footer while the spot holds it: the free "I'm in", "I'm in" waiting on the read, or "Try again". */
internal fun spotFooter(
    ui: PlanSpotUi,
    onClaim: () -> Unit,
    onRetry: () -> Unit,
): @Composable ColumnScope.() -> Unit =
    {
        when (val spot = ui.spot) {
            is SpotOffer.Live ->
                PrimaryButton(
                    title = spot.offer.button ?: "I'm in",
                    onClick = onClaim,
                    isLoading = ui.claiming,
                    isEnabled = !ui.claiming,
                    modifier = Modifier.height(50.dp).testTag("planSpotClaim"),
                )
            SpotOffer.Failed ->
                PrimaryButton(title = "Try again", onClick = onRetry, modifier = Modifier.height(50.dp).testTag("planSpotRetry"))
            else ->
                PrimaryButton(
                    title = "I'm in",
                    onClick = {},
                    isLoading = true,
                    isEnabled = false,
                    modifier = Modifier.height(50.dp).testTag("planSpotChecking"),
                )
        }
    }

private const val COULD_NOT_CHECK = "Couldn't check your spot. Try again."
private val SEMIBOLD = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
