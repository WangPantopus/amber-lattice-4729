package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Plans invitations (founder decision, October 31): a host invites people on Pantopus, by email, or with a one-person
 * link they text. An invitation is the host's yes: the person says "I'm in" with the ordinary ask and is in, with no
 * distance or approval step. An email invitation opened by an account the address isn't verified for waits for the
 * host's yes (`needs_host_ok`).
 *
 * Route: backend/routes/plans.js (the invitation routes), the service backend/services/plans/planInvites.js. The same
 * shapes as iOS's PlanInviteDTOs.swift.
 */

/** `my_invite` on a plan card: the viewer's own invitation. */
@JsonClass(generateAdapter = true)
data class PlanMyInviteDto(
    @Json(name = "id") val id: String,
    /** `pending`, `accepted`, `declined` (or `cancelled`); `maybe` with `guests=1` (Plans for the holidays). */
    @Json(name = "status") val status: String = "pending",
    /** `account`, `email` or `link`. */
    @Json(name = "channel") val channel: String = "account",
    /** The host says yes first (an email opened by an account it wasn't sent to). */
    @Json(name = "needs_host_ok") val needsHostOk: Boolean = false,
    @Json(name = "invited_at") val invitedAt: String? = null,
    /**
     * How it came (Plans for the holidays, contract 6.9, with `guests=1`): `account`, `email`, `link` or `open`, the
     * plan's one link for everyone, claimed in the app.
     */
    @Json(name = "via") val via: String? = null,
) {
    /** Not answered, "Maybe" (Plans for the holidays) or "Can't make it": the person can still change their mind. */
    val isOpen: Boolean get() = status == "pending" || status == "declined" || status == "maybe"
}

/** `invites` on a hosted plan's card: whether the host can invite now, and how it stands. */
@JsonClass(generateAdapter = true)
data class PlanHostInvitesDto(
    @Json(name = "can_invite") val canInvite: Boolean = false,
    @Json(name = "invited") val invited: Int = 0,
    @Json(name = "said_yes") val saidYes: Int = 0,
    @Json(name = "cant_make_it") val cantMakeIt: Int = 0,
)

/** Someone named on an invitation or in the people list. */
@JsonClass(generateAdapter = true)
data class PlanInvitePersonDto(
    @Json(name = "user_id") val userId: String,
    @Json(name = "display_name") val displayName: String = "",
    @Json(name = "avatar_url") val avatarUrl: String? = null,
)

/**
 * One invitation in the host's list. [state] is `invited`, `opened`, `in`, `waitlisted`, `asked` (an email opened by
 * someone else, waiting for the host's yes), `cant_make_it` or `left`. An email invitation shows the address until
 * the person says they're in.
 */
@JsonClass(generateAdapter = true)
data class PlanInviteRowDto(
    @Json(name = "id") val id: String,
    @Json(name = "channel") val channel: String = "account",
    @Json(name = "state") val state: String = "invited",
    @Json(name = "person") val person: PlanInvitePersonDto? = null,
    @Json(name = "email") val email: String? = null,
    /** The email couldn't be sent (the address said no to invitation emails, or it bounced). */
    @Json(name = "email_failed") val emailFailed: Boolean = false,
    @Json(name = "request_id") val requestId: String? = null,
    @Json(name = "can_cancel") val canCancel: Boolean = false,
    @Json(name = "invited_at") val invitedAt: String? = null,
    /**
     * Plans for the holidays (contract 6.4, with `guests=1`): a guest who answered without an account, with the name
     * they typed and how many adults and kids. Never their email.
     */
    @Json(name = "guest") val guest: PlanInviteGuestDto? = null,
    /** A guest from the open link waits for the host's yes (`state` `waiting_ok`): "Let in" shows. */
    @Json(name = "can_ok") val canOk: Boolean = false,
    /** How the invitation came (contract 6.9): its channel; `open` for the plan's one link, by a guest or an account. */
    @Json(name = "via") val via: String? = null,
    /** An account with an ask: how many adults and kids it brings (contract 6.9). Guests carry theirs in [guest]. */
    @Json(name = "party") val party: PlanInvitePartyDto? = null,
) {
    /** An account that came by the open link and waits for the host's yes on its ask (contract 6.9, A5). */
    val isLinkAccountWaiting: Boolean get() = via == "open" && person != null && state == "asked" && requestId != null

    /** The name, the address, or "Text invite". */
    val title: String get() = person?.displayName ?: guest?.name ?: email ?: "Text invite"
}

/** An account's party on the host's list (contract 6.9): adults, and kids only with kids welcome. */
@JsonClass(generateAdapter = true)
data class PlanInvitePartyDto(
    @Json(name = "adults") val adults: Int = 1,
    @Json(name = "kids") val kids: Int = 0,
)

/** A guest without an account on the host's list (contract 6.4). */
@JsonClass(generateAdapter = true)
data class PlanInviteGuestDto(
    @Json(name = "name") val name: String = "",
    @Json(name = "adults") val adults: Int = 1,
    @Json(name = "kids") val kids: Int = 0,
)

/** The open link on the host's list (contract 6.4): whether it is on, its address, and whether the host says yes first. */
@JsonClass(generateAdapter = true)
data class PlanOpenLinkDto(
    @Json(name = "on") val on: Boolean = false,
    @Json(name = "url") val url: String? = null,
    @Json(name = "host_says_yes_first") val hostSaysYesFirst: Boolean = false,
)

/** `POST /api/plans/:id/invites/open-link` (contract 6.4): make or return the link, or change "I say yes first". */
@JsonClass(generateAdapter = true)
data class PlanOpenLinkBody(
    @Json(name = "host_says_yes_first") val hostSaysYesFirst: Boolean? = null,
    @Json(name = "rotate") val rotate: Boolean? = null,
    /** At a home, the host agreed that people who are in see the address (as inviting asks). */
    @Json(name = "confirm_shares_address") val confirmSharesAddress: Boolean? = null,
)

