"""Lambda handler for the daily briefing scheduler.

Triggered each minute by EventBridge.  Finds users whose morning or
evening briefing time falls within the current window, then calls the Node
backend to compose and send each briefing.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from src.config.secrets import get_briefing_secrets, BriefingSecrets
from src.discovery.timezone import valid_timezone

# Configure logging for Lambda (root logger must be set to INFO)
logging.basicConfig(level=logging.INFO, force=True)
# httpx logs every request URL at INFO, and Supabase filters carry full user
# ids; keep them out of CloudWatch.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("seeder.handlers.briefing")
log.setLevel(logging.INFO)

# Maximum users per invocation (safety cap)
MAX_USERS_PER_RUN = 100

# Bounded concurrency for /send calls so a full batch completes well inside one minute
# without overwhelming the Node backend.
MAX_CONCURRENT_SENDS = 10

# Supabase answers at most 1000 rows to one read, so preferences are read page by page.
PREFS_PAGE_SIZE = 1000

# Ids go in the request's URL. A uuid and its comma are 37 characters, so 100 stay under 4 KB,
# and with a morning and an evening row each, a batch can't reach the 1000-row limit.
DELIVERY_CHECK_BATCH_SIZE = 100

# Deliver at or after the preferred time, never before it.
WINDOW_MINUTES = 15

# HTTP timeout for calling the Node backend (seconds)
SEND_TIMEOUT_S = 30

# A backend release restarts the API: for some seconds nginx answers 502 or the
# connection drops. Both backend calls are safe to repeat (/timezones only reads;
# /send skips a briefing already composing or sent).
RESTART_STATUSES = frozenset({502, 503, 504})
RESTART_PAUSE_S = 10

# SQL filter matching users with at least one briefing slot enabled:
# daily_briefing_enabled = true OR evening_briefing_enabled IS NOT FALSE.
ENABLED_PREFS_OR_FILTER = (
    "daily_briefing_enabled.eq.true,"
    "evening_briefing_enabled.eq.true,"
    "evening_briefing_enabled.is.null"
)


class _RestartRetry:
    """Lets one backend call per run wait out a restart and try again.

    Once per run, so a real outage still fails the run and its alarm without
    stacking a pause onto every user. Shares a pooled httpx.Client across all
    /timezones and /send calls in the invocation.
    """

    def __init__(self, client: httpx.Client | None = None) -> None:
        self.used = False
        self._lock = threading.Lock()
        self._client = client

    def _claim_retry(self) -> bool:
        with self._lock:
            if self.used:
                return False
            self.used = True
            return True

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        post_fn = self._client.post if self._client is not None else httpx.post
        try:
            response = post_fn(url, **kwargs)
        except (httpx.NetworkError, httpx.RemoteProtocolError):
            if not self._claim_retry():
                raise
        else:
            if response.status_code not in RESTART_STATUSES or not self._claim_retry():
                return response
        log.warning("Backend unavailable, maybe restarting; trying again in %ds", RESTART_PAUSE_S)
        time.sleep(RESTART_PAUSE_S)
        return post_fn(url, **kwargs)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Briefing scheduler Lambda entry point. Triggered each minute by EventBridge."""
    try:
        result = _run(event, context)
    except Exception:
        log.exception("Briefing handler failed with unhandled exception")
        raise
    if result.get("error") or result.get("failed"):
        # Fail the invocation so the Lambda Errors metric and its alarm see it.
        # The next minute can retry failures inside the same local slot.
        raise RuntimeError(f"Briefing scheduler run failed: {result}")
    return result


