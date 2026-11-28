"""Lambda handler for home bill/task/calendar reminder push notifications.

Triggered every 15 minutes; sends morning/evening reminders in the recipient’s timezone.
Queries HomeBill, HomeTask, and HomeCalendarEvent for items due soon,
then sends push notifications to household members via the Node backend.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from zoneinfo import ZoneInfo

import httpx

from src.config.secrets import get_briefing_secrets, BriefingSecrets
from src.utils.supabase_errors import (
    is_missing_table_error,
    is_unique_violation_error,
    log_missing_table_once,
)
from src.discovery.timezone import timezone_for_home, valid_timezone

logging.basicConfig(level=logging.INFO, force=True)
# httpx logs every request URL at INFO, and Supabase filters carry full user
# ids; keep them out of CloudWatch.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("seeder.handlers.home_reminders")

SEND_TIMEOUT_S = 15
PAGE_SIZE = 1000
IN_BATCH_SIZE = 100
# Reminder dedup keys combine prefix + two UUIDs + date/timestamp (~90-115 chars);
# 30 keys keep PostgREST .in_() URLs under 4 KB.
DEDUP_BATCH_SIZE = 30


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Home reminders Lambda entry point."""
    try:
        result = _run(event, context)
    except Exception:
        log.exception("Home reminders handler failed")
        raise
    if result.get("error") or result.get("errors"):
        # Fail the invocation so the Lambda Errors metric and its alarm see it.
        raise RuntimeError(f"Home reminders run failed: {result}")
    return result


def _run(event: dict[str, Any], context: Any) -> dict[str, Any]:
    start_ms = time.monotonic_ns() // 1_000_000
    try:
        secrets = get_briefing_secrets()
    except Exception:
        log.exception("Failed to load or validate briefing secrets")
        return {"error": "secrets_load_failed"}

    try:
        from supabase import create_client
        supabase = create_client(secrets.supabase_url, secrets.supabase_service_role_key)
    except Exception:
        log.exception("Failed to initialize Supabase client")
        return {"error": "supabase_init_failed"}

    stats = {"bills_notified": 0, "tasks_notified": 0, "calendar_notified": 0, "errors": 0}

    # Use one scheduled instant throughout the run. Eligibility is evaluated
    # for each recipient, never against the server's or Pacific time zone.
    now = datetime.fromisoformat(event["time"].replace("Z", "+00:00")) if event.get("time") else datetime.now(timezone.utc)
    if now.tzinfo is None:
        return {"error": "invalid_schedule_time"}

    home_zones_cache: dict[str, str | None] = {}
    user_zones_cache: dict[str, str | None] = {}

    with httpx.Client(timeout=SEND_TIMEOUT_S) as http_client:
        _process_bills_due(
            supabase, secrets, stats, now=now,
            http_client=http_client,
            home_zones_cache=home_zones_cache,
            user_zones_cache=user_zones_cache,
        )
        _process_tasks_due(
            supabase, secrets, stats, now=now,
            http_client=http_client,
            home_zones_cache=home_zones_cache,
            user_zones_cache=user_zones_cache,
        )
        _process_calendar_events(
            supabase, secrets, stats, now=now,
            http_client=http_client,
        )

    elapsed_ms = time.monotonic_ns() // 1_000_000 - start_ms
    stats["latency_ms"] = elapsed_ms

    _publish_metrics(stats)

    log.info(
        "Home reminders complete: bills=%d tasks=%d calendar=%d errors=%d latency=%dms",
        stats["bills_notified"], stats["tasks_notified"],
        stats["calendar_notified"], stats["errors"], elapsed_ms,
    )
    return stats


# ── Bills due today/tomorrow ────────────────────────────────────


