package app.pantopus.android.ui.screens.moments.components

import androidx.lifecycle.ViewModel
import app.pantopus.android.data.pulse.StudioRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/** Taking a dot off one's own Moment (CONTRACT 7c), for the viewer's dots ([MomentDotsLayer]). */
@HiltViewModel
class MomentDotsViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
    ) : ViewModel() {
        suspend fun remove(
            momentId: String,
            dotId: String,
        ): Boolean = studio.removeDot(momentId, dotId)
    }
