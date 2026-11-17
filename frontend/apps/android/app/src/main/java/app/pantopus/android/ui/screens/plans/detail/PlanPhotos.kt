package app.pantopus.android.ui.screens.plans.detail

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanPhotoDto
import app.pantopus.android.data.api.models.plans.PlanPhotosResponse
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.PlanPhotoUploads
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage
import coil.imageLoader
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.request.ImageRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

/*
 * The holidays' photos afterwards on the page of a plan that is over (08-extras section 5, board 29), for the host and
 * the people who were in (the server sends `photos` to nobody else). "Photos" with the server's "{23} from {5} people",
 * a grid four across, "Add yours" (the system photo picker, several at once, each its own upload) and the server's note;
 * a picture opens full screen with "Remove" for whoever added it and the host. The pictures come only by links signed
 * for minutes: read again before they run out, loaded into memory only, never into the image cache on disk.
 */

/** The grid as last read, and what is going on. */
data class PlanPhotosUi(
    val grid: PlanPhotosResponse? = null,
    /** Pictures still to send from the last pick. */
    val adding: Int = 0,
    val removing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class PlanPhotosViewModel
    @Inject
    constructor(
        private val repository: PlanExtrasRepository,
        private val uploads: PlanPhotoUploads,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(PlanPhotosUi())
        val ui: StateFlow<PlanPhotosUi> = _ui.asStateFlow()
        private var refresh: Job? = null

        /** Reads the grid, and again a minute before its links run out. */
        fun load(planId: String) {
            refresh?.cancel()
            refresh =
                viewModelScope.launch {
                    while (true) {
                        val expires =
                            when (val result = repository.photos(planId)) {
                                is NetworkResult.Success -> {
                                    _ui.update { it.copy(grid = result.data) }
                                    result.data.expiresIn
                                }
                                is NetworkResult.Failure -> {
                                    _ui.update { it.copy(error = it.error ?: result.error.planMessage) }
                                    return@launch
                                }
                            }
                        delay((expires - EARLY_SECONDS).coerceAtLeast(MIN_REFRESH_SECONDS) * MILLIS)
                    }
                }
        }

        /** "Add yours": each picture its own upload, in turn; the first refusal stops the rest with its sentence. */
        fun add(
            planId: String,
            uris: List<Uri>,
        ) {
            if (uris.isEmpty() || _ui.value.adding > 0) return
            _ui.update { it.copy(adding = uris.size, error = null) }
            viewModelScope.launch {
                for (uri in uris) {
                    val jpeg = uploads.prepare(uri)
                    val failed =
                        if (jpeg == null) {
                            PlanPhotoUploads.UNREADABLE
                        } else {
                            when (val result = uploads.add(planId, jpeg)) {
                                is NetworkResult.Success -> {
                                    _ui.update { it.copy(grid = result.data) }
                                    null
                                }
                                is NetworkResult.Failure -> photoRefusal(result.error)
                            }
                        }
                    if (failed != null) {
                        _ui.update { it.copy(adding = 0, error = failed) }
                        return@launch
                    }
                    _ui.update { it.copy(adding = it.adding - 1) }
                }
            }
        }

        fun remove(
            planId: String,
            photoId: String,
            then: () -> Unit,
        ) {
            if (_ui.value.removing) return
            _ui.update { it.copy(removing = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.removePhoto(planId, photoId)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(grid = result.data, removing = false) }
                        then()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(removing = false, error = result.error.planMessage) }
                }
            }
        }

        private companion object {
            const val EARLY_SECONDS = 60
            const val MIN_REFRESH_SECONDS = 30
            const val MILLIS = 1000L
        }
    }

/**
 * The server's sentence for a refused picture. The picture check that couldn't run answers `503 check_unavailable` with
 * "This picture couldn't be checked right now. Try again in a little while.", which the app's generic 5xx words would
 * hide; any other server error keeps them.
 */
private fun photoRefusal(error: NetworkError): String {
    val body = (error as? NetworkError.Server)?.body ?: return error.planMessage
    val json = runCatching { JSONObject(body) }.getOrNull() ?: return error.planMessage
    return json.optString("message").takeIf { json.optString("error") == "check_unavailable" && it.isNotBlank() } ?: error.planMessage
}

/** The card, while the plan carries photos (a plan that is over, for those who were in). */
@Composable
internal fun PlanPhotosIfAny(plan: PlanDto) {
    if (plan.photos != null) PlanPhotosCard(plan)
}