def _process_bills_due(
    supabase,
    secrets: BriefingSecrets,
    stats: dict,
    *,
    now=None,
    http_client: httpx.Client | None = None,
    home_zones_cache: dict[str, str | None] | None = None,
    user_zones_cache: dict[str, str | None] | None = None,
) -> None:
    """Date-only bill deadlines stay calendar dates in the household's zone."""
    now = now or datetime.now(timezone.utc)
    min_due = (now - timedelta(days=1)).date().isoformat()
    max_due = (now + timedelta(days=2)).date().isoformat()

    try:
        bills = _paginate_query(
            lambda: (
                supabase.table("HomeBill")
                .select("id, home_id, bill_type, provider_name, amount, due_date, status")
                .neq("status", "paid")
                .gte("due_date", min_due)
                .lte("due_date", max_due)
                .order("id")
            )
        )
        if not bills:
            return
        home_ids = list(dict.fromkeys(bill["home_id"] for bill in bills if bill.get("home_id")))
        members = _get_home_members(supabase, home_ids)
        user_ids = list(dict.fromkeys(u for users in members.values() for u in users))
        home_zones, user_zones = _load_timezones(
            supabase, home_ids, user_ids, secrets,
            user_zones_cache,
            home_cache=home_zones_cache,
            http_client=http_client,
        )
    except Exception:
        log.exception("Failed to query bill reminder context")
        stats["errors"] += 1
        return

    candidates: list[dict[str, Any]] = []
    for bill in bills:
        for uid in members.get(bill["home_id"], []):
            tz = user_zones.get(uid) or home_zones.get(bill["home_id"])
            if not tz:
                continue
            local = now.astimezone(ZoneInfo(tz))
            if local.hour not in {7, 18}:
                continue
            home_local = now.astimezone(ZoneInfo(home_zones.get(bill["home_id"]) or tz))
            due_date = str(bill.get("due_date") or "")[:10]
            dates = {
                home_local.date().isoformat(): "today",
                (home_local.date() + timedelta(days=1)).isoformat(): "tomorrow",
            }
            when = dates.get(due_date)
            if not when:
                continue
            key = f"bill_{bill['id']}_{uid}_{local.date().isoformat()}"
            candidates.append({"bill": bill, "uid": uid, "when": when, "dedup_key": key})

    if not candidates:
        return

    already_sent = _get_already_sent_keys(supabase, [c["dedup_key"] for c in candidates])
    if already_sent is None:
        stats["errors"] += 1
        return

    for cand in candidates:
        key = cand["dedup_key"]
        if key in already_sent:
            continue

        claim = _claim_sent(supabase, key, 1)
        if claim == "duplicate":
            already_sent.add(key)
            continue
        if claim != "claimed":
            stats["errors"] += 1
            continue

        bill = cand["bill"]
        uid = cand["uid"]
        when = cand["when"]
        provider = bill.get("provider_name") or bill.get("bill_type") or "Bill"
        amount = bill.get("amount")
        amount_str = f"${float(amount):.0f} " if amount else ""
        result = _send_reminder(
            secrets, uid, f"Bill due {when}",
            f"Your {amount_str}{provider} bill is due {when}.",
            "bill_due",
            {"entityId": bill["id"], "route": f"/homes/{bill['home_id']}"},
            http_client=http_client,
        )
        if result == "sent":
            already_sent.add(key)
            stats["bills_notified"] += 1
        elif result in ("skipped", "failed"):
            if not _release_sent(supabase, key):
                stats["errors"] += 1


# ── Tasks due today ─────────────────────────────────────────────


