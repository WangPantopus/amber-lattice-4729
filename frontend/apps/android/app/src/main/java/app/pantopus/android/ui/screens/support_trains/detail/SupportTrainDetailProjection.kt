@file:Suppress("PackageNaming", "MagicNumber", "TooManyFunctions")

package app.pantopus.android.ui.screens.support_trains.detail

import app.pantopus.android.core.identity.MadeUpUsername
import app.pantopus.android.data.api.models.support_trains.SupportTrainCoarseLocationDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainContributionMode
import app.pantopus.android.data.api.models.support_trains.SupportTrainDetailDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainModesDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainMyReservationDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainOrganizerDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainReservationDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainSlotDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainUpdateDto
import app.pantopus.android.ui.components.SlotCalendarDay
import app.pantopus.android.ui.components.SlotCalendarState
import java.text.SimpleDateFormat
import java.time.OffsetDateTime
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Maps the shared `GET /api/support-trains/:id` payload onto the Detail
 * render model. Mirrors iOS `SupportTrainDetailViewModel.project`.
 *
 * The detail endpoint omits other helpers' private contributions. Organizers and recipients
 * additionally read the existing role-gated reservations endpoint for the current visit.
 * Other viewers keep the coarse covered rows; no helper identities are inferred from organizers.
 */
object SupportTrainDetailProjection {
    private const val MILLIS_PER_DAY = 1000L * 60 * 60 * 24

    @Suppress("CyclomaticComplexMethod")
    fun project(
        dto: SupportTrainDetailDto,
        helperReservations: List<SupportTrainReservationDto>? = null,
    ): SupportTrainDetailContent {
        // A removed date is never shown or counted (A10), whatever an older server sends.
        val slots = (dto.slots ?: emptyList()).filterNot { it.isRemoved }
        val reservations = dto.myReservations ?: emptyList()
        val organizers = dto.organizers ?: emptyList()
        // The train's own day, not the phone's or UTC's (B4).
        val today = trainToday(dto)
        val zone = trainZone(dto.timezone)

        val covered = slots.count { it.isCovered }
        val total = slots.size
        val title = dto.title ?: dto.recipientSummary ?: "Support train"
        val primaryName = organizers.firstOrNull()?.user?.let { it.name ?: MadeUpUsername.chosen(it.username) }
        val role = viewerRole(dto)
        val activeHelpers =
            helperReservations?.filter { it.status in ACTIVE_SIGNUPS }
        val helpers = activeHelpers?.let(::distinctHelpers)

        val typeDates =
            TypeDatesCardContent(
                kind = kind(dto.supportModes),
                title = title,
                dateRange = dateRange(slots),
                daysLeft = daysLeft(slots, dto.status, today),
                slotsFilled = covered,
                slotsTotal = total,
                contributors =
                    helpers.orEmpty().take(4).mapIndexed { index, name ->
                        ContributorBubble(
                            id = "helper-$index",
                            initials = initials(name),
                            tone = CONTRIBUTOR_TONES[index % CONTRIBUTOR_TONES.size],
                        )
                    },
                extraCount = ((helpers?.size ?: 0) - 4).coerceAtLeast(0),
                status = dto.status,
                helperCount = helpers?.size,
            )
        val isFull = typeDates.isFullyCovered
        val mineSlotIds = reservations.mapNotNull { it.slotId }.toSet()
        val enabled = enabledModes(dto.supportModes)
        val openSlots =
            slots
                .filter {
                    !it.isCovered && (it.status ?: "open") == "open" && it.id !in mineSlotIds && !isOver(it, today)
                }
                .sortedBy { it.slotDate ?: "" }

        return SupportTrainDetailContent(
            trainId = dto.id,
            recipient = recipient(dto, primaryName),
            typeDates = typeDates,
            calendarDays = calendar(slots, reservations, today),
            sections =
                sections(slots, reservations, helperReservations, today, zone, role).let { all ->
                    if (dto.status == "completed" || dto.status == "archived") {
                        all.map { section -> section.copy(rows = section.rows.map { it.copy(signupChangeable = false) }) }
                    } else {
                        all
                    }
                },
            hostedBy = hostedBy(primaryName, organizers.firstOrNull()?.user?.id),
            dock = dock(dto.status, isFull, role),
            celebrationBanner =
                if (isFull) {
                    CelebrationBanner(
                        title = "Every slot is covered",
                        // No backup sign-up exists yet (see the dock), so don't offer one,
                        // and don't repeat the title.
                        body = "Thank you, everyone. No more sign-ups are needed right now.",
                    )
                } else {
                    null
                },
            // The person the train is for isn't asked to sign up for their own meals (B2).
            reserveOptions = if (role == SupportTrainViewerRole.RECIPIENT) emptyList() else openSlots.map { reserveOption(it, enabled) },
            reserveContext =
                ReserveSheetContext(
                    enabledModes = enabled,
                    restrictionChips =
                        ((dto.dietaryRestrictions ?: emptyList()) + (dto.dietaryPreferences ?: emptyList()))
                            .map(::dietaryLabel),
                    contactlessPreferred = dto.contactlessPreferred == true,
                    timezone = dto.timezone,
                ),
            viewerRole = role,
            exactAddress = dto.address?.singleLineLabel?.takeIf { it.isNotBlank() },
            deliveryInstructions = dto.deliveryInstructions,
            specialInstructions = dto.specialInstructions?.trim()?.takeIf { it.isNotEmpty() },
            updates = updateCards(dto.updates.orEmpty(), organizers),
            chatRoomId = dto.chatThreadId?.takeIf { it.isNotBlank() },
        )
    }

