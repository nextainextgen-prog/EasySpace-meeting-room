/**
 * Move Chanvit Soponsuk's recurring Tue/Wed/Thu 14:00-15:00 series
 * from MASTER ROOM to MEETING ROOM, keeping the same times and dates.
 *
 * Dry-run by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/move-chanvit-room.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const APPLY = process.argv.includes("--apply");
const MEMBER_ID = "0e0d320b-e89d-4071-8ff6-331e12097b6a";
const BKK_TZ = "Asia/Bangkok";
const TARGET_WEEKDAYS = new Set(["Tue", "Wed", "Thu"]);
const TARGET_TIME = "14:00";

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

async function main() {
  console.log(`mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN"}`);

  const { data: rooms, error: roomErr } = await supabase
    .from("rooms")
    .select("id, name, status, hourly_rate, capacity_min, capacity_max, buffer_minutes, allow_internal, service_days")
    .order("name");
  if (roomErr) throw roomErr;
  console.log("\nrooms:");
  for (const r of rooms ?? [])
    console.log(
      `  ${r.id}  ${r.name}  status=${r.status} rate=${r.hourly_rate} cap=${r.capacity_min}-${r.capacity_max} buffer=${r.buffer_minutes}m internal=${r.allow_internal}`,
    );

  const target = (rooms ?? []).find(
    (r) => String(r.name).trim().toUpperCase() === "MEETING ROOM",
  );
  if (!target) {
    console.error("✗ MEETING ROOM not found");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, room_id, starts_at, ends_at, booking_status, base_amount, total_amount, metadata, internal_title",
    )
    .eq("member_id", MEMBER_ID)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .order("starts_at");
  if (error) throw error;

  const series = (rows ?? []).filter((r) => {
    const s = bkk(r.starts_at as string);
    return TARGET_WEEKDAYS.has(s.weekday) && s.time === TARGET_TIME;
  });
  const untouched = (rows ?? []).filter((r) => !series.includes(r));

  console.log(`\nseries to move: ${series.length}`);
  console.log(`left alone (different time/day): ${untouched.length}`);
  for (const r of untouched) {
    const s = bkk(r.starts_at as string);
    console.log(`  keep ${r.reference_code} ${s.weekday} ${s.date} ${s.time}`);
  }

  // Conflict scan: anything already in MEETING ROOM overlapping these slots.
  // Conflicting rows stay in MASTER ROOM rather than blocking the whole move.
  const conflicts: string[] = [];
  const blocked = new Set<string>();
  for (const r of series) {
    const { data: clash } = await supabase
      .from("bookings")
      .select("id, reference_code, starts_at, internal_title")
      .eq("room_id", target.id as string)
      .in("booking_status", ["pending", "confirmed", "in_use"])
      .neq("id", r.id as string)
      .lt("starts_at", r.ends_at as string)
      .gt("ends_at", r.starts_at as string);
    if (clash && clash.length > 0) {
      blocked.add(r.id as string);
      const s = bkk(r.starts_at as string);
      conflicts.push(
        `${r.reference_code} ${s.weekday} ${s.date} ${s.time} ↔ ${clash
          .map((c) => `${c.reference_code}(${c.internal_title ?? "—"})`)
          .join(", ")}`,
      );
    }
  }

  console.log(`\nconflicts in MEETING ROOM (kept in MASTER ROOM): ${conflicts.length}`);
  for (const c of conflicts) console.log(`  ✗ ${c}`);

  const movable = series.filter((r) => !blocked.has(r.id as string));
  console.log(`movable: ${movable.length} / ${series.length}`);

  const googleSynced = series.filter(
    (r) => (r.metadata as Record<string, unknown> | null)?.google_event_id,
  ).length;
  console.log(`\nrows carrying a google_event_id: ${googleSynced}`);

  if (!APPLY) {
    console.log("\ndry-run only — re-run with --apply to write changes.");
    return;
  }

  let moved = 0;
  for (const r of movable) {
    const { error: upErr } = await supabase
      .from("bookings")
      .update({ room_id: target.id as string, updated_at: new Date().toISOString() })
      .eq("id", r.id as string);
    if (upErr) {
      console.log(`  ! ${r.reference_code} failed: ${upErr.message}`);
      continue;
    }
    await supabase.from("booking_audit_log").insert({
      booking_id: r.id,
      action: "updated",
      changes: {
        reason: "move series MASTER ROOM → MEETING ROOM (same date/time)",
        old_room_id: r.room_id,
        new_room_id: target.id,
      },
    } as never);
    moved += 1;
  }
  console.log(`\nmoved: ${moved}/${movable.length} (${conflicts.length} left in MASTER ROOM)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
