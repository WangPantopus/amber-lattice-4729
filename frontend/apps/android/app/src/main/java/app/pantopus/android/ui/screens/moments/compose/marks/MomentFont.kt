package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Typeface

/**
 * "Pulse, reinvented" step 4: the Studio's letterings, LEAD-2's ten names shared by all three apps, in this order
 * (QUESTIONS, LEAD-2 01:30). Each app picks its nearest font; Android uses the families every phone carries, so nothing
 * is downloaded and nothing crosses apps but the names. [Classic] is today's bold system font, exactly: today's
 * composer, and every label made before, draw with it.
 */
enum class MomentFont(
    val key: String,
    val spoken: String,
    private val family: String?,
    private val style: Int,
) {
    Classic("classic", "Classic", null, Typeface.BOLD),
    Serif("serif", "Serif", "serif", Typeface.BOLD),
    Typewriter("typewriter", "Typewriter", "serif-monospace", Typeface.NORMAL),
    Marker("marker", "Marker", "casual", Typeface.NORMAL),
    Handwritten("handwritten", "Handwritten", "cursive", Typeface.NORMAL),
    Rounded("rounded", "Rounded", "sans-serif-medium", Typeface.NORMAL),
    Tall("tall", "Tall", "sans-serif-condensed", Typeface.BOLD),
    Script("script", "Script", "cursive", Typeface.BOLD),
    Mono("mono", "Mono", "monospace", Typeface.BOLD),
    Elegant("elegant", "Elegant", "serif", Typeface.ITALIC),
    ;

    /** The letters' typeface: today's bold system font for [Classic]. */
    val typeface: Typeface by lazy { family?.let { Typeface.create(it, style) } ?: Typeface.DEFAULT_BOLD }
}
