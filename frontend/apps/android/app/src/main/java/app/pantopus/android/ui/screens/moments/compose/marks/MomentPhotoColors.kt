@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Bitmap
import android.graphics.Color
import kotlin.math.abs

/**
 * "Pulse, reinvented"'s Studio, step 4: "From your photo", up to five colours the picture itself holds, read on the
 * phone (LEAD-2 01:30: today's six inks, then up to five from the photo; no colour picker). The picture is shrunk to a
 * small grid, its pixels grouped by hue, lightness and strength, and the most common groups that are neither grey nor
 * near black or white are kept, each a different enough hue.
 */
object MomentPhotoColors {
    private const val GRID = 40
    private const val MAX = 5
    private const val HUE_STEP = 15f
    private const val LIGHT_STEP = 0.25f
    private const val MIN_SATURATION = 0.18f
    private const val MIN_LIGHT = 0.12f
    private const val MAX_LIGHT = 0.92f
    private const val DISTINCT_HUE = 24f

    fun of(picture: Bitmap): List<Int> {
        val small = Bitmap.createScaledBitmap(picture, GRID, GRID, true)
        val groups = HashMap<Int, MutableList<FloatArray>>()
        val hsv = FloatArray(3)
        for (y in 0 until GRID) {
            for (x in 0 until GRID) {
                Color.colorToHSV(small.getPixel(x, y), hsv)
                if (!colourful(hsv)) continue
                val key = (hsv[0] / HUE_STEP).toInt() * 100 + (hsv[2] / LIGHT_STEP).toInt()
                groups.getOrPut(key) { mutableListOf() }.add(hsv.copyOf())
            }
        }
        if (small !== picture) small.recycle()
        val kept = mutableListOf<FloatArray>()
        groups.values.sortedByDescending { it.size }.forEach { members ->
            if (kept.size >= MAX) return@forEach
            val mean = FloatArray(3) { i -> members.map { it[i] }.average().toFloat() }
            if (kept.none { hueApart(it[0], mean[0]) < DISTINCT_HUE }) kept += mean
        }
        return kept.map { Color.HSVToColor(it) }
    }

    /** Neither grey nor near black, nor a washed-out near white. */
    private fun colourful(hsv: FloatArray): Boolean {
        val grey = hsv[1] < MIN_SATURATION
        val dark = hsv[2] < MIN_LIGHT
        val washed = hsv[2] > MAX_LIGHT && hsv[1] < MIN_SATURATION * 2
        return !grey && !dark && !washed
    }

    private fun hueApart(
        a: Float,
        b: Float,
    ): Float {
        val d = abs(a - b) % 360f
        return if (d > 180f) 360f - d else d
    }

    /** Whether letters on [color] read best dark (a light colour) or light. */
    fun isLight(color: Int): Boolean {
        val r = Color.red(color) / 255f
        val g = Color.green(color) / 255f
        val b = Color.blue(color) / 255f
        return (0.299f * r + 0.587f * g + 0.114f * b) > 0.6f
    }

    /** The colour read out as six hex digits, for TalkBack's sake. */
    fun spoken(color: Int): String = "Color from your photo, #%06X".format(color and 0xFFFFFF)
}
