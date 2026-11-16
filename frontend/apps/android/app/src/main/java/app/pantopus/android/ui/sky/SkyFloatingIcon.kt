package app.pantopus.android.ui.sky

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The Sky's floating icon (contract section 10.1): a dashed circle with a dot in it, beside "Around …" on the
 * Moment Post sheet and the Pulse composer, where a pin icon stands for an exact place.
 */
@Composable
fun SkyFloatingIcon(
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = 18.dp,
) {
    Canvas(modifier = modifier.size(size)) {
        val side = this.size.minDimension
        val stroke = side * STROKE
        drawCircle(
            color = color,
            radius = side / 2 - side * INSET,
            style =
                Stroke(
                    width = stroke,
                    cap = StrokeCap.Round,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(side * DASH, side * GAP)),
                ),
        )
        drawCircle(color = color, radius = side * DOT)
    }
}

private const val STROKE = 0.11f
private const val INSET = 0.09f
private const val DASH = 0.14f
private const val GAP = 0.13f
private const val DOT = 0.15f
