/**
 * Move the BoostSMS meetings from Wednesday 14:00-15:00 to Tuesday 15:00-16:00
 * (Asia/Bangkok), keeping the same room and the same week.
 *
 * Scope: every booking whose internal_title mentions "BoostSMS" and that still
 * lies in the future. Past occurrences are left alone — they already happened,
 * and their Tuesday slot is behind us. Pass --include-past to move those too.
 *
 * A row is skipped when its target slot already holds another booking in the
 * same room; the scan mirrors the app's own overlap rule (starts_at < newEnd
 * AND ends_at > newStart over pending/confirmed/in_use).
 *
 * Dry-run by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/move-boostsms-to-tuesday.ts [--apply] [--include-past]
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const APPLY = process.argv.includes("--apply");
const INCLUDE_PAST = process.argv.includes("--include-past");

const BKK_TZ = "Asia/Bangkok";
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Target: Tuesday 15:00-16:00 Bangkok. */
const TARGET_WEEKDAY = 2; // 1=Mon … 7=Sun
const TARGET_HOUR_BKK = 15;
const TARGET_MINUTE_BKK = 0;
const TARGET_DURATION_MIN = 60;

/** Titles that are meetings we reschedule; the video shoot is not one. */
const MEETING_TITLE = /boostsms/i;

function bkk(iso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BKK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = fmt.formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    weekday: g("weekday"),
    time: `${g("hour")}:${g("minute")}`,
  };
}

/** ISO weekday (1=Mon … 7=Sun) of an instant, read in Bangkok. */
function bkkWeekday(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + BKK_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

/**
 * The Tuesday of the same Bangkok week (Mon-Sun) at 15:00, as a UTC instant.
 * Bangkok has no DST, so a fixed +07:00 offset is exact.
 */
function targetSlot(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + BKK_OFFSET_MS);
  const delta = TARGET_WEEKDAY - bkkWeekday(iso);
  const day = new Date(shifted.getTime() + delta * DAY_MS);
  const startUtcMs =
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      TARGET_HOUR_BKK,
      TARGET_MINUTE_BKK,
    ) - BKK_OFFSET_MS;
  return {
    starts_at: new Date(startUtcMs).toISOString(),
    ends_at: new Date(startUtcMs + TARGET_DURATION_MIN * 60_000).toISOString(),
  };
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN"}`);
  const now = new Date();
  console.log(`now: ${now.toISOString()} (${bkk(now.toISOString()).weekday} ${bkk(now.toISOString()).date} ${bkk(now.toISOString()).time} BKK)`);

  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, room_id, room:rooms(name), starts_at, ends_at, booking_status, internal_title, metadata",
    )
    .ilike("internal_title", "%boostsms%")
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .order("starts_at");
  if (error) throw error;

  const all = rows ?? [];
  console.log(`\nBoostSMS bookings (active): ${all.length}`);

  const skipped: string[] = [];
  const candidates = all.filter((r) => {
    const s = bkk(r.starts_at as string);
    if (!MEETING_TITLE.test(String(r.internal_title ?? ""))) {
      skipped.push(`  – ${r.reference_code} ${s.weekday} ${s.date} ${s.time} "${r.internal_title}" (not a BoostSMS meeting)`);
      return false;
    }
    const t = targetSlot(r.starts_at as string);
    const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
    if (same(t.starts_at, r.starts_at as string) && same(t.ends_at, r.ends_at as string)) {
      skipped.push(`  – ${r.reference_code} ${s.weekday} ${s.date} ${s.time} (already on target slot)`);
      return false;
    }
    if (!INCLUDE_PAST && new Date(t.starts_at) < now) {
      skipped.push(`  – ${r.reference_code} ${s.weekday} ${s.date} ${s.time} "${r.internal_title}" (target Tuesday already past)`);
      return false;
    }
    return true;
  });

  console.log(`\nleft alone: ${skipped.length}`);
  for (const line of skipped) console.log(line);

  console.log(`\nto reschedule: ${candidates.length}`);

  let moved = 0;
  const blocked: string[] = [];
  for (const r of candidates) {
    const from = bkk(r.starts_at as string);
    const t = targetSlot(r.starts_at as string);
    const to = bkk(t.starts_at);
    const toEnd = bkk(t.ends_at);

    const { data: clash, error: clashErr } = await supabase
      .from("bookings")
      .select("id, reference_code, internal_title")
      .eq("room_id", r.room_id as string)
      .in("booking_status", ["pending", "confirmed", "in_use"])
      .neq("id", r.id as string)
      .lt("starts_at", t.ends_at)
      .gt("ends_at", t.starts_at);
    if (clashErr) throw clashErr;

    const label =
      `${r.reference_code} ${(r.room as { name?: string } | null)?.name ?? "—"} | ` +
      `${from.weekday} ${from.date} ${from.time} → ${to.weekday} ${to.date} ${to.time}-${toEnd.time}`;

    if (clash && clash.length > 0) {
      blocked.push(
        `${label}  ✗ blocked by ${clash.map((c) => `${c.reference_code}(${c.internal_title ?? "—"})`).join(", ")}`,
      );
      continue;
    }

    console.log(`  ${label}`);
    if (!APPLY) continue;

    const { error: upErr } = await supabase
      .from("bookings")
      .update({
        starts_at: t.starts_at,
        ends_at: t.ends_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id as string);
    if (upErr) {
      console.log(`    ! update failed: ${upErr.message}`);
      continue;
    }
    await supabase.from("booking_audit_log").insert({
      booking_id: r.id,
      action: "rescheduled",
      reason: "ย้ายประชุม BoostSMS ไปวันอังคาร 15:00-16:00",
      changes: {
        old_starts_at: r.starts_at,
        old_ends_at: r.ends_at,
        new_starts_at: t.starts_at,
        new_ends_at: t.ends_at,
      },
    } as never);
    moved += 1;
  }

  console.log(`\nblocked by an existing booking: ${blocked.length}`);
  for (const b of blocked) console.log(`  ${b}`);

  // Keep the series template in step so future edits regenerate at 15:00.
  const primaries = all.filter(
    (r) =>
      MEETING_TITLE.test(String(r.internal_title ?? "")) &&
      (r.metadata as Record<string, unknown> | null)?.recurrence,
  );
  for (const p of primaries) {
    const meta = { ...(p.metadata as Record<string, unknown>) };
    const rec = { ...(meta.recurrence as Record<string, unknown>) };
    if (rec.startHour === TARGET_HOUR_BKK && rec.startMinute === TARGET_MINUTE_BKK) continue;
    console.log(
      `\nseries template ${p.reference_code}: recurrence.startHour ${rec.startHour}:${String(rec.startMinute).padStart(2, "0")} → ${TARGET_HOUR_BKK}:${String(TARGET_MINUTE_BKK).padStart(2, "0")}`,
    );
    if (!APPLY) continue;
    rec.startHour = TARGET_HOUR_BKK;
    rec.startMinute = TARGET_MINUTE_BKK;
    meta.recurrence = rec;
    const { error: mErr } = await supabase
      .from("bookings")
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq("id", p.id as string);
    if (mErr) console.log(`  ! metadata update failed: ${mErr.message}`);
  }

  if (!APPLY) {
    console.log("\ndry-run only — re-run with --apply to write changes.");
    return;
  }
  console.log(`\nrescheduled: ${moved}/${candidates.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
