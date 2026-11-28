package app.pantopus.android.data.living

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlin.math.roundToInt

/**
 * CONTRACT 9h: which way the phone faced at the shutter. Sent with a Moment the camera took now (the Live mark) while
 * `pulse_reinvented` is on, only when the compass is good to 30 degrees or better. The server keeps it, rounded to 5
 * degrees, only where 9h says, and never answers it as a number.
 */
@JsonClass(generateAdapter = true)
data class MomentHeadingBody(
    val deg: Double,
    @Json(name = "accuracy_deg") val accuracyDeg: Double,
)

/**
 * "Pulse, reinvented" phase 4, the compass at the shutter for live beams (PHASE-4 piece 2; CONTRACT 9h), as the iPhone's
 * `MomentsStudioCompass.swift`. It reads the phone's rotation sensor only while the camera is up and the switch is on
 * ([watch]), keeps the reading taken at the shutter ([markShot]), and hands it to the Moment's post ([atShot]) when it
 * is fresh and good enough. A phone with no rotation sensor reads nothing and sends nothing. Nothing is kept anywhere.
 */
object LivingCompass : SensorEventListener {
    private const val GOOD_ENOUGH_DEG = 30.0
    private const val FRESH_MS = 2_000L
    private const val NO_ESTIMATE = 180.0

    private data class Reading(
        val deg: Double,
        val accuracyDeg: Double,
        val atMs: Long,
    )

    private var manager: SensorManager? = null
    private var latest: Reading? = null
    private var shot: Reading? = null
    private var declination = 0f
    private val rotation = FloatArray(9)
    private val orientation = FloatArray(3)

    /**
     * Starts reading while [on] (the switch, with the camera up); otherwise stops. [latitude] and [longitude], when the
     * phone has a place, turn magnetic north into true north.
     */
    fun watch(
        context: Context,
        on: Boolean,
        latitude: Double? = null,
        longitude: Double? = null,
    ) {
        stop()
        if (!on) return
        val sensors = context.getSystemService(SensorManager::class.java) ?: return
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
        if (latitude != null && longitude != null) {
            declination = GeomagneticField(latitude.toFloat(), longitude.toFloat(), 0f, System.currentTimeMillis()).declination
        }
        manager = sensors
        sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    fun stop() {
        manager?.unregisterListener(this)
        manager = null
        latest = null
        declination = 0f
    }

    /** The shutter: the reading of this moment, if one came in the last two seconds. */
    fun markShot() {
        shot = latest?.takeIf { SystemClock.elapsedRealtime() - it.atMs <= FRESH_MS }
    }

    /** The heading taken at the shutter, when the compass was good to 30 degrees or better; else null. */
    fun atShot(): MomentHeadingBody? {
        val reading = shot ?: return null
        if (reading.accuracyDeg > GOOD_ENOUGH_DEG) return null
        return MomentHeadingBody(deg = reading.deg, accuracyDeg = reading.accuracyDeg)
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        SensorManager.getOrientation(rotation, orientation)
        val magnetic = Math.toDegrees(orientation[0].toDouble())
        val deg = ((magnetic + declination) % 360 + 360) % 360
        // The rotation vector's own heading estimate (radians), when the phone gives one.
        val estimate = event.values.getOrNull(4)?.takeIf { it > 0f }?.let { Math.toDegrees(it.toDouble()) }
        val accuracy = estimate ?: byStatus(event.accuracy)
        latest = Reading((deg * 10).roundToInt() / 10.0, accuracy.coerceIn(0.0, NO_ESTIMATE), SystemClock.elapsedRealtime())
    }

    override fun onAccuracyChanged(
        sensor: Sensor?,
        accuracy: Int,
    ) = Unit

    private fun byStatus(status: Int): Double =
        when (status) {
            SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 10.0
            SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 25.0
            SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 45.0
            else -> NO_ESTIMATE
        }
}