def _process_tasks_due(
    supabase,
    secrets: BriefingSecrets,
    stats: dict,
    *,
    now=None,
    http_client: httpx.Client | None = None,
    home_zones_cache: dict[str, str | None] | None = None,
    user_zones_cache: dict[str, str | None] | None = None,
) -> None:
    """Deliver due-day tasks at 7 AM for each authorized recipient."""
    now = now or datetime.now(timezone.utc)
    # A UTC candidate window covers today's dates across recipient timezones;
    # exact local-hour gating runs before per-recipient access RPCs.
    window_start = (now - timedelta(days=1)).isoformat()
    window_end = (now + timedelta(days=1)).isoformat()

    try:
        tasks = _paginate_query(
            lambda: (
                supabase.table("HomeTask")
                .select("id, home_id, title, due_at, assigned_to, status, created_by, visibility")
                .filter("status", "not.in", '("done","canceled")')
                .gte("due_at", window_start)
                .lt("due_at", window_end)
                .order("id")
            )
        )
    except Exception:
        log.exception("Failed to query HomeTask")
        stats["errors"] += 1
        return

    active_tasks = [t for t in tasks if t.get("status") in {"open", "in_progress"}]
    if not active_tasks:
        return

    # Collect home_ids for tasks without assigned_to
    home_ids_needed = list(dict.fromkeys(
        t["home_id"] for t in active_tasks if not t.get("assigned_to") and t.get("home_id")
    ))
    try:
        members = _get_home_members(supabase, home_ids_needed) if home_ids_needed else {}
    except Exception:
        stats["errors"] += 1
        return

    task_targets: list[tuple[dict[str, Any], list[str]]] = []
    all_home_ids: list[str] = []
    all_user_ids: list[str] = []
    for task in active_tasks:
        # The creator may still be in a private setup. The existing record
        # projection validates that exception, rather than granting access
        # merely because an old task remembers a creator or assignee.
        targets = (
            [task["assigned_to"]]
            if task.get("assigned_to")
            else [task.get("created_by"), *members.get(task["home_id"], [])]
        )
        targets = list(dict.fromkeys(uid for uid in targets if uid))
        if not targets:
            continue
        task_targets.append((task, targets))
        if task.get("home_id"):
            all_home_ids.append(task["home_id"])
        all_user_ids.extend(targets)

    if not task_targets:
        return

    # Bulk-load Home rows and recipient timezones ONCE before iterating tasks.
    try:
        home_zones, timezones = _load_timezones(
            supabase,
            list(dict.fromkeys(all_home_ids)),
            list(dict.fromkeys(all_user_ids)),
            secrets,
            user_zones_cache,
            home_cache=home_zones_cache,
            http_client=http_client,
        )
    except Exception:
        log.warning("Task reminder timezone lookup failed", exc_info=True)
        stats["errors"] += 1
        return

    # Filter to recipients whose local clock is in the 7 AM hour BEFORE issuing
    # any per-recipient DB RPCs (home_record_recipient / get_home_records).
    due_window_candidates: list[dict[str, Any]] = []
    for task, targets in task_targets:
        for uid in targets:
            zone = timezones.get(uid) or home_zones.get(task["home_id"])
            if not zone:
                continue
            try:
                local_now = now.astimezone(ZoneInfo(zone))
            except Exception:
                log.warning("Invalid timezone %r for task reminder", zone)
                continue
            if local_now.hour != 7:
                continue
            local_date = local_now.strftime("%Y-%m-%d")
            dedup_key = f"task_{task['id']}_{uid}_{local_date}"
            due_window_candidates.append({
                "task": task,
                "uid": uid,
                "zone": zone,
                "local_now": local_now,
                "dedup_key": dedup_key,
            })

    if not due_window_candidates:
        return

    already_sent = _get_already_sent_keys(supabase, [c["dedup_key"] for c in due_window_candidates])
    if already_sent is None:
        stats["errors"] += 1
        return

    for cand in due_window_candidates:
        dedup_key = cand["dedup_key"]
        if dedup_key in already_sent:
            continue

        task = cand["task"]
        uid = cand["uid"]
        zone = cand["zone"]
        local_now = cand["local_now"]

        try:
            if uid != task.get("created_by"):
                eligible = supabase.rpc("home_record_recipient", {
                    "p_home_id": task["home_id"], "p_user_id": uid,
                    "p_kind": "task", "p_visibility": task.get("visibility"),
                }).execute().data
                if eligible is not True:
                    continue
            # Reuse the actual task read contract, including source-mail
            # access, private setup, current permissions and finished state.
            projection = supabase.rpc("get_home_records", {
                "p_home_id": task["home_id"], "p_actor_id": uid, "p_kind": "task",
                "p_record_id": task["id"], "p_start_after": None,
                "p_start_before": None, "p_mail_only": False,
            }).execute().data
            rows = projection.get("records", []) if isinstance(projection, dict) and projection.get("ok") is True else []
            if len(rows) != 1:
                continue
            current = rows[0]
            if (
                current.get("id") != task["id"]
                or current.get("home_id") != task["home_id"]
                or current.get("status") not in {"open", "in_progress"}
                or current.get("assigned_to") != task.get("assigned_to")
            ):
                continue
            home_tz = ZoneInfo(home_zones.get(task["home_id"]) or zone)
            due = datetime.fromisoformat(current["due_at"].replace("Z", "+00:00"))
            if due.tzinfo is None or due.astimezone(home_tz).date() != local_now.date():
                continue
        except Exception:
            log.warning("Task reminder access/date check failed", exc_info=True)
            stats["errors"] += 1
            continue

        claim = _claim_sent(supabase, dedup_key, 1)
        if claim == "duplicate":
            already_sent.add(dedup_key)
            continue
        if claim != "claimed":
            stats["errors"] += 1
            continue

        reminder_data = {
            "entityId": task["id"],
            "taskId": task["id"], "homeId": task["home_id"],
            "link": f"/app/homes/{task['home_id']}/tasks/{task['id']}",
            "route": f"/app/homes/{task['home_id']}/tasks/{task['id']}",
        }
        # Assignees can complete without editing. Advertise only actions
        # explicitly allowed by this recipient's current task projection.
        capabilities = current.get("capabilities")
        if isinstance(capabilities, dict) and capabilities.get("can_complete") is True:
            if capabilities.get("can_edit") is True:
                reminder_data["category"] = "TASK_REMINDER"
            elif capabilities.get("can_edit") is False:
                reminder_data["category"] = "TASK_REMINDER_DONE_ONLY"

        result = _send_reminder(
            secrets, uid, "Task due today",
            f'"{current.get("title") or "Home task"}" is due today.',
            "task_due", reminder_data,
            http_client=http_client,
        )
        if result == "sent":
            already_sent.add(dedup_key)
            stats["tasks_notified"] += 1
        elif result in ("skipped", "failed"):
            if not _release_sent(supabase, dedup_key):
                stats["errors"] += 1


