package app.pantopus.android.ui.screens.moments.studio

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentPlayItemDto
import app.pantopus.android.data.moments.MomentMediaFile
import app.pantopus.android.ui.screens.moments.components.MomentBeforeAfterView
import app.pantopus.android.ui.screens.moments.components.beforeAfterWord
import app.pantopus.android.ui.screens.moments.compose.MomentsComposeUiState
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 5: before and after (CONTRACT 7g; LEAD 05:19 answer 1; as on iPhone). Two
 * photos picked together in the library: the one in the Studio is the before, the next photo the after. The after is cut
 * to the before's size and shape and both are drawn side by side into ONE picture (left before, right after,
 * [app.pantopus.android.data.moments.MomentBeforeAfterPicture]), which is what posts, with a `before_after` play item: no
 * second upload. Words and drawings already on the before are drawn into it; after that the picture takes stamps only,
 * placed on one half's frame. "Take apart" puts the before back (its words and drawings drawn in) and the after next in
 * line.
 */

/** A before and after in the Studio: the picture it made, and what "Take apart" puts back. */
@Immutable
data class StudioPair(
    /** The side-by-side picture: while the Studio's photo is this file, the pair holds. */
    val made: File,
    /** The before as it was drawn (its words and drawings in it). */
    val before: File,
    /** The after's library item, first in line again on "Take apart". */
    val after: Uri,
    /** The two words over the halves; empty is "Before" and "After". */
    val beforeWords: String = "",
    val afterWords: String = "",
)

/** What the Studio's tray does for before and after: make one, its two words, take it apart. */
@Immutable
data class StudioBeforeAfterActions(
    val make: () -> Unit = {},
    val words: (String, String) -> Unit = { _, _ -> },
    val takeApart: () -> Unit = {},
)

/** The before and after on the photo now in the Studio, while the photo is the one it made. */
internal val MomentsComposeUiState.studioPair: StudioPair?
    get() = pair?.takeIf { (media as? MomentMediaFile.Photo)?.file == it.made }

/**
 * Before and after may be made: a photo, on no canvas and with no cutouts, not a pair already, with a photo picked
 * together after it still waiting ([photosWaiting]).
 */
internal fun MomentsComposeUiState.offersBeforeAfter(photosWaiting: Int): Boolean =
    media is MomentMediaFile.Photo && studioPair == null && placement == null && marks.cutouts.isEmpty() && photosWaiting > 0

/** The Studio's playable items as they go out (CONTRACT 7b, 7g); null (left out) when there are none. */
internal val MomentsComposeUiState.sentPlay: List<MomentPlayItemDto>?
    get() = studioPair?.let { listOf(MomentPlayItemDto.beforeAfter(it.beforeWords, it.afterWords)) }

/** The Studio's picture while a pair holds: the halves one over the other, with the curtain. */
@Composable
internal fun StudioBeforeAfterPicture(pair: StudioPair) {
    val picture by produceState<ImageBitmap?>(null, pair.made) {
        value =
            withContext(Dispatchers.IO) {
                runCatching { BitmapFactory.decodeFile(pair.made.path)?.takeIf { it.width >= 2 }?.asImageBitmap() }.getOrNull()
            }
    }
    picture?.let {
        MomentBeforeAfterView(
            picture = it,
            before = beforeAfterWord(pair.beforeWords, "Before"),
            after = beforeAfterWord(pair.afterWords, "After"),
            modifier = Modifier.testTag("moments.studio.beforeAfterPicture"),
        )
    }
}

/**
 * The tray's "Before and after": offered while a photo picked with this one waits ([offered]); once made ([pair]), its
 * two words and "Take apart".
 */
@Composable
internal fun StudioBeforeAfterRow(
    pair: StudioPair?,
    offered: Boolean,
    onMake: () -> Unit,
    onWords: (String, String) -> Unit,
    onTakeApart: () -> Unit,
) {
    if (pair == null && !offered) return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            text = "Before and after",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        if (pair == null) {
            StudioChip("This photo before, the next one after", tag = "moments.studio.beforeAfter", onClick = onMake)
            Text(
                text = "Both go out side by side as one picture, the same size and shape. Others drag a curtain between them.",
                color = PantopusColors.studioPillSecondary,
                fontSize = 13.sp,
            )
        } else {
            val focus = LocalFocusManager.current
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                PairWords(pair.beforeWords, "Before", "moments.studio.beforeAfter.before", focus) { onWords(it, pair.afterWords) }
                PairWords(pair.afterWords, "After", "moments.studio.beforeAfter.after", focus) { onWords(pair.beforeWords, it) }
            }
            StudioChip("Take apart", tag = "moments.studio.beforeAfter.apart", onClick = onTakeApart)
        }
    }
}

/** One half's word, typed in a pill ("Before" or "After" until something is typed). */
@Composable
private fun PairWords(
    words: String,
    placeholder: String,
    tag: String,
    focus: FocusManager,
    onChange: (String) -> Unit,
) {
    val shape = RoundedCornerShape(19.dp)
    BasicTextField(
        value = words,
        onValueChange = { onChange(it.take(MomentPlayItemDto.BEFORE_AFTER_WORDS)) },
        singleLine = true,
        textStyle = TextStyle(color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold),
        cursorBrush = SolidColor(Color.White),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
        modifier = Modifier.width(132.dp).testTag(tag).semantics { contentDescription = "$placeholder label" },
        decorationBox = { field ->
            Box(
                contentAlignment = Alignment.CenterStart,
                modifier =
                    Modifier
                        .height(38.dp)
                        .clip(shape)
                        .background(PantopusColors.studioPillFill)
                        .border(1.dp, PantopusColors.studioPillOutline, shape)
                        .padding(horizontal = 12.dp),
            ) {
                if (words.isEmpty()) Text(text = placeholder, color = PantopusColors.studioPillSecondary, fontSize = 14.5.sp)
                field()
            }
        },
    )
}

/** A pill to tap in the tray, as the photostrip's. */
@Composable
private fun StudioChip(
    words: String,
    tag: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(19.dp)
    Text(
        text = words,
        color = Color.White,
        fontSize = 14.5.sp,
        fontWeight = FontWeight.SemiBold,
        modifier =
            Modifier
                .clip(shape)
                .background(PantopusColors.studioPillFill)
                .border(1.dp, PantopusColors.studioPillOutline, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = Spacing.s2)
                .testTag(tag),
    )
}