@Composable
private fun PlanPhotosCard(
    plan: PlanDto,
    vm: PlanPhotosViewModel = hiltViewModel(key = "planPhotos-${plan.id}"),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(plan.id) { vm.load(plan.id) }
    val card = plan.photos ?: return
    val grid = ui.grid
    val photos = grid?.photos.orEmpty()
    var viewing by remember { mutableStateOf<String?>(null) }
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(PICK_LIMIT)) { uris ->
            vm.add(plan.id, uris)
        }
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planPhotos"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            PlanIconTile(PantopusIcon.Image, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong, size = 40.dp, glyph = 20.dp, corner = 12.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = "Photos", style = SEMIBOLD, color = PantopusColors.appText)
                (grid?.text ?: card.text)?.takeIf(String::isNotBlank)?.let {
                    Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
                }
            }
        }
        if (photos.isNotEmpty()) PhotoGrid(photos, onOpen = { viewing = it.id })
        if (grid?.canAdd ?: card.canAdd) {
            val adding = ui.adding > 0
            GhostButton(
                title = if (adding) "Adding ${ui.adding}…" else "Add yours",
                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                isLoading = adding,
                isEnabled = !adding,
                modifier = Modifier.fillMaxWidth().testTag("planPhotosAdd"),
            )
        }
        ui.error?.let {
            Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error, modifier = Modifier.testTag("planPhotosError"))
        }
        (grid?.note ?: card.note)?.takeIf(String::isNotBlank)?.let {
            Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
        }
    }
    val open = photos.firstOrNull { it.id == viewing }
    if (open != null) {
        PhotoViewer(
            photo = open,
            removing = ui.removing,
            onRemove = { vm.remove(plan.id, open.id) { viewing = null } },
            onClose = { viewing = null },
        )
    }
    // Leaving the plan's page: its pictures leave memory too.
    val context = LocalContext.current
    DisposableEffect(plan.id) {
        onDispose {
            val cache = context.imageLoader.memoryCache
            vm.ui.value.grid?.photos?.forEach { photo ->
                cache?.remove(MemoryCache.Key(thumbKey(photo.id)))
                cache?.remove(MemoryCache.Key(fullKey(photo.id)))
            }
        }
    }
}

/** Board 29's footer: "Plan the next one with the same people" (Host again, then the past plan's people to invite). */
@Composable
internal fun PlanNextWithSamePeople(onPlanNext: (() -> Unit)?) {
    onPlanNext ?: return
    GhostButton(
        title = "Plan the next one with the same people",
        onClick = onPlanNext,
        modifier = Modifier.fillMaxWidth().testTag("planNextSamePeople"),
    )
}

/** Four across, square thumbnails. */
@Composable
private fun PhotoGrid(
    photos: List<PlanPhotoDto>,
    onOpen: (PlanPhotoDto) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(GAP), modifier = Modifier.testTag("planPhotosGrid")) {
        photos.chunked(COLUMNS).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(GAP)) {
                row.forEach { photo ->
                    Box(
                        modifier =
                            Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(Radii.md))
                                .background(PantopusColors.appSurfaceSunken)
                                .clickable(role = Role.Button, onClick = { onOpen(photo) })
                                .semantics { contentDescription = spokenName(photo) },
                    ) {
                        PrivatePicture(url = photo.thumbUrl ?: photo.url, key = thumbKey(photo.id), crop = true)
                    }
                }
                repeat(COLUMNS - row.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
    }
}

/** A picture full screen, with "Remove" (asks first) for whoever added it and the host. */
@Composable
private fun PhotoViewer(
    photo: PlanPhotoDto,
    removing: Boolean,
    onRemove: () -> Unit,
    onClose: () -> Unit,
) {
    var asks by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(modifier = Modifier.fillMaxSize().background(Color.Black).testTag("planPhotoViewer")) {
            PrivatePicture(url = photo.url ?: photo.thumbUrl, key = fullKey(photo.id), crop = false, spoken = spokenName(photo))
            Row(
                modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(Spacing.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier =
                        Modifier
                            .clip(RoundedCornerShape(Radii.pill))
                            .clickable(role = Role.Button, onClick = onClose)
                            .padding(Spacing.s3)
                            .semantics { contentDescription = "Close" },
                ) {
                    PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 24.dp, tint = Color.White)
                }
                Spacer(modifier = Modifier.weight(1f))
                if (photo.canRemove) {
                    TextButton(onClick = { asks = true }, enabled = !removing, modifier = Modifier.testTag("planPhotoRemove")) {
                        Text(text = "Remove", color = Color.White, modifier = Modifier.semantics { contentDescription = "Remove this photo" })
                    }
                }
            }
        }
        if (asks) {
            AlertDialog(
                onDismissRequest = { asks = false },
                title = { Text("Remove this photo?") },
                text = { Text("It leaves the plan for everyone.") },
                confirmButton = {
                    TextButton(onClick = {
                        asks = false
                        onRemove()
                    }) { Text("Remove", color = PantopusColors.error) }
                },
                dismissButton = { TextButton(onClick = { asks = false }) { Text("Keep it") } },
            )
        }
    }
}

/** A picture by its signed link: in memory only, never in the image cache on disk. */
@Composable
private fun PrivatePicture(
    url: String?,
    key: String,
    crop: Boolean,
    spoken: String? = null,
) {
    url ?: return
    val context = LocalContext.current
    val request =
        remember(url, key) {
            ImageRequest
                .Builder(context)
                .data(url)
                .memoryCacheKey(key)
                .diskCachePolicy(CachePolicy.DISABLED)
                .build()
        }
    AsyncImage(
        model = request,
        contentDescription = spoken,
        contentScale = if (crop) ContentScale.Crop else ContentScale.Fit,
        modifier = Modifier.fillMaxSize(),
    )
}

private fun spokenName(photo: PlanPhotoDto): String = photo.byName?.takeIf(String::isNotBlank)?.let { "Photo from $it" } ?: "Photo"

private fun thumbKey(id: String) = "plan-photo-thumb:$id"

private fun fullKey(id: String) = "plan-photo:$id"

private val SEMIBOLD = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
private val GAP = 4.dp
private const val COLUMNS = 4

/** As many as the picker takes at once (iPhone's 10). */
private const val PICK_LIMIT = 10