# ── Calendar events starting soon ───────────────────────────────


def _process_calendar_events(
    supabase,
    secrets: BriefingSecrets,
    stats: dict,
    *,
    now=None,
    http_client: httpx.Client | None = None,
) -> None:
    """Find upcoming events by instant, independent of any server timezone."""
    now = now or datetime.now(timezone.utc)
    now_iso = now.isoformat()
    two_hours = (now + timedelta(hours=2)).isoformat()

    try:
        events = _paginate_query(
            lambda: (
                supabase.table("HomeCalendarEvent")
                .select("id, home_id, title, start_at, event_type")
                .gte("start_at", now_iso)
                .lte("start_at", two_hours)
                .order("id")
            )
        )
    except Exception:
        log.exception("Failed to query HomeCalendarEvent")
        stats["errors"] += 1
        return

    if not events:
        return

    home_ids = list(dict.fromkeys(e["home_id"] for e in events if e.get("home_id")))
    try:
        members = _get_home_members(supabase, home_ids)
    except Exception:
        stats["errors"] += 1
        return

    candidates: list[dict[str, Any]] = []
    for event in events:
        event_title = event.get("title") or "Home event"
        start_at = event.get("start_at", "")
        # Calculate minutes until start
        try:
            start_dt = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
            mins = max(0, int((start_dt - now).total_seconds() / 60))
            time_str = f"in {mins} minutes" if mins < 60 else f"in about {mins // 60} hour{'s' if mins >= 120 else ''}"
        except Exception:
            time_str = "soon"

        title = "Upcoming event"
        body = f'"{event_title}" starts {time_str}.'

        for uid in members.get(event["home_id"], []):
            dedup_key = f"calendar_{event['id']}_{uid}_{start_at}"
            candidates.append({
                "event": event,
                "uid": uid,
                "title": title,
                "body": body,
                "dedup_key": dedup_key,
            })

    if not candidates:
        return

    already_sent = _get_already_sent_keys(supabase, [c["dedup_key"] for c in candidates])
    if already_sent is None:
        stats["errors"] += 1
        return

    for cand in candidates:
        dedup_key = cand["dedup_key"]
        if dedup_key in already_sent:
            continue

        claim = _claim_sent(supabase, dedup_key, 1)
        if claim == "duplicate":
            already_sent.add(dedup_key)
            continue
        if claim != "claimed":
            stats["errors"] += 1
            continue

        event = cand["event"]
        result = _send_reminder(
            secrets, cand["uid"], cand["title"], cand["body"], "calendar",
            {"entityId": event["id"], "route": f"/homes/{event['home_id']}"},
            http_client=http_client,
        )
        if result == "sent":
            already_sent.add(dedup_key)
            stats["calendar_notified"] += 1
        elif result in ("skipped", "failed"):
            if not _release_sent(supabase, dedup_key):
                stats["errors"] += 1


# ── Shared helpers ──────────────────────────────────────────────


