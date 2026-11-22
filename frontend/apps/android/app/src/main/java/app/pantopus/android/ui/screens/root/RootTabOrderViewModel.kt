package app.pantopus.android.ui.screens.root

import androidx.lifecycle.ViewModel
import app.pantopus.android.data.homes.RootTabOrder
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/** Hands [RootTabScreen] the bar's order for the signed-in account ([RootTabOrder]), read once when the tabs are made. */
@HiltViewModel
class RootTabOrderViewModel
    @Inject
    constructor(
        private val order: RootTabOrder,
    ) : ViewModel() {
        /** Today is the first tab and the one the app opens on: the account had a Home the last time its list was read. */
        fun todayFirst(): Boolean = order.todayFirst()
    }