/** The open link and the words to send with it, in the host's voice. */
@JsonClass(generateAdapter = true)
data class PlanOpenLinkResponse(
    @Json(name = "url") val url: String,
    @Json(name = "message") val message: String = "",
    @Json(name = "host_says_yes_first") val hostSaysYesFirst: Boolean = false,
)

/** `POST /api/plans/:id/invites/remind` (contract 6.4): how many were reminded, and how many had nobody to remind. */
@JsonClass(generateAdapter = true)
data class PlanRemindResponse(
    @Json(name = "reminded") val reminded: Int = 0,
    @Json(name = "skipped") val skipped: Int = 0,
)

/** How the host's invitations stand. */
@JsonClass(generateAdapter = true)
data class PlanInviteCountsDto(
    @Json(name = "invited") val invited: Int = 0,
    @Json(name = "in") val isIn: Int = 0,
    @Json(name = "waitlisted") val waitlisted: Int = 0,
    @Json(name = "cant_make_it") val cantMakeIt: Int = 0,
    // Plans for the holidays (contract 6.4, with `guests=1`), counted in people.
    @Json(name = "maybe") val maybe: Int = 0,
    @Json(name = "waiting_ok") val waitingOk: Int = 0,
    @Json(name = "no_answer") val noAnswer: Int = 0,
)

/** What happened to one person or address in `POST /invites`: invited, already_invited, already_in, unavailable, host. */
@JsonClass(generateAdapter = true)
data class PlanInviteResultDto(
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "email") val email: String? = null,
    @Json(name = "outcome") val outcome: String = "",
)

/** `GET /api/plans/:id/invites`, and the answer to inviting or taking one back. */
@JsonClass(generateAdapter = true)
data class PlanInviteListDto(
    @Json(name = "invites") val invites: List<PlanInviteRowDto> = emptyList(),
    /** Text invites nobody has opened yet (not listed one by one). */
    @Json(name = "unopened_links") val unopenedLinks: Int = 0,
    @Json(name = "counts") val counts: PlanInviteCountsDto? = null,
    @Json(name = "emails_left") val emailsLeft: Int? = null,
    @Json(name = "can_invite") val canInvite: Boolean = true,
    /** Only after inviting. */
    @Json(name = "results") val results: List<PlanInviteResultDto> = emptyList(),
    /** Plans for the holidays (contract 6.4): adults and kids coming, guests without an account included. */
    @Json(name = "headcount") val headcount: PlanHeadcountDto? = null,
    /** Plans for the holidays: the open link, when the plan can have one. */
    @Json(name = "open_link") val openLink: PlanOpenLinkDto? = null,
    /** Plans for the holidays: who a reminder would reach, and whether the plan was reminded today. */
    @Json(name = "remind") val remind: PlanRemindInfoDto? = null,
)

/** `remind` on the host's list (Plans for the holidays): how many "Remind" reaches, unopened text invites, today's. */
@JsonClass(generateAdapter = true)
data class PlanRemindInfoDto(
    @Json(name = "count") val count: Int = 0,
    @Json(name = "unopened_links") val unopenedLinks: Int = 0,
    @Json(name = "reminded_today") val remindedToday: Boolean = false,
)

/** Someone the host can invite: a connection, or someone who came to their plans. */
@JsonClass(generateAdapter = true)
data class PlanInviteCandidateDto(
    @Json(name = "user_id") val userId: String,
    @Json(name = "display_name") val displayName: String = "",
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    /** `connection`, `came_before` or `both`. */
    @Json(name = "reason") val reason: String? = null,
    /** `in`, `asked`, `invited`, or null while they can be invited. */
    @Json(name = "state") val state: String? = null,
)

/** `GET /api/plans/:id/invites/people`. */
@JsonClass(generateAdapter = true)
data class PlanInvitePeopleResponse(
    @Json(name = "people") val people: List<PlanInviteCandidateDto> = emptyList(),
)

/** `POST /api/plans/:id/invites`. */
@JsonClass(generateAdapter = true)
data class PlanInviteBody(
    @Json(name = "user_ids") val userIds: List<String>,
    @Json(name = "emails") val emails: List<String>,
    /** At a home, the host agreed that people who say they're in see the address. */
    @Json(name = "confirm_shares_address") val confirmSharesAddress: Boolean? = null,
)

/** `POST /api/plans/:id/invites/link`. */
@JsonClass(generateAdapter = true)
data class PlanInviteLinkBody(
    @Json(name = "confirm_shares_address") val confirmSharesAddress: Boolean? = null,
)

/** A one-person link and the words to send with it, in the host's voice. */
@JsonClass(generateAdapter = true)
data class PlanInviteLinkResponse(
    @Json(name = "invite_id") val inviteId: String? = null,
    @Json(name = "url") val url: String,
    @Json(name = "message") val message: String = "",
)

/** `POST /api/plans/:id/invites/claim`. */
@JsonClass(generateAdapter = true)
data class PlanInviteClaimBody(
    @Json(name = "token") val token: String? = null,
    /** The plan's one link for everyone (contract 6.9): the person answers it as themselves. */
    @Json(name = "open") val open: String? = null,
)

/** The plan as the person sees it now (claiming or declining an invitation). */
@JsonClass(generateAdapter = true)
data class PlanInvitePlanResponse(
    @Json(name = "plan") val plan: PlanDto? = null,
)

/** `GET /api/plans/invites/next`: the newest invitation the person hasn't opened. */
@JsonClass(generateAdapter = true)
data class PlanNextInviteResponse(
    @Json(name = "plan_id") val planId: String? = null,
)
