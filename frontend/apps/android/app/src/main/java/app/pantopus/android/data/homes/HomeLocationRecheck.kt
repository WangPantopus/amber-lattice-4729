package app.pantopus.android.data.homes

import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.data.api.net.NetworkResult
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "We check once more on another day when you open Pantopus at home" (FASTVERIFY phase 5): while a first location
 * match stands unconfirmed, opening Place on a later calendar day (the home's time zone) takes one quiet reading. It
 * never asks for location (only an existing when-in-use permission is used), and tries at most once a day per Home
 * in a run of the app.
 */
@Singleton
class HomeLocationRecheck
    @Inject
    constructor(
        private val repository: HomeFastVerifyRepository,
        private val proof: HomeLocationProof,
    ) {
        private val tried = mutableSetOf<String>()

        /** True when the reading confirmed the mark. */
        suspend fun maybeConfirm(
            homeId: String,
            options: HomeVerifyOptions?,
            zone: ZoneId?,
        ): Boolean {
            if (!isDue(homeId, options, zone)) return false
            val challenge = (repository.locationChallenge(homeId) as? NetworkResult.Success)?.data?.challenge ?: return false
            val reading = proof.read() ?: return false
            val token = proof.integrityToken(challenge, reading)
            val result = (repository.checkLocation(homeId, challenge, reading, token) as? NetworkResult.Success)?.data?.result
            repository.refresh(homeId)
            return result == "confirmed"
        }

        /** A first match stands unconfirmed, it is a later day at the home, location is allowed, and today is untried. */
        private fun isDue(
            homeId: String,
            options: HomeVerifyOptions?,
            zone: ZoneId?,
        ): Boolean {
            val fast = options?.fast?.takeIf { options.isFast && it.kind == "location" && it.recheckDueAt != null }
            val homeZone = zone ?: ZoneId.systemDefault()
            val firstDay = fast?.let { runCatching { OffsetDateTime.parse(it.at).atZoneSameInstant(homeZone).toLocalDate() }.getOrNull() }
            val today = LocalDate.now(homeZone)
            val due = firstDay != null && today.isAfter(firstDay) && proof.hasPermission()
            return due && synchronized(tried) { tried.add("${homeId.lowercase()}|$today") }
        }
    }
