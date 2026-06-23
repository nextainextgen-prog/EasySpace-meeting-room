/**
 * Repair recurring-booking siblings for the Thunder organization.
 *
 * Background
 * ──────────
 * `createMemberBooking` used `Date.setHours()` to build each recurring
 * sibling's start time, which evaluates in the SERVER's local timezone.
 * On Vercel (UTC) this caused the sibling to be stored 7 hours before
 * the intended Bangkok time → the booking lands on the previous calendar
 * day in Bangkok (Thursday instead of Friday for an 08:30 BKK slot).
 *
 * Recovery
 * ────────
 * The first occurrence in each series is correct (built client-side in
 * Bangkok TZ). Every sibling row carries `metadata.recurrence_of =
 * <primary reference_code>`. For each sibling whose stored start
 * (interpreted in Bangkok) does not match the day-of-week of its primary,
 * shift starts_at and ends_at forward by exactly +17h — that compensates
 * both the +24h date jump and the −7h timezone offset, restoring the
 * intended Bangkok wall-clock time on the intended weekday.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   ORG_SHORT_NAME=td \
 *   npx tsx scripts/fix-thunder-recurring.ts [--apply]
 *
 * Defaults to dry-run; pass --apply to write changes.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORG_SHORT_NAME = process.env.ORG_SHORT_NAME ?? "td";
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const BKK_TZ = "Asia/Bangkok";
const SHIFT_MS = 17 * 60 * 60 * 1000;

function bkkParts(iso: string) {
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
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    time: `${get("hour")}:${get("minute")}`,
  };
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY (writes)" : "dry-run"}`);
  console.log(`org short_name: ${ORG_SHORT_NAME}`);

  // Resolve org by invite code → invite_links.code → invite_links.org_id.
  const { data: invite, error: invErr } = await supabase
    .from("invite_links")
    .select("code, org_id, org:organizations(id, name, short_name)")
    .eq("code", ORG_SHORT_NAME)
    .maybeSingle();
  if (invErr) throw invErr;
  let orgIds: string[] = [];
  if (invite?.org_id) {
    const org = (invite as unknown as { org?: { id: string; name: string; short_name: string | null } }).org;
    console.log(`  org via invite code: ${org?.name} (id=${invite.org_id}, short=${org?.short_name})`);
    orgIds = [invite.org_id as string];
  } else {
    // Fallback: look up by short_name (in case the user gave the short_name not invite code).
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name, short_name")
      .eq("short_name", ORG_SHORT_NAME);
    if (!orgs || orgs.length === 0) {
      console.error(`✗ no org found matching invite code or short_name = ${ORG_SHORT_NAME}`);
      process.exit(1);
    }
    for (const o of orgs) {
      console.log(`  org via short_name: ${o.name} (id=${o.id}, short=${o.short_name})`);
    }
    orgIds = orgs.map((o) => o.id as string);
  }

  // Pull all recurring bookings for those orgs.
  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, org_id, room_id, room:rooms(name), starts_at, ends_at, booking_status, is_recurring, recurrence_rule, metadata, internal_title",
    )
    .in("org_id", orgIds)
    .eq("is_recurring", true)
    .order("starts_at");
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log("nothing to inspect — no recurring bookings on this org.");
    return;
  }

  // Group by primary reference code.
  const primaries = new Map<string, typeof rows[number]>();
  const siblings: typeof rows = [];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const recurOf = typeof meta.recurrence_of === "string" ? (meta.recurrence_of as string) : null;
    if (recurOf) siblings.push(r);
    else primaries.set(r.reference_code as string, r);
  }
  console.log(`primaries: ${primaries.size}, siblings: ${siblings.length}`);

  let mismatchCount = 0;
  let appliedCount = 0;
  for (const s of siblings) {
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    const primaryRef = meta.recurrence_of as string;
    const primary = primaries.get(primaryRef);
    if (!primary) continue;

    const pStart = bkkParts(primary.starts_at as string);
    const sStart = bkkParts(s.starts_at as string);
    if (pStart.weekday === sStart.weekday && pStart.time === sStart.time) continue;

    mismatchCount += 1;
    const newStart = new Date(new Date(s.starts_at as string).getTime() + SHIFT_MS);
    const newEnd = new Date(new Date(s.ends_at as string).getTime() + SHIFT_MS);
    const fixedStart = bkkParts(newStart.toISOString());

    const room = (s.room as { name?: string } | null)?.name ?? "—";
    console.log(
      `[${s.reference_code}] ${room} | primary ${primary.reference_code} ${pStart.weekday} ${pStart.time}` +
        ` | sibling ${sStart.weekday} ${sStart.date} ${sStart.time} → ${fixedStart.weekday} ${fixedStart.date} ${fixedStart.time}`,
    );

    if (APPLY) {
      // Skip if the corrected slot already collides with another booking
      // (besides this very row).
      const { data: conflict } = await supabase
        .from("bookings")
        .select("id, reference_code")
        .eq("room_id", (s as { room_id?: string }).room_id ?? "")
        .in("booking_status", ["pending", "confirmed", "in_use"])
        .neq("id", s.id as string)
        .lt("starts_at", newEnd.toISOString())
        .gt("ends_at", newStart.toISOString());
      if (conflict && conflict.length > 0) {
        console.log(
          `   ! skipped: corrected slot conflicts with ${conflict.map((c) => c.reference_code).join(", ")}`,
        );
        continue;
      }

      const { error: upErr } = await supabase
        .from("bookings")
        .update({
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
        })
        .eq("id", s.id as string);
      if (upErr) {
        console.log(`   ! update failed: ${upErr.message}`);
        continue;
      }
      await supabase.from("booking_audit_log").insert({
        booking_id: s.id,
        action: "rescheduled",
        changes: {
          reason: "fix recurrence TZ bug",
          old_starts_at: s.starts_at,
          new_starts_at: newStart.toISOString(),
        },
      } as never);
      appliedCount += 1;
    }
  }

  console.log("");
  console.log(`siblings with weekday/time mismatch: ${mismatchCount}`);
  if (APPLY) console.log(`updates applied: ${appliedCount}`);
  else console.log("dry-run only — re-run with --apply to write changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
