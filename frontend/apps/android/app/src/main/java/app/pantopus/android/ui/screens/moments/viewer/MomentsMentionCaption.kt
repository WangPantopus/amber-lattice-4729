package app.pantopus.android.ui.screens.moments.viewer

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentAuthorDto

/*
 * "Pulse, reinvented" (CONTRACT 7h), for a reader whose switch is on: the Moment's caption with each mentioned person's
 * "@Name" a link to their profile. The server sends `mentions` only to such a reader and leaves out people they blocked
 * or muted, or who blocked them; the caption's words are the author's, shown as they are.
 */

/** The name a mention is written with in the caption ("@First Last"). */
private fun MomentAuthorDto.mentionName(): String? = name?.takeIf { it.isNotBlank() } ?: firstName?.takeIf { it.isNotBlank() }

/** [caption] with every "@Name" of [mentions] a link that calls [onOpen] with that person. */
internal fun mentionText(
    caption: String,
    mentions: List<MomentAuthorDto>,
    onOpen: (MomentAuthorDto) -> Unit,
): AnnotatedString {
    // Each mention's places in the caption, longest name first where two would overlap.
    val spans =
        mentions
            .mapNotNull { person -> person.mentionName()?.let { "@$it" to person } }
            .sortedByDescending { it.first.length }
            .flatMap { (words, person) ->
                generateSequence(caption.indexOf(words)) { at -> caption.indexOf(words, at + 1).takeIf { it >= 0 } }
                    .takeWhile { it >= 0 }
                    .map { at -> at until at + words.length to person }
                    .toList()
            }.fold(emptyList<Pair<IntRange, MomentAuthorDto>>()) { kept, span ->
                if (kept.any { it.first.first <= span.first.last && span.first.first <= it.first.last }) kept else kept + span
            }.sortedBy { it.first.first }
    val style = TextLinkStyles(SpanStyle(fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline))
    return buildAnnotatedString {
        var at = 0
        spans.forEach { (range, person) ->
            append(caption.substring(at, range.first))
            withLink(LinkAnnotation.Clickable(tag = person.id, styles = style) { onOpen(person) }) {
                append(caption.substring(range.first, range.last + 1))
            }
            at = range.last + 1
        }
        append(caption.substring(at))
    }
}

/** The viewer's caption (today's look) with the mentioned names as links. */
@Composable
internal fun MomentMentionCaption(
    caption: String,
    mentions: List<MomentAuthorDto>,
    onOpen: (MomentAuthorDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    val open by rememberUpdatedState(onOpen)
    val text = remember(caption, mentions) { mentionText(caption, mentions) { person -> open(person) } }
    Text(
        text = text,
        color = Color.White,
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        lineHeight = 21.sp,
        textAlign = TextAlign.Center,
        modifier = modifier,
    )
}