def _paginate_query(build_query: Callable[[], Any], *, page_size: int = PAGE_SIZE) -> list[dict[str, Any]]:
    """Fetch all rows from a PostgREST query past the 1,000-row cap."""
    rows: list[dict[str, Any]] = []
    while True:
        result = build_query().range(len(rows), len(rows) + page_size - 1).execute()
        page = result.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
    return rows


def _load_timezones(
    supabase,
    home_ids: list[str],
    user_ids: list[str],
    secrets: BriefingSecrets,
    cache=None,
    *,
    home_cache: dict[str, str | None] | None = None,
    http_client: httpx.Client | None = None,
) -> tuple[dict, dict]:
    """Resolve the recipient's clock separately from each household's civil date."""
    home_zones = home_cache if home_cache is not None else {}
    missing_homes = [hid for hid in dict.fromkeys(home_ids) if hid and hid not in home_zones]
    for offset in range(0, len(missing_homes), IN_BATCH_SIZE):
        chunk = missing_homes[offset:offset + IN_BATCH_SIZE]
        homes = (
            supabase.table("Home")
            .select("id, map_center_lat, map_center_lng, location")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        found_ids: set[str] = set()
        for h in homes:
            home_zones[h["id"]] = timezone_for_home(h, None)
            found_ids.add(h["id"])
        for hid in chunk:
            if hid not in found_ids:
                home_zones[hid] = None

    zones = cache if cache is not None else {}
    missing_users = [uid for uid in dict.fromkeys(user_ids) if uid and uid not in zones]
    post = http_client.post if http_client is not None else httpx.post
    for offset in range(0, len(missing_users), IN_BATCH_SIZE):
        response = post(
            f"{secrets.pantopus_api_base_url}/api/internal/briefing/timezones",
            json={"userIds": missing_users[offset:offset + IN_BATCH_SIZE]},
            headers={"x-internal-api-key": secrets.internal_api_key},
            timeout=SEND_TIMEOUT_S,
        )
        response.raise_for_status()
        zones.update({uid: valid_timezone(zone) for uid, zone in response.json().get("timezones", {}).items()})
    return (home_zones, zones)


def _get_home_members(supabase, home_ids: list[str]) -> dict[str, list[str]]:
    """Get active household members for a list of home IDs (chunked and paginated)."""
    unique_home_ids = list(dict.fromkeys(hid for hid in home_ids if hid))
    if not unique_home_ids:
        return {}
    try:
        members: dict[str, list[str]] = {}
        for offset in range(0, len(unique_home_ids), IN_BATCH_SIZE):
            chunk = unique_home_ids[offset:offset + IN_BATCH_SIZE]
            rows = _paginate_query(
                lambda chunk=chunk: (
                    supabase.table("HomeOccupancy")
                    .select("home_id, user_id")
                    .in_("home_id", chunk)
                    .eq("is_active", True)
                    .order("home_id")
                    .order("user_id")
                )
            )
            for row in rows:
                hid = row["home_id"]
                members.setdefault(hid, []).append(row["user_id"])
        return members
    except Exception:
        log.exception("Failed to query HomeOccupancy for members")
        raise


def _get_already_sent_keys(supabase, dedup_keys: list[str]) -> set[str] | None:
    """Batch-check AlertNotificationHistory for reminder dedup keys.

    Returns the set of keys already recorded, or None on DB error so callers fail closed.
    """
    unique_keys = list(dict.fromkeys(k for k in dedup_keys if k))
    if not unique_keys:
        return set()
    try:
        sent_keys: set[str] = set()
        for offset in range(0, len(unique_keys), DEDUP_BATCH_SIZE):
            chunk = unique_keys[offset:offset + DEDUP_BATCH_SIZE]
            result = (
                supabase.table("AlertNotificationHistory")
                .select("alert_id")
                .eq("alert_type", "reminder")
                .in_("alert_id", chunk)
                .execute()
            )
            for row in result.data or []:
                if row.get("alert_id"):
                    sent_keys.add(row["alert_id"])
        return sent_keys
    except Exception as exc:
        if is_missing_table_error(exc, "AlertNotificationHistory"):
            log_missing_table_once(log, "AlertNotificationHistory", "home reminder dedup", exc)
        else:
            log.warning("Failed to batch-check reminder dedup history", exc_info=True)
        return None


def _claim_sent(supabase, dedup_key: str, users_notified: int) -> str:
    """Atomically claim a reminder dedup slot BEFORE sending push.

    Returns:
      'claimed'   — row inserted; caller owns delivery.
      'duplicate' — unique constraint violation (23505); another run already claimed it.
      'error'     — unexpected DB failure; caller must fail closed and surface error.
    """
    try:
        supabase.table("AlertNotificationHistory").insert({
            "alert_type": "reminder",
            "alert_id": dedup_key,
            "geohash": "global",
            "headline": dedup_key,
            "users_notified": users_notified,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        }).execute()
        return "claimed"
    except Exception as exc:
        if is_unique_violation_error(exc):
            log.info("Reminder dedup already claimed concurrently: %s", dedup_key[:40])
            return "duplicate"
        if is_missing_table_error(exc, "AlertNotificationHistory"):
            log_missing_table_once(log, "AlertNotificationHistory", "home reminder dedup writes", exc)
        else:
            log.warning("Failed to claim reminder dedup", exc_info=True)
        return "error"


def _release_sent(supabase, dedup_key: str) -> bool:
    """Delete a pre-claimed dedup slot after a definite non-send (skipped/failed)."""
    try:
        (
            supabase.table("AlertNotificationHistory")
            .delete()
            .eq("alert_type", "reminder")
            .eq("alert_id", dedup_key)
            .eq("geohash", "global")
            .execute()
        )
        return True
    except Exception as exc:
        if is_missing_table_error(exc, "AlertNotificationHistory"):
            log_missing_table_once(log, "AlertNotificationHistory", "home reminder dedup release", exc)
        else:
            log.warning("Failed to release reminder dedup claim", exc_info=True)
        return False


def _send_reminder(
    secrets: BriefingSecrets,
    user_id: str,
    title: str,
    body: str,
    reminder_type: str,
    data: dict,
    *,
    http_client: httpx.Client | None = None,
) -> str:
    """Call Node backend to send a reminder push.

    Returns 'sent', 'skipped', 'failed' (definite non-send), or 'uncertain'
    (ambiguous timeout/transport error where delivery may have occurred).
    """
    post = http_client.post if http_client is not None else httpx.post
    try:
        url = f"{secrets.pantopus_api_base_url}/api/internal/briefing/reminder-push"
        resp = post(
            url,
            json={
                "userId": user_id,
                "title": title,
                "body": body,
                "reminderType": reminder_type,
                "data": data,
            },
            headers={
                "Content-Type": "application/json",
                "x-internal-api-key": secrets.internal_api_key,
            },
            timeout=SEND_TIMEOUT_S,
        )
        if resp.status_code == 200:
            try:
                return resp.json().get("status", "failed")
            except Exception:
                log.warning("Reminder push returned 200 with invalid JSON for user=%s", user_id[:8], exc_info=True)
                return "uncertain"
        if resp.status_code == 504:
            log.warning("Reminder push gateway timeout (504) for user=%s", user_id[:8])
            return "uncertain"
        return "failed"
    except (httpx.TimeoutException, httpx.ReadError, httpx.RemoteProtocolError):
        log.warning("Reminder push ambiguous transport failure for user=%s", user_id[:8], exc_info=True)
        return "uncertain"
    except Exception:
        log.warning("Reminder push failed for user=%s", user_id[:8], exc_info=True)
        return "failed"


def _publish_metrics(stats: dict) -> None:
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return  # Local runs never write to CloudWatch.
    try:
        import boto3
        env = os.environ.get("ENVIRONMENT", "production")
        cw = boto3.client("cloudwatch")
        cw.put_metric_data(
            Namespace=f"Pantopus/Reminders/{env}",
            MetricData=[
                {"MetricName": "BillsNotified", "Value": stats.get("bills_notified", 0), "Unit": "Count"},
                {"MetricName": "TasksNotified", "Value": stats.get("tasks_notified", 0), "Unit": "Count"},
                {"MetricName": "CalendarNotified", "Value": stats.get("calendar_notified", 0), "Unit": "Count"},
                {"MetricName": "ReminderErrors", "Value": stats.get("errors", 0), "Unit": "Count"},
                {"MetricName": "ReminderLatencyMs", "Value": stats.get("latency_ms", 0), "Unit": "Milliseconds"},
            ],
        )
    except Exception:
        log.warning("Failed to publish reminder metrics", exc_info=True)
