@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.place.detail

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import app.pantopus.android.ui.theme.SkyPalette
import app.pantopus.android.ui.theme.SkyPalette.mixed
import kotlin.math.max
import kotlin.math.min

/*
 * The house on Today (JOURNEYS, founder approval 2026-11-21): the "Now" card's ground drawn larger, and three more
 * true things on it. A mailbox by the house (its red flag up while mail waits unopened), a note on the door while
 * something needs the person, and a lantern on the far hill while a plan is on Today. Each is drawn only while it is
 * true, never who, and each is a button like the bins (`TodaySky.kt`). Twin of iOS `TodaySkyHouseObjects.swift` and the
 * web's `houseSpots.ts`; the numbers match the web's.
 */

/** What stands in the picture now, each 0 (not there) to 1 (there) so it can fade in. */
data class SkyHouseObjects(
    /** The mailbox itself: where the Mailbox is on. */
    val mailbox: Float = 0f,
    /** Its flag, up while the person has unopened mail (the Mail tab's badge count). */
    val flag: Float = 0f,
    /** A note on the door: something needs the person. */
    val note: Float = 0f,
    /** A lantern on the far hill: a plan is on Today's cards. */
    val lantern: Float = 0f,
)

/**
 * Where the larger ground stands in a card [width] × [height] dp and where each thing on it is, for the painter and for
 * the 44 dp targets laid over the picture. The ground (hills, home, bins, trees) is drawn [scale] times larger, so a
 * first house is about 130 dp across its roof; a home too tall for the card is drawn a little smaller so its roof stays
 * inside. Centres of things that can be tapped are at least 56 dp apart.
 */
internal class SkyHouseSpots(
    width: Float,
    height: Float,
    home: SkyHome,
    binCount: Int,
) {
    val scale: Float = max(1f, min(SCALE, (height - 8) / (homeHeight(home) + DOOR_ABOVE_BOTTOM)))

    /** The door's foot. */
    val door: Offset

    /** The roof's left edge: the reading's chips stay left of it. */
    val left: Float

    /** The mailbox's post's foot, and the middle of its target. */
    val mailboxFoot: Offset
    val mailbox: Offset

    /** The note's middle, on the door. */
    val note: Offset

    /** Where the lantern's stem stands on the far hill, and the middle of its light. */
    val lanternFoot: Offset
    val lantern: Offset

    /** The bins' middle (where they stand when they are out). */
    val bins: Offset

    init {
        val reach = home.leftReach
        val y = height - DOOR_ABOVE_BOTTOM * scale
        // Up to three bins stand past the home's left edge; the mailbox keeps clear of the widest row.
        val widestBins = (reach + 2 + (3 * 9 - 2) / 2f) * scale
        val mailboxLeftOfDoor = widestBins + APART + 2
        // Room on the right for the garage and the round tree; on the left for the mailbox's target.
        val rightNeed = (home.rightReach + 22) * scale + 4
        val leftNeed = mailboxLeftOfDoor + 22 + 4
        val x = max(leftNeed, min(width * 0.7f, width - rightNeed))
        door = Offset(x, y)
        left = x - reach * scale
        mailboxFoot = Offset(x - mailboxLeftOfDoor, y + 4 * scale)
        mailbox = Offset(mailboxFoot.x, mailboxFoot.y - 20)
        val (noteAcross, noteUp) = notePlace(home)
        note = Offset(x + noteAcross * scale, y - noteUp * scale)
        bins = Offset(x - (reach + 2 + (max(1, binCount) * 9 - 2) / 2f) * scale, y + 3 * scale)
        // Just left of the roof, on the far hill's crest: over the bins and far above them.
        val lanternX = left - 12
        val crest = height - (TodaySkyGround.HORIZON + TodaySkyGround.backHillRise(lanternX / width)) * scale
        lanternFoot = Offset(lanternX, crest)
        lantern = Offset(lanternX, crest - LANTERN_STEM - LANTERN_ACROSS / 2)
    }

    companion object {
        /** How much larger the ground is drawn. */
        const val SCALE = 2.6f

        /** Between the centres of two things that can be tapped. */
        const val APART = 56f

        /** The door's foot above the card's bottom at the scene's own size: the horizon's 34, down 7 to the ground line. */
        private const val DOOR_ABOVE_BOTTOM = 27f

        const val LANTERN_STEM = 14f
        const val LANTERN_ACROSS = 11f

        /** How tall the home stands above its door's foot, roof and chimney included, at the scene's own size. */
        private fun homeHeight(home: SkyHome): Float =
            when (home.kind) {
                SkyHome.Kind.APARTMENT -> 54f
                SkyHome.Kind.TOWNHOUSE -> 44f
                SkyHome.Kind.MOBILE -> 22f
                SkyHome.Kind.HOUSE -> home.wallHeight + if (home.roof == SkyHome.Roof.FLAT) 14f else 22f
            }

        /** The middle of the door's upper part, across from and above its foot, at the scene's own size. */
        private fun notePlace(home: SkyHome): Pair<Float, Float> =
            when (home.kind) {
                SkyHome.Kind.MOBILE -> 6f to 10f
                SkyHome.Kind.APARTMENT -> 0f to 5.5f
                SkyHome.Kind.TOWNHOUSE -> 0f to 6.5f
                SkyHome.Kind.HOUSE -> 0f to 7f
            }
    }
}

