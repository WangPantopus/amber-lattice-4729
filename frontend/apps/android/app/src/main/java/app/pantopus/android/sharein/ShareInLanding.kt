package app.pantopus.android.sharein

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import app.pantopus.android.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Who is signed in, for the tabs' share-in landing. */
@HiltViewModel
class ShareInViewModel
    @Inject
    constructor(
        auth: AuthRepository,
    ) : ViewModel() {
        val accountId: StateFlow<String?> =
            auth.state
                .map { (it as? AuthRepository.State.SignedIn)?.user?.id }
                .stateIn(viewModelScope, SharingStarted.Eagerly, (auth.state.value as? AuthRepository.State.SignedIn)?.user?.id)
    }

/** The places a person can share to right now, as the tabs know them. */
data class ShareInPlaces(
    /** The Moments switch is on for the person. */
    val moments: Boolean,
    /** "Pulse, reinvented" is on: Moments are made from Pulse, and the Moments tab isn't drawn. */
    val pulseReinvented: Boolean,
    /** The Plans switch is on for the person. */
    val plans: Boolean,
    /** Christmas cards are open and take a photo of the person's own. */
    val cards: Boolean,
)

/**
 * On the tabs: tells ShareInActivity who is signed in and where they can share (and publishes the share sheet's
 * shortcuts for those places), and opens a share once the tabs are up: [open] navigates to its composer. Only the
 * account that shared it opens it. Parity twin of iOS `ShareInLanding`.
 */
@Composable
fun ShareInLanding(
    places: ShareInPlaces,
    /** The name the person goes by; empty until they have one. */
    name: String,
    /** The tabs' navigation: a share opens once it has its first screen. */
    nav: NavHostController,
    open: (ShareInRequest) -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val viewModel: ShareInViewModel = hiltViewModel()
    val account by viewModel.accountId.collectAsStateWithLifecycle()
    val pending by ShareInInbox.pending.collectAsStateWithLifecycle()
    val onOpen by rememberUpdatedState(open)
    LaunchedEffect(account, name, places) {
        account?.let { id ->
            // One camera while "Pulse, reinvented" is on: Pulse's card opens it, and there is no second one.
            val destinations =
                listOfNotNull(
                    ShareInDestination.Moments.takeIf { places.moments && !places.pulseReinvented },
                    ShareInDestination.Pulse,
                    ShareInDestination.Messages,
                    ShareInDestination.Mail.takeIf { places.cards },
                    ShareInDestination.Plans.takeIf { places.plans },
                )
            ShareInAccountStore.write(context, ShareInAccount(id, name, destinations))
        }
    }
    LaunchedEffect(pending, account) {
        val id = account ?: return@LaunchedEffect
        val shared = pending ?: return@LaunchedEffect
        // On a cold start the tabs' screens are laid out after this is first scheduled.
        nav.currentBackStackEntryFlow.first()
        ShareInInbox.take()
        if (shared.account == id) onOpen(shared)
    }
}
