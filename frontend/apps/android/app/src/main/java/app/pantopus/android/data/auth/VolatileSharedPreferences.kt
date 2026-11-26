package app.pantopus.android.data.auth

import android.content.SharedPreferences

/**
 * In-memory fallback [SharedPreferences] used by [TokenStorage] only when the
 * Android Keystore refuses to open or recreate `EncryptedSharedPreferences`
 * even after clearing the prefs file and MasterKey alias. Never writes tokens
 * to plaintext disk storage and lets the app open cleanly signed out instead of
 * permanently crash-looping on launch.
 */
internal class VolatileSharedPreferences : SharedPreferences {
    private val lock = Any()
    private val values = mutableMapOf<String, Any?>()

    override fun getAll(): MutableMap<String, *> = synchronized(lock) { values.toMutableMap() }

    override fun getString(
        key: String?,
        defValue: String?,
    ): String? = synchronized(lock) { values[key] as? String ?: defValue }

    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(
        key: String?,
        defValues: MutableSet<String>?,
    ): MutableSet<String>? = synchronized(lock) { (values[key] as? Set<String>)?.toMutableSet() ?: defValues }

    override fun getInt(
        key: String?,
        defValue: Int,
    ): Int = synchronized(lock) { values[key] as? Int ?: defValue }

    override fun getLong(
        key: String?,
        defValue: Long,
    ): Long = synchronized(lock) { values[key] as? Long ?: defValue }

    override fun getFloat(
        key: String?,
        defValue: Float,
    ): Float = synchronized(lock) { values[key] as? Float ?: defValue }

    override fun getBoolean(
        key: String?,
        defValue: Boolean,
    ): Boolean = synchronized(lock) { values[key] as? Boolean ?: defValue }

    override fun contains(key: String?): Boolean = synchronized(lock) { values.containsKey(key) }

    override fun edit(): SharedPreferences.Editor = VolatileEditor()

    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit

    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit

    private inner class VolatileEditor : SharedPreferences.Editor {
        private val pending = mutableMapOf<String, Any?>()
        private var clearAll = false

        override fun putString(
            key: String?,
            value: String?,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = value }

        override fun putStringSet(
            key: String?,
            values: MutableSet<String>?,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = values?.toSet() }

        override fun putInt(
            key: String?,
            value: Int,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = value }

        override fun putLong(
            key: String?,
            value: Long,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = value }

        override fun putFloat(
            key: String?,
            value: Float,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = value }

        override fun putBoolean(
            key: String?,
            value: Boolean,
        ): SharedPreferences.Editor = apply { if (key != null) pending[key] = value }

        override fun remove(key: String?): SharedPreferences.Editor = apply { if (key != null) pending[key] = null }

        override fun clear(): SharedPreferences.Editor = apply { clearAll = true }

        override fun commit(): Boolean {
            synchronized(lock) {
                if (clearAll) values.clear()
                pending.forEach { (key, value) ->
                    if (value == null) values.remove(key) else values[key] = value
                }
            }
            return true
        }

        override fun apply() {
            commit()
        }
    }
}