/** The colours the things on the ground share: the home's silhouette, and whether lamps are lit (dusk and night). */
internal class SkyHouseTones(
    val silhouette: Color,
    val lit: Boolean,
    val night: Boolean,
)

/**
 * The mailbox, the note and the lantern at their places, in dp at their own sizes (the ground around them is scaled,
 * they are not): the mailbox's box 22 × 12 on a 24 dp post with a 10 × 6 flag on a 13 dp staff, the note 10 × 8, the
 * lantern 11 across on a 14 dp stem. Silhouettes take the home's colour; the flag, the note and the lantern keep their
 * own, with a thin outline in the home's colour by day so they read on a bright sky.
 */
internal fun DrawScope.paintHouseObjects(
    spots: SkyHouseSpots,
    objects: SkyHouseObjects,
    tones: SkyHouseTones,
) {
    if (objects.lantern > 0f) paintLantern(spots, tones, objects.lantern)
    if (objects.mailbox > 0f) paintMailbox(spots, tones, objects.mailbox, objects.flag)
    if (objects.note > 0f) paintDoorNote(spots, tones, objects.note)
}

private fun DrawScope.paintMailbox(
    spots: SkyHouseSpots,
    tones: SkyHouseTones,
    alpha: Float,
    flag: Float,
) {
    val foot = spots.mailboxFoot
    val top = foot.y - 24
    drawRect(tones.silhouette.copy(alpha = alpha), Offset(foot.x - 1.5f, top), Size(3f, 24f))
    // The box catches a little light, like the garage doors, so it reads against the hill behind it.
    val box = tones.silhouette.mixed(SkyPalette.white, if (tones.night) 0.5f else 0.38f)
    drawRoundRect(box.copy(alpha = alpha), Offset(foot.x - 11, top - 12), Size(22f, 12f), CornerRadius(4f))
    drawRect(tones.silhouette.copy(alpha = alpha * 0.5f), Offset(foot.x - 11, top - 2.5f), Size(22f, 1.2f))
    if (flag <= 0f) return
    val staff = Offset(foot.x + 7, top - 12 - 9)
    drawRect(tones.silhouette.copy(alpha = alpha * flag), staff, Size(1.4f, 13f))
    val cloth = Offset(staff.x + 1.4f, staff.y)
    drawRect(SkyPalette.mailFlag.copy(alpha = alpha * flag), cloth, Size(10f, 6f))
    if (!tones.lit) drawRect(tones.silhouette.copy(alpha = alpha * flag), cloth, Size(10f, 6f), style = Stroke(0.8f))
}

private fun DrawScope.paintDoorNote(
    spots: SkyHouseSpots,
    tones: SkyHouseTones,
    alpha: Float,
) {
    val topLeft = Offset(spots.note.x - 5, spots.note.y - 4)
    val paper = if (tones.night) SkyPalette.doorNote.mixed(tones.silhouette, 0.12f) else SkyPalette.doorNote
    drawRoundRect(paper.copy(alpha = alpha), topLeft, Size(10f, 8f), CornerRadius(1.2f))
    // Two lines of writing.
    val ink = tones.silhouette.copy(alpha = alpha * 0.45f)
    drawRect(ink, Offset(topLeft.x + 2, topLeft.y + 2.4f), Size(6f, 0.9f))
    drawRect(ink, Offset(topLeft.x + 2, topLeft.y + 4.8f), Size(4f, 0.9f))
    if (!tones.lit) {
        drawRoundRect(tones.silhouette.copy(alpha = alpha), topLeft, Size(10f, 8f), CornerRadius(1.2f), style = Stroke(0.8f))
    }
}

private fun DrawScope.paintLantern(
    spots: SkyHouseSpots,
    tones: SkyHouseTones,
    alpha: Float,
) {
    val foot = spots.lanternFoot
    val light = spots.lantern
    val radius = SkyHouseSpots.LANTERN_ACROSS / 2
    drawRect(
        tones.silhouette.copy(alpha = alpha),
        Offset(foot.x - 0.8f, foot.y - SkyHouseSpots.LANTERN_STEM),
        Size(1.6f, SkyHouseSpots.LANTERN_STEM + 1),
    )
    if (tones.lit) {
        drawCircle(
            Brush.radialGradient(
                listOf(SkyPalette.lantern.copy(alpha = 0.4f * alpha), SkyPalette.lantern.copy(alpha = 0f)),
                light,
                radius * 3.2f,
            ),
            radius * 3.2f,
            light,
        )
    }
    drawCircle(SkyPalette.lantern.copy(alpha = alpha), radius, light)
    if (!tones.lit) drawCircle(tones.silhouette.copy(alpha = alpha), radius, light, style = Stroke(0.8f))
    // Its cap.
    drawRect(tones.silhouette.copy(alpha = alpha), Offset(light.x - 3, light.y - radius - 1.5f), Size(6f, 2f))
}