    /** A signup that still counts: reserved, delivered or confirmed (not canceled). */
    private val ACTIVE_SIGNUPS = setOf("reserved", "delivered", "confirmed")

    private val CONTRIBUTOR_TONES =
        listOf(ContributorTone.Warning, ContributorTone.Primary, ContributorTone.Business, ContributorTone.Success)

    /** One name per person signed up (an account, or a guest by email), in signup order. */
    private fun distinctHelpers(reservations: List<SupportTrainReservationDto>): List<String> {
        val seen = linkedMapOf<String, String>()
        reservations.forEach { row ->
            val key =
                (row.helperUser?.id ?: row.userId)?.let { "user:$it" }
                    ?: row.guestEmail?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }?.let { "guest:$it" }
                    ?: "row:${row.id}"
            seen.putIfAbsent(key, row.displayName)
        }
        return seen.values.toList()
    }

    /**
     * The organizers' updates in the API's order (newest first), each signed by the organizer
     * who posted it. A made-up username is never shown; "Organizer" stands in, as on the web.
     */
    fun updateCards(
        updates: List<SupportTrainUpdateDto>,
        organizers: List<SupportTrainOrganizerDto>,
    ): List<TrainUpdateCard> {
        val names = mutableMapOf<String, String>()
        organizers.mapNotNull { it.organizerUser }.forEach { user ->
            val name = user.name?.takeIf { it.isNotBlank() } ?: MadeUpUsername.chosen(user.username)
            if (name != null && user.id !in names) names[user.id] = name
        }
        return updates.mapNotNull { update ->
            val body = update.body?.trim().orEmpty()
            if (body.isEmpty()) return@mapNotNull null
            TrainUpdateCard(
                id = update.id,
                author = update.authorUserId?.let { names[it] } ?: "Organizer",
                timeLabel = updateTimeLabel(update.createdAt),
                body = body,
            )
        }
    }

    /** "just now", "5m ago", "2h ago", then "Oct 3", as the web train page's Updates tab. */
    fun updateTimeLabel(
        iso: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): String? {
        if (iso.isNullOrBlank()) return null
        val posted = runCatching { OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrNull() ?: return null
        val minutes = ((nowMillis - posted).coerceAtLeast(0) / 60_000).toInt()
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "${minutes}m ago"
            minutes < 60 * 24 -> "${minutes / 60}h ago"
            else -> SimpleDateFormat("MMM d", Locale.US).format(Date(posted))
        }
    }

    private fun dock(
        status: String?,
        isFull: Boolean,
        role: SupportTrainViewerRole,
    ): SupportTrainDock =
        when {
            // Organizers run the train from Manage (B2); the recipient isn't asked to sign up.
            role.isOrganizer -> SupportTrainDock.Manage
            role == SupportTrainViewerRole.RECIPIENT -> SupportTrainDock.None
            else ->
                signupsClosedReason(status)?.let { SupportTrainDock.Closed(it) }
                    ?: if (isFull) SupportTrainDock.SendCardAndBackup else SupportTrainDock.SignUp("Sign up for a slot")
        }

    /**
     * Reservations only open on a published or active train; the server
     * refuses the rest, so the dock says why instead of offering a sign-up.
     */
    fun signupsClosedReason(status: String?): String? =
        when (status) {
            "paused" -> "Signups paused"
            "completed", "archived" -> "This train has ended"
            "draft" -> "Not published yet"
            else -> null
        }

    /**
     * `viewer_level` + `viewer_support_train_role` → the client-side
     * permission gate (`backend/routes/supportTrains.js:3693`).
     */
    fun viewerRole(dto: SupportTrainDetailDto): SupportTrainViewerRole =
        when (dto.viewerSupportTrainRole) {
            "primary" -> SupportTrainViewerRole.PRIMARY_ORGANIZER
            "co_organizer", "recipient_delegate" -> SupportTrainViewerRole.CO_ORGANIZER
            "recipient" -> SupportTrainViewerRole.RECIPIENT
            "helper" -> SupportTrainViewerRole.HELPER
            else ->
                if (dto.viewerLevel == "organizer") {
                    SupportTrainViewerRole.CO_ORGANIZER
                } else {
                    SupportTrainViewerRole.VIEWER
                }
        }

    private fun enabledModes(modes: SupportTrainModesDto?): List<SupportTrainContributionMode> {
        if (modes == null) return SupportTrainContributionMode.entries.toList()
        return buildList {
            if (modes.homeCookedMeals == true) add(SupportTrainContributionMode.COOK)
            if (modes.takeout == true) add(SupportTrainContributionMode.TAKEOUT)
            if (modes.groceries == true) add(SupportTrainContributionMode.GROCERIES)
        }
    }

    private fun reserveOption(
        slot: SupportTrainSlotDto,
        enabled: List<SupportTrainContributionMode>,
    ): ReserveSlotOption {
        val date = parseDate(slot.slotDate)
        return ReserveSlotOption(
            id = slot.id,
            dateLabel = date?.let { format(it, "EEEE, MMMM d") } ?: (slot.slotDate ?: ""),
            slotLabel = slot.slotLabel ?: slot.supportMode?.replaceFirstChar { it.uppercase() } ?: "Slot",
            windowLabel = windowLabel(slot),
            slotDate = slot.slotDate,
            windowStart = slot.startTime,
            modes = modesFor(slot, enabled),
        )
    }

    /**
     * The ways of helping a date takes, as the server checks them (B3): a groceries date takes groceries; a meal date
     * takes a home-cooked meal or takeout. Only the ones the train asks for.
     */
    fun modesFor(
        slot: SupportTrainSlotDto,
        enabled: List<SupportTrainContributionMode>,
    ): List<SupportTrainContributionMode> {
        val fits =
            if (slot.supportMode == "groceries") {
                setOf(SupportTrainContributionMode.GROCERIES)
            } else {
                setOf(SupportTrainContributionMode.COOK, SupportTrainContributionMode.TAKEOUT)
            }
        return enabled.filter { it in fits }
    }

    private fun windowLabel(slot: SupportTrainSlotDto): String? {
        val start = slot.startTime
        if (start.isNullOrEmpty()) return null
        val end = slot.endTime
        return if (end.isNullOrEmpty()) "${shortTime(start)}+" else "${shortTime(start)} – ${shortTime(end)}"
    }

    private fun recipient(
        dto: SupportTrainDetailDto,
        primaryName: String?,
    ): RecipientCardContent {
        val name = dto.title ?: dto.recipientSummary ?: "Support train"
        return RecipientCardContent(
            initials = initials(name),
            householdName = name,
            identityTag = RecipientIdentityTag.Home,
            verified = false,
            address = locationLabel(dto.coarseLocation),
            proximity = null,
            quote = dto.story ?: dto.recipientSummary ?: "",
            quoteAttribution = primaryName,
            details = recipientDetails(dto),
        )
    }

    /** What helpers should know before they cook or shop (A14), in the order they'd read it. */
    fun recipientDetails(dto: SupportTrainDetailDto): List<RecipientDetailLine> =
        buildList {
            dto.householdSize?.takeIf { it > 0 }?.let { add(RecipientDetailLine("Household", if (it == 1) "1 person" else "$it people")) }
            dto.dietaryRestrictions.orEmpty().filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { items ->
                add(RecipientDetailLine("Allergies", items.joinToString(", ") { dietaryLabel(it) }))
            }
            dto.dietaryPreferences.orEmpty().filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { items ->
                add(RecipientDetailLine("Diet", items.joinToString(", ") { dietaryLabel(it) }))
            }
            val window = dto.preferredDropoffWindow
            val start = window?.startTime?.takeIf { it.isNotBlank() }
            val end = window?.endTime?.takeIf { it.isNotBlank() }
            when {
                start != null && end != null -> add(RecipientDetailLine("Drop-off", "${shortTime(start)} – ${shortTime(end)}"))
                start != null -> add(RecipientDetailLine("Drop-off", "From ${shortTime(start)}"))
                end != null -> add(RecipientDetailLine("Drop-off", "By ${shortTime(end)}"))
            }
            if (dto.contactlessPreferred == true) add(RecipientDetailLine("Contactless", "Leave it at the door"))
        }

    private fun hostedBy(
        primaryName: String?,
        primaryUserId: String?,
    ): HostedByFooter {
        val name = primaryName ?: "Organizer"
        return HostedByFooter(
            organizerInitials = initials(name),
            organizerDisplayName = name,
            neighborHint = null,
            organizerUserId = primaryUserId,
        )
    }

    private fun locationLabel(loc: SupportTrainCoarseLocationDto?): String {
        if (loc == null) return ""
        val city = loc.city
        val state = loc.state
        return when {
            city != null && state != null -> "$city, $state"
            city != null -> city
            state != null -> state
            else -> ""
        }
    }

    private fun kind(modes: SupportTrainModesDto?): SupportTrainKind =
        when {
            modes == null -> SupportTrainKind.Generic
            modes.homeCookedMeals == true || modes.takeout == true -> SupportTrainKind.Meals
            modes.groceries == true -> SupportTrainKind.Errands
            else -> SupportTrainKind.Generic
        }

    private fun calendar(
        slots: List<SupportTrainSlotDto>,
        reservations: List<SupportTrainMyReservationDto>,
        today: Date,
    ): List<SlotCalendarDay> {
        val coveredDates = slots.filter { it.isCovered }.mapNotNull { parseDate(it.slotDate)?.time }.toSet()
        val openDates = slots.filterNot { it.isCovered }.mapNotNull { parseDate(it.slotDate)?.time }.toSet()
        val slotById = slots.associateBy { it.id }
        val mineDates =
            reservations.mapNotNull { res -> res.slotId?.let { slotById[it] }?.let { parseDate(it.slotDate)?.time } }.toSet()

        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        val earliest = slots.mapNotNull { parseDate(it.slotDate) }.minByOrNull { it.time } ?: today
        cal.time = earliest
        cal.add(Calendar.DAY_OF_MONTH, -(cal.get(Calendar.DAY_OF_WEEK) - 1))
        val start = cal.time
        val todayMillis = today.time

        return (0 until 28).map { idx ->
            cal.time = start
            cal.add(Calendar.DAY_OF_MONTH, idx)
            val date = cal.time
            val millis = date.time
            val state =
                when {
                    millis < todayMillis -> SlotCalendarState.Past
                    millis == todayMillis -> SlotCalendarState.Today
                    millis in mineDates -> SlotCalendarState.Mine
                    millis in coveredDates -> SlotCalendarState.Filled
                    millis in openDates -> SlotCalendarState.Open
                    else -> SlotCalendarState.Unscheduled // no slot that future day — inert/muted tile
                }
            SlotCalendarDay(id = "day-$idx", date = date, dayNumber = cal.get(Calendar.DAY_OF_MONTH), state = state)
        }
    }

    @Suppress("CyclomaticComplexMethod")
    private fun sections(
        slots: List<SupportTrainSlotDto>,
        reservations: List<SupportTrainMyReservationDto>,
        helperReservations: List<SupportTrainReservationDto>?,
        today: Date,
        zone: TimeZone,
        role: SupportTrainViewerRole,
    ): List<SlotSection> {
        val out = mutableListOf<SlotSection>()
        val slotById = slots.associateBy { it.id }

        val mineRows = reservations.map { reservationRow(it, it.slotId?.let { id -> slotById[id] }, today, zone) }
        if (mineRows.isNotEmpty()) {
            out += SlotSection(id = "mine", overline = "Your commitment", rows = mineRows)
        }

        val open = slots.filter { !it.isCovered && !isOver(it, today) }.sortedBy { it.slotDate ?: "" }
        if (open.isNotEmpty()) {
            val shown = open.take(4).map { slotRow(it, covered = false) }
            val action = if (open.size > shown.size) "See all ${open.size}" else null
            out +=
                SlotSection(
                    id = "open",
                    overline = if (role == SupportTrainViewerRole.RECIPIENT) "Dates still open" else "Open slots",
                    actionLabel = action,
                    rows = shown,
                    moreRows = open.drop(shown.size).map { slotRow(it, covered = false) },
                )
        }

        // The viewer's own signups are listed under "Your commitment". A slot only
        // they fill isn't repeated here, where it would read as someone else's.
        val mineCountBySlot = reservations.mapNotNull { it.slotId }.groupingBy { it }.eachCount()
        val covered =
            slots
                .filter { slot ->
                    val mine = mineCountBySlot[slot.id] ?: 0
                    slot.isCovered && (mine == 0 || (slot.filledCount ?: 0) > mine)
                }.sortedBy { it.slotDate ?: "" }
        if (covered.isNotEmpty()) {
            val mineIds = reservations.map { it.id }.toSet()
            val helpersBySlot =
                helperReservations.orEmpty()
                    .filter { it.id !in mineIds && it.status in setOf("reserved", "delivered", "confirmed") }
                    .groupBy { it.slotId }
            val rows =
                covered.flatMap { slot ->
                    helpersBySlot[slot.id]?.map { helperRow(it, slot, today, zone) }
                        ?: listOf(slotRow(slot, covered = true))
                }
            val shown = rows.take(4)
            val action = if (rows.size > shown.size) "See all ${rows.size}" else null
            out +=
                SlotSection(
                    id = "covered",
                    // The person the train is for sees who is coming (B2).
                    overline = if (role == SupportTrainViewerRole.RECIPIENT) "Who's coming" else "Already on the train",
                    actionLabel = action,
                    rows = shown,
                    moreRows = rows.drop(shown.size),
                )
        }
        return out
    }

    private fun slotRow(
        slot: SupportTrainSlotDto,
        covered: Boolean,
    ): SlotRowContent {
        val date = parseDate(slot.slotDate)
        val label = slot.slotLabel ?: slot.supportMode?.replaceFirstChar { it.uppercase() } ?: "a slot"
        return SlotRowContent(
            id = slot.id,
            dayLabel = date?.let { format(it, "EEE") } ?: "",
            dateLabel = date?.let { format(it, "d") } ?: "",
            state = if (covered) SlotRowState.Covered else SlotRowState.Open,
            // Detail endpoint omits the per-slot helper.
            author = null,
            title = if (covered) label else "Open · $label",
            subtitle = dropWindow(slot.endTime),
            mine = false,
            slotId = slot.id,
        )
    }

    private fun reservationRow(
        reservation: SupportTrainMyReservationDto,
        slot: SupportTrainSlotDto?,
        today: Date,
        zone: TimeZone,
    ): SlotRowContent {
        val date = slot?.let { parseDate(it.slotDate) }
        // "Home-cooked meal", not the wire value "Cook", when the helper named no dish.
        val title =
            reservation.dishTitle
                ?: reservation.restaurantName
                ?: reservation.contributionMode?.let { mode ->
                    SupportTrainContributionMode.entries.firstOrNull { it.wire == mode }?.label
                        ?: mode.replaceFirstChar { it.uppercase() }
                }
                ?: "Your contribution"
        return SlotRowContent(
            id = reservation.id,
            dayLabel = date?.let { format(it, "EEE") } ?: "",
            dateLabel = date?.let { format(it, "d") } ?: "",
            state = SlotRowState.Covered,
            author = SlotRowAuthor(initials = "YO", displayName = "You", tone = ContributorTone.Primary),
            title = title,
            subtitle = arrivalLabel(reservation.estimatedArrivalAt, zone) ?: reservation.noteToRecipient,
            mine = true,
            slotId = reservation.slotId,
            reservationId = reservation.id,
            reservationStatus = reservation.status,
            isBeforeSlotDay = date?.let { it.time > today.time } ?: false,
            slotDayLabel = date?.let { format(it, "EEE, MMM d") },
            signupChangeable = slot?.let { !isOver(it, today) } ?: true,
        )
    }

    private fun helperRow(
        reservation: SupportTrainReservationDto,
        slot: SupportTrainSlotDto,
        today: Date,
        zone: TimeZone,
    ): SlotRowContent {
        val contribution =
            SupportTrainMyReservationDto(
                id = reservation.id,
                slotId = reservation.slotId,
                status = reservation.status,
                contributionMode = reservation.contributionMode,
                dishTitle = reservation.dishTitle,
                restaurantName = reservation.restaurantName,
                estimatedArrivalAt = reservation.estimatedArrivalAt,
                noteToRecipient = reservation.noteToRecipient,
            )
        val status =
            when (reservation.status) {
                "delivered" -> "Delivered — awaiting confirmation"
                "confirmed" -> "Delivery confirmed"
                else -> null
            }
        return reservationRow(contribution, slot, today, zone).copy(
            mine = false,
            author = SlotRowAuthor(initials(reservation.displayName), reservation.displayName, ContributorTone.Personal),
            subtitle =
                listOfNotNull(status, arrivalLabel(reservation.estimatedArrivalAt, zone), reservation.noteToRecipient)
                    .joinToString(" · ").takeIf { it.isNotBlank() },
        )
    }

    private fun dropWindow(end: String?): String? {
        if (end.isNullOrEmpty()) return null
        return "Drop off by ${shortTime(end)}"
    }

    private fun dateRange(slots: List<SupportTrainSlotDto>): String {
        val dates = slots.mapNotNull { parseDate(it.slotDate) }
        val min = dates.minByOrNull { it.time } ?: return ""
        val max = dates.maxByOrNull { it.time } ?: return ""
        return "${format(min, "EEE MMM d")} → ${format(max, "EEE MMM d")}"
    }

    // Days until the last slot, from the train's own today. A closed Train has none left, whatever its last date.
    private fun daysLeft(
        slots: List<SupportTrainSlotDto>,
        status: String?,
        today: Date,
    ): Int {
        if (status == "completed" || status == "archived") return 0
        val max = slots.mapNotNull { parseDate(it.slotDate) }.maxByOrNull { it.time } ?: return 0
        val diff = ((max.time - today.time) / MILLIS_PER_DAY).toInt()
        return maxOf(0, diff)
    }

    /**
     * An arrival is an instant; it reads as the clock time where the train is (B4), which is where the helper drives
     * to. In UTC a 5:30 pm drop-off read 12:30 AM; in a traveling helper's zone it read their own clock.
     */
    fun arrivalLabel(
        iso: String?,
        zone: TimeZone,
    ): String? {
        if (iso.isNullOrBlank()) return null
        val instant = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull() ?: return null
        return SimpleDateFormat("h:mm a", Locale.US).apply { timeZone = zone }.format(Date.from(instant))
    }

    /** The train's zone, or the phone's when an older server sends none. */
    fun trainZone(id: String?): TimeZone =
        id?.takeIf { it.isNotBlank() }?.let { name -> TimeZone.getTimeZone(name).takeIf { it.id == name } } ?: TimeZone.getDefault()

    /** The train's today (`today` from the server) as that date at UTC midnight, how slot dates are read. */
    fun trainToday(dto: SupportTrainDetailDto): Date = parseDate(dto.today) ?: startOfTodayUtc()

    private fun shortTime(hhmm: String): String {
        val parsed =
            listOf("HH:mm:ss", "HH:mm").firstNotNullOfOrNull { pattern ->
                runCatching { utcFormatter(pattern).parse(hhmm) }.getOrNull()
            } ?: return hhmm
        return utcFormatter("h:mm a").format(parsed).lowercase(Locale.US)
    }

    private fun parseDate(value: String?): Date? {
        if (value == null) return null
        return runCatching { utcFormatter("yyyy-MM-dd").parse(value.take(10)) }.getOrNull()
    }

    private fun format(
        date: Date,
        pattern: String,
    ): String = utcFormatter(pattern).format(date)

    private fun utcFormatter(pattern: String): SimpleDateFormat =
        SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

    // Today as the person sees it (their own calendar day), as that date at UTC midnight, which is how slot dates are
    // read. A UTC "today" runs ahead of a US evening and marked the day's own slot as over.
    private fun startOfTodayUtc(): Date {
        val local = Calendar.getInstance()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH))
        return cal.time
    }

    // A slot whose date is before the train's today can't take a signup. One without a readable date is never over.
    private fun isOver(
        slot: SupportTrainSlotDto,
        today: Date,
    ): Boolean = slot.isPast ?: parseDate(slot.slotDate)?.let { it.time < today.time } ?: false

    private fun initials(name: String): String {
        val words = name.trim().split(" ").filter { it.isNotEmpty() }.take(2)
        val letters = words.mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")
        return letters.ifEmpty { "ST" }
    }
}

/** Stored dietary values are keys ("tree_nut_allergy"); helpers read "Tree nut allergy", as the web shows them. */
internal fun dietaryLabel(value: String): String = value.replace('_', ' ').trim().replaceFirstChar { it.uppercase() }
