package app.pantopus.android.ui.guidance

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Marks the control a pointer may ring (spec §5, cards 8–15). Harmless where no guidance host is above it (previews,
 * tests) or while no pointer is looking: it only tells the host where the control is. [cornerRadius] is the control's
 * own corner radius; null rings it as a circle or a pill.
 */
fun Modifier.guidanceAnchor(
    target: GuidanceTarget,
    cornerRadius: Dp? = null,
    /** How far the visible control sits inside this node (a 40 dp round button in a 48 dp touch box: 4 dp). */
    inset: Dp = 0.dp,
): Modifier = this then GuidanceAnchorElement(target, cornerRadius, inset)

/** Where a ringed control is: its window bounds, read when asked. */
class GuidanceAnchor internal constructor(
    val target: GuidanceTarget,
    val cornerRadius: Dp?,
    private val read: () -> Rect?,
    private val shown: () -> Boolean,
) {
    /** The control's whole bounds in the window, or null once it left the screen. */
    fun bounds(): Rect? = read()

    /** The control is on screen: nearly all of it shows, not scrolled away or clipped by its list. */
    fun onScreen(): Boolean = shown()

    internal companion object {
        private const val VISIBLE_SHARE = 0.9f

        fun of(
            target: GuidanceTarget,
            cornerRadius: Dp?,
            insetPx: Float,
            coordinates: LayoutCoordinates,
        ): GuidanceAnchor {
            val bounds = {
                if (coordinates.isAttached) {
                    val origin = coordinates.positionInWindow()
                    Rect(origin.x, origin.y, origin.x + coordinates.size.width, origin.y + coordinates.size.height).deflate(insetPx)
                } else {
                    null
                }
            }
            val shown = shown@{
                val full = bounds() ?: return@shown false
                if (full.width <= 0f || full.height <= 0f) return@shown false
                val visible = coordinates.boundsInWindow()
                visible.width >= full.width * VISIBLE_SHARE && visible.height >= full.height * VISIBLE_SHARE
            }
            return GuidanceAnchor(target, cornerRadius, bounds, shown)
        }

        /** One ring around several controls (Mail's “Me” and “Home” chips). */
        fun union(parts: List<GuidanceAnchor>): GuidanceAnchor =
            GuidanceAnchor(
                target = parts.first().target,
                cornerRadius = parts.first().cornerRadius,
                read = {
                    parts.mapNotNull { it.bounds() }.takeIf { it.size == parts.size }?.reduce { a, b ->
                        Rect(minOf(a.left, b.left), minOf(a.top, b.top), maxOf(a.right, b.right), maxOf(a.bottom, b.bottom))
                    }
                },
                shown = { parts.all { it.onScreen() } },
            )
    }
}

/** The controls the screens marked with [guidanceAnchor]; the latest placed one wins for each target. */
class GuidanceAnchors {
    private val placed = LinkedHashMap<Any, GuidanceAnchor>()

    /** Bumps whenever a control is placed, moves or leaves, so decisions that read [onScreen] run again. */
    var revision by mutableIntStateOf(0)
        private set

    internal fun place(
        owner: Any,
        anchor: GuidanceAnchor,
    ) {
        placed.remove(owner)
        placed[owner] = anchor
        revision++
    }

    internal fun remove(owner: Any) {
        if (placed.remove(owner) != null) revision++
    }

    /** The on-screen control for [target], if any; Mail's “Me” and “Home” chips make one ring around both. */
    fun find(target: GuidanceTarget): GuidanceAnchor? {
        val shown = placed.values.filter { it.target == target && it.onScreen() }
        return when {
            shown.isEmpty() -> null
            target == GuidanceTarget.MailMeHome && shown.size > 1 -> GuidanceAnchor.union(shown)
            else -> shown.last()
        }
    }

    /** The targets whose controls are on screen now. */
    fun onScreen(): Set<GuidanceTarget> {
        @Suppress("UNUSED_VARIABLE")
        val read = revision
        return placed.values.filter { it.onScreen() }.map { it.target }.toSet()
    }
}

private data class GuidanceAnchorElement(
    val target: GuidanceTarget,
    val cornerRadius: Dp?,
    val inset: Dp,
) : ModifierNodeElement<GuidanceAnchorNode>() {
    override fun create() = GuidanceAnchorNode(target, cornerRadius, inset)

    override fun update(node: GuidanceAnchorNode) {
        node.target = target
        node.cornerRadius = cornerRadius
        node.inset = inset
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "guidanceAnchor"
        properties["target"] = target
    }
}

private class GuidanceAnchorNode(
    var target: GuidanceTarget,
    var cornerRadius: Dp?,
    var inset: Dp,
) : Modifier.Node(),
    GlobalPositionAwareModifierNode,
    CompositionLocalConsumerModifierNode {
    private var anchors: GuidanceAnchors? = null

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        val host = currentValueOf(LocalGuidance) ?: return
        anchors = host.anchors
        val insetPx = with(currentValueOf(LocalDensity)) { inset.toPx() }
        host.anchors.place(this, GuidanceAnchor.of(target, cornerRadius, insetPx, coordinates))
    }

    override fun onDetach() {
        anchors?.remove(this)
        anchors = null
    }
}