def _run(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Core briefing scheduler logic."""
    start_ms = time.monotonic_ns() // 1_000_000
    try:
        secrets = get_briefing_secrets()
    except Exception:
        log.exception("Failed to load or validate briefing secrets")
        return {"error": "secrets_load_failed", "users_processed": 0}

    try:
        from supabase import create_client

        supabase = create_client(secrets.supabase_url, secrets.supabase_service_role_key)
    except Exception:
        log.exception("Failed to initialize Supabase client")
        return {"error": "supabase_init_failed", "users_processed": 0}

    pool_limits = httpx.Limits(
        max_connections=MAX_CONCURRENT_SENDS + 2,
        max_keepalive_connections=MAX_CONCURRENT_SENDS + 2,
    )
    with httpx.Client(timeout=SEND_TIMEOUT_S, limits=pool_limits) as http_client:
        retry = _RestartRetry(client=http_client)

        # Find eligible users (already prioritized closest-to-window-expiry first)
        eligible = _find_eligible_users(supabase, secrets=secrets, retry=retry)
        log.info("Briefing scheduler: %d eligible users found", len(eligible))

        deferred = 0
        if len(eligible) > MAX_USERS_PER_RUN:
            deferred = len(eligible) - MAX_USERS_PER_RUN
            log.error(
                "Briefing scheduler capacity cap reached: %d eligible users exceeds cap of %d; "
                "%d due users remain unserved this minute (processing closest-to-expiry first)",
                len(eligible),
                MAX_USERS_PER_RUN,
                deferred,
            )
            eligible = eligible[:MAX_USERS_PER_RUN]

        stats = {
            "eligible": len(eligible),
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "deferred": deferred,
        }

        def _deliver(user: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
            result = _process_user(
                user["user_id"],
                secrets,
                briefing_kind=user.get("briefing_kind", "morning"),
                retry=retry,
            )
            return user, result

        if len(eligible) <= 1:
            for user in eligible:
                try:
                    _, result = _deliver(user)
                    _record_delivery_outcome(stats, user, result)
                except Exception:
                    log.exception("Briefing failed for user=%s", user["user_id"][:8])
                    stats["failed"] += 1
        else:
            workers = min(MAX_CONCURRENT_SENDS, len(eligible))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_to_user = {executor.submit(_deliver, user): user for user in eligible}
                for future in as_completed(future_to_user):
                    user = future_to_user[future]
                    try:
                        _, result = future.result()
                        _record_delivery_outcome(stats, user, result)
                    except Exception:
                        log.exception("Briefing failed for user=%s", user["user_id"][:8])
                        stats["failed"] += 1

    elapsed_ms = time.monotonic_ns() // 1_000_000 - start_ms
    stats["latency_ms"] = elapsed_ms

    _publish_metrics(stats)

    log.info(
        "Briefing scheduler complete: eligible=%d sent=%d skipped=%d failed=%d deferred=%d latency=%dms",
        stats["eligible"],
        stats["sent"],
        stats["skipped"],
        stats["failed"],
        stats["deferred"],
        elapsed_ms,
    )

    return stats


def _record_delivery_outcome(stats: dict[str, int], user: dict[str, Any], result: dict[str, str]) -> None:
    outcome = result.get("outcome", "failed")
    if outcome == "sent":
        stats["sent"] += 1
    elif outcome == "skipped":
        stats["skipped"] += 1
    else:
        stats["failed"] += 1
    log.info(
        "Briefing user=%s outcome=%s reason=%s",
        user["user_id"][:8],
        outcome,
        result.get("reason") or result.get("error") or "",
    )


# ── Find eligible users ──────────────────────────────────────────


def _find_eligible_users(supabase, *, secrets=None, retry: _RestartRetry | None = None) -> list[dict[str, Any]]:
    """Find users whose morning/evening briefing window is now and not yet processed today.

    Results are ordered with users closest to the end of their delivery window first
    so that if MAX_USERS_PER_RUN caps a burst minute, expiring windows are served before
    freshly opened ones.
    """

    # 1. Fetch preference rows where at least one briefing slot is enabled
    try:
        prefs_rows: list[dict[str, Any]] = []
        while True:
            result = (
                supabase.table("UserNotificationPreferences")
                .select(
                    "user_id, daily_briefing_enabled, daily_briefing_time_local, "
                    "evening_briefing_enabled, evening_briefing_time_local, daily_briefing_timezone, "
                    "quiet_hours_start_local, quiet_hours_end_local"
                )
                .or_(ENABLED_PREFS_OR_FILTER)
                .order("user_id")
                .range(len(prefs_rows), len(prefs_rows) + PREFS_PAGE_SIZE - 1)
                .execute()
            )
            page = result.data or []
            prefs_rows.extend(page)
            if len(page) < PREFS_PAGE_SIZE:
                break
    except Exception:
        log.exception("Failed to query UserNotificationPreferences")
        raise

    log.info("Briefing: found %d preference rows", len(prefs_rows))
    if not prefs_rows:
        return []

    # 2. Batch idempotency check — get all deliveries for today (across timezones)
    user_ids_by_date: dict[str, list[str]] = {}  # local_date → the users whose date it is
    user_tz_map: dict[str, tuple[str, str]] = {}  # user_id → (local_date, local_time_hhmm)

    # The selected location wins over historical defaults or an old device
    # clock. Resolve every recipient through the backend's shared hierarchy.
    missing = [row["user_id"] for row in prefs_rows]
    resolved = {}
    if missing and secrets:
        post = retry.post if retry else httpx.post
        for offset in range(0, len(missing), 100):
            response = post(
                f"{secrets.pantopus_api_base_url}/api/internal/briefing/timezones",
                json={"userIds": missing[offset:offset + 100]},
                headers={"x-internal-api-key": secrets.internal_api_key},
                timeout=SEND_TIMEOUT_S,
            )
            response.raise_for_status()
            resolved.update(response.json().get("timezones", {}))
    for row in prefs_rows:
        tz_str = valid_timezone(resolved.get(row["user_id"]) if secrets else row.get("daily_briefing_timezone"))
        if not tz_str:
            continue
        row["daily_briefing_timezone"] = tz_str
        tz = ZoneInfo(tz_str)
        now_local = datetime.now(tz)
        local_date = now_local.strftime("%Y-%m-%d")
        local_time = now_local.strftime("%H:%M")
        user_ids_by_date.setdefault(local_date, []).append(row["user_id"])
        user_tz_map[row["user_id"]] = (local_date, local_time)

    # Query deliveries for each user's own local date, in batches
    # A failed attempt stays eligible only within this local date/time window.
    # Daily cleanup never retries it at an unrelated hour or on a later day.
    already_processed: set[tuple[str, str, str]] = set()
    try:
        for date_str, ids in user_ids_by_date.items():
            for offset in range(0, len(ids), DELIVERY_CHECK_BATCH_SIZE):
                result = (
                    supabase.table("DailyBriefingDelivery")
                    .select("user_id, briefing_kind, status")
                    .in_("user_id", ids[offset:offset + DELIVERY_CHECK_BATCH_SIZE])
                    .eq("briefing_date_local", date_str)
                    .in_("status", ["sent", "skipped", "composing"])
                    .execute()
                )
                for row in result.data or []:
                    already_processed.add((row["user_id"], row.get("briefing_kind") or "morning", date_str))
    except Exception:
        log.exception("Failed to batch-check DailyBriefingDelivery")
        raise

    # 3. Filter by time window, quiet hours, and idempotency
    scored_eligible: list[tuple[int, str, str, dict[str, Any]]] = []

    for row in prefs_rows:
        uid = row["user_id"]

        local_date, local_time = user_tz_map.get(uid, ("", ""))
        if not local_date:
            continue

        # Quiet hours check
        quiet_start = row.get("quiet_hours_start_local")
        quiet_end = row.get("quiet_hours_end_local")
        if quiet_start and quiet_end and _is_in_quiet_hours(local_time, quiet_start, quiet_end):
            continue

        slots: list[tuple[str, Any]] = []
        if row.get("daily_briefing_enabled") is True:
            slots.append(("morning", row.get("daily_briefing_time_local") or "07:30"))
        if row.get("evening_briefing_enabled") is not False:
            slots.append(("evening", row.get("evening_briefing_time_local") or "18:00"))

        for briefing_kind, briefing_time in slots:
            if (uid, briefing_kind, local_date) in already_processed:
                continue

            elapsed = _minutes_into_window(local_time, str(briefing_time), WINDOW_MINUTES)
            if elapsed is None:
                continue

            scored_eligible.append((
                -elapsed,  # Largest elapsed minutes (closest to window expiry) first
                uid,
                briefing_kind,
                {
                    "user_id": uid,
                    "timezone": row.get("daily_briefing_timezone"),
                    "briefing_kind": briefing_kind,
                },
            ))

    scored_eligible.sort(key=lambda entry: (entry[0], entry[1], entry[2]))
    return [entry[3] for entry in scored_eligible]


def _to_minutes(val) -> int | None:
    """Convert a time value (str like '07:00' or '07:00:00', or datetime.time) to minutes since midnight."""
    try:
        from datetime import time as dt_time

        if isinstance(val, dt_time):
            return val.hour * 60 + val.minute
        s = str(val).strip()
        parts = s.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError, TypeError):
        return None


def _minutes_into_window(current_hhmm, target_hhmm, window_min: int) -> int | None:
    """Return minutes elapsed since target_hhmm if inside [0, window_min), else None."""
    cur_mins = _to_minutes(current_hhmm)
    tgt_mins = _to_minutes(target_hhmm)
    if cur_mins is None or tgt_mins is None:
        log.warning(
            "Briefing window parse failed: current=%r target=%r",
            current_hhmm,
            target_hhmm,
        )
        return None
    diff = cur_mins - tgt_mins
    # Do not wrap a late-night slot into a different calendar day's briefing.
    if 0 <= diff < window_min:
        return diff
    return None


def _is_within_window(current_hhmm, target_hhmm, window_min: int) -> bool:
    """Check the delivery window after the preferred time.

    Accepts str ('07:00', '07:00:00'), or datetime.time objects.
    """
    return _minutes_into_window(current_hhmm, target_hhmm, window_min) is not None


def _is_in_quiet_hours(current_hhmm, start_hhmm, end_hhmm) -> bool:
    """Check if current time falls within quiet hours (handles overnight ranges)."""
    cur = _to_minutes(current_hhmm)
    start = _to_minutes(start_hhmm)
    end = _to_minutes(end_hhmm)
    if cur is None or start is None or end is None:
        return False
    if start > end:
        return cur >= start or cur < end
    return start <= cur < end


# ── Process single user ──────────────────────────────────────────


def _process_user(
    user_id: str,
    secrets: BriefingSecrets,
    briefing_kind: str = "morning",
    retry: _RestartRetry | None = None,
) -> dict[str, str]:
    """Call the Node backend to compose and send the briefing for one user."""
    url = f"{secrets.pantopus_api_base_url}/api/internal/briefing/send"

    try:
        response = (retry.post if retry else httpx.post)(
            url,
            json={"userId": user_id, "briefingKind": briefing_kind},
            headers={
                "Content-Type": "application/json",
                "x-internal-api-key": secrets.internal_api_key,
            },
            timeout=SEND_TIMEOUT_S,
        )

        if response.status_code != 200:
            log.warning(
                "Briefing API returned %d for user=%s: %s",
                response.status_code,
                user_id[:8],
                response.text[:200],
            )
            return {"outcome": "failed", "error": f"http_{response.status_code}"}

        data = response.json()
        status = data.get("status", "failed")

        if status == "sent":
            return {"outcome": "sent"}
        elif status == "skipped":
            return {"outcome": "skipped", "reason": data.get("skip_reason", "unknown")}
        else:
            return {"outcome": "failed", "error": data.get("error", "unknown")}

    except httpx.TimeoutException:
        log.warning("Briefing API timeout for user=%s", user_id[:8])
        return {"outcome": "failed", "error": "timeout"}
    except Exception as exc:
        log.exception("Briefing API call failed for user=%s", user_id[:8])
        return {"outcome": "failed", "error": str(exc)}


# ── CloudWatch metrics ───────────────────────────────────────────


def _publish_metrics(stats: dict[str, int]) -> None:
    """Publish briefing metrics to CloudWatch."""
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return  # Local runs never write to CloudWatch.
    try:
        import boto3

        env = os.environ.get("ENVIRONMENT", "production")
        cw = boto3.client("cloudwatch")
        cw.put_metric_data(
            Namespace=f"Pantopus/Briefing/{env}",
            MetricData=[
                {"MetricName": "BriefingEligibleUsers", "Value": stats.get("eligible", 0), "Unit": "Count"},
                {"MetricName": "BriefingSent", "Value": stats.get("sent", 0), "Unit": "Count"},
                {"MetricName": "BriefingSkipped", "Value": stats.get("skipped", 0), "Unit": "Count"},
                {"MetricName": "BriefingFailed", "Value": stats.get("failed", 0), "Unit": "Count"},
                {"MetricName": "BriefingDeferred", "Value": stats.get("deferred", 0), "Unit": "Count"},
                {"MetricName": "BriefingLatencyMs", "Value": stats.get("latency_ms", 0), "Unit": "Milliseconds"},
            ],
        )
    except Exception:
        log.warning("Failed to publish CloudWatch briefing metrics", exc_info=True)
