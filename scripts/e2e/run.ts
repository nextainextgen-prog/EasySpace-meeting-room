/**
 * End-to-end check of member self-service rescheduling, against the real
 * database and the real server actions.
 *
 * Auth, Telegram/e-mail dispatch and next/cache are swapped for the doubles in
 * this directory (see tsconfig.e2e.json) so the run needs no browser session
 * and never posts to the live Telegram group. Everything else — policy
 * loading, series resolution, conflict scanning, the writes, the audit trail —
 * is the production code path.
 *
 * It seeds its own fixtures in an empty far-future window of PRIME ROOM and
 * deletes them again in a finally block, including after a failure.
 *
 *   npm run test:reschedule
 */

import { createClient } from "@supabase/supabase-js";
import {
  previewMemberReschedule,
  applyMemberReschedule,
  getSeriesSummary,
} from "@/lib/actions/member-reschedule";
import { sent } from "@/lib/server/notifications";
import { revalidated } from "next/cache";
import { __setTier, __setSignedIn, TEST_MEMBER } from "@/lib/data/members";
import { fromBkk, bkkParts } from "@/lib/time/bkk";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const ROOM = "00000000-0000-0000-0000-000000000001"; // PRIME ROOM — empty in this window
const ORG = "591f26fd-4b8f-49a4-b40e-317b6aa03024";
const TAG = "E2E-RESCHED";
const TEST_CUSTOMER = "E2E ลูกค้าทดสอบ";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));
const at = (iso: string) => new Date(iso).getTime();

/** Five Wednesdays at 14:00, inside the 365-day booking horizon. */
const WEDS = ["2027-05-05", "2027-05-12", "2027-05-19", "2027-05-26", "2027-06-02"];
/** Their Tuesdays, which is where the move should land them. */
const TUES = ["2027-05-04", "2027-05-11", "2027-05-18", "2027-05-25", "2027-06-01"];

const series: string[] = [];
const obstacles: string[] = [];
let customerId: string | null = null;

async function insert(row: Record<string, unknown>) {
  const { data, error } = await sb.from("bookings").insert(row as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function seed() {
  for (let i = 0; i < WEDS.length; i++) {
    const s = fromBkk(WEDS[i], "14:00");
    series.push(
      await insert({
        reference_code: `${TAG}-${i}`, source: "internal", member_id: TEST_MEMBER.id,
        org_id: ORG, room_id: ROOM, starts_at: s.toISOString(),
        ends_at: new Date(s.getTime() + 3600_000).toISOString(),
        attendees_count: 4, base_amount: 0, addons_amount: 0, discount_amount: 0,
        total_amount: 0, deposit_amount: 0, paid_amount: 0,
        payment_status: "free", booking_status: "confirmed", free_reason: "e2e",
        internal_title: "E2E ประชุมทดสอบ", is_public: true,
        is_recurring: true, recurrence_rule: "weekly",
        metadata: i === 0
          ? { attendee_emails: [], recurrence: { rule: "weekly", count: 5, startHour: 14, startMinute: 0, durationMin: 60 } }
          : { attendee_emails: [], recurrence_of: `${TAG}-0` },
      }),
    );
  }

  const { data: cust } = await sb
    .from("customers")
    .insert({ display_name: TEST_CUSTOMER, type: "individual", source: "walk_in" } as never)
    .select("id").single();
  customerId = (cust as { id: string }).id;

  // Week 3's Tuesday: a customer who paid. The obstacle the feature exists for.
  const c = fromBkk(TUES[2], "15:00");
  obstacles.push(
    await insert({
      reference_code: `${TAG}-CUST`, source: "external", customer_id: customerId, room_id: ROOM,
      starts_at: c.toISOString(), ends_at: new Date(c.getTime() + 3600_000).toISOString(),
      attendees_count: 2, base_amount: 600, addons_amount: 0, discount_amount: 0,
      total_amount: 600, deposit_amount: 0, paid_amount: 600,
      payment_status: "paid", booking_status: "confirmed", is_public: false, is_recurring: false,
    }),
  );

  // Week 4's Tuesday: another booking the member owns themselves, outside this
  // series. A room still cannot hold two meetings at once.
  const own = fromBkk(TUES[3], "15:00");
  obstacles.push(
    await insert({
      reference_code: `${TAG}-OWN`, source: "internal", member_id: TEST_MEMBER.id, org_id: ORG,
      room_id: ROOM, starts_at: own.toISOString(), ends_at: new Date(own.getTime() + 3600_000).toISOString(),
      attendees_count: 2, base_amount: 0, addons_amount: 0, discount_amount: 0,
      total_amount: 0, deposit_amount: 0, paid_amount: 0,
      payment_status: "free", booking_status: "confirmed", free_reason: "e2e",
      internal_title: "E2E ประชุมอื่นของฉัน", is_public: true, is_recurring: false,
    }),
  );

  // Week 5's Tuesday: a customer immediately after the target slot, to exercise
  // the room's 15-minute turnaround buffer without actually overlapping.
  const adj = fromBkk(TUES[4], "16:00");
  obstacles.push(
    await insert({
      reference_code: `${TAG}-ADJ`, source: "external", customer_id: customerId, room_id: ROOM,
      starts_at: adj.toISOString(), ends_at: new Date(adj.getTime() + 3600_000).toISOString(),
      attendees_count: 2, base_amount: 600, addons_amount: 0, discount_amount: 0,
      total_amount: 600, deposit_amount: 0, paid_amount: 600,
      payment_status: "paid", booking_status: "confirmed", is_public: false, is_recurring: false,
    }),
  );
}

async function purge() {
  const { data } = await sb.from("bookings").select("id").like("reference_code", `${TAG}%`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await sb.from("booking_audit_log").delete().in("booking_id", ids);
    await sb.from("notifications").delete().in("related_id", ids);
    await sb.from("bookings").delete().in("id", ids);
  }
  await sb.from("customers").delete().eq("display_name", TEST_CUSTOMER);
}

async function read(id: string) {
  const { data } = await sb
    .from("bookings").select("starts_at, ends_at, metadata, room_id").eq("id", id).single();
  return data as { starts_at: string; ends_at: string; metadata: Record<string, unknown>; room_id: string };
}

async function main() {
  await purge();
  await seed();
  const anchor = series[0];
  console.log(`seeded: 5-occurrence series + 3 obstacles in PRIME ROOM\n`);

  console.log("— getSeriesSummary —");
  const sum = await getSeriesSummary(anchor);
  ok("recognises a series", sum?.isSeries === true);
  ok("counts 5 future occurrences", sum?.futureCount === 5, String(sum?.futureCount));
  ok("counts 5 following from the first", sum?.followingCount === 5, String(sum?.followingCount));

  console.log("\n— preview: พุธ 14:00 → อังคาร 15:00 (ทั้งซีรีส์) —");
  const base = {
    bookingId: anchor, scope: "following" as const, weekday: 2,
    startTime: "15:00", durationMin: 60, mode: "skip_conflicts" as const,
  };
  const p = await previewMemberReschedule(base);
  if (!("occurrences" in p)) { fail++; console.log("  FAIL preview errored:", p); return; }
  for (const o of p.occurrences) {
    console.log(`  ${o.status.padEnd(9)} ${o.from.label} → ${o.to.label}${o.note ? `   [${o.note}]` : ""}`);
  }
  ok("plans all 5 occurrences", p.occurrences.length === 5);
  ok("every target lands on Tuesday 15:00", p.occurrences.every((o) => {
    const t = bkkParts(o.to.startsAt);
    return t.weekday === 2 && t.time === "15:00";
  }));
  ok("targets are the Tuesday of each own week", p.occurrences.every((o, i) => bkkParts(o.to.startsAt).date === TUES[i]));
  ok("3 movable", p.summary.movable === 3, String(p.summary.movable));
  ok("2 blocked", p.summary.blocked === 2, String(p.summary.blocked));
  ok("1 warned (buffer)", p.summary.warned === 1, String(p.summary.warned));

  const w3 = p.occurrences[2];
  ok("week 3 blocked by the paying customer", w3.status === "blocked" && w3.conflicts[0]?.tier === "external_paid", `${w3.status}/${w3.conflicts[0]?.tier}`);
  ok("customer shown only as ลูกค้าภายนอก", w3.note === "ชนกับ ลูกค้าภายนอก", w3.note ?? "");
  ok("customer's real name never leaves the server", !JSON.stringify(p).includes(TEST_CUSTOMER));

  const w4 = p.occurrences[3];
  ok("week 4 blocked by the member's own other booking", w4.status === "blocked" && w4.conflicts[0]?.tier === "internal_self", `${w4.status}/${w4.conflicts[0]?.tier}`);
  ok("own booking is named back to them", w4.note?.includes("การจองของคุณ") === true, w4.note ?? "");

  const w5 = p.occurrences[4];
  ok("week 5 warns about the 15-minute buffer", w5.status === "warn" && w5.conflicts[0]?.tier === "buffer_touch", `${w5.status}/${w5.conflicts[0]?.tier}`);
  ok("a buffer warning does not block", w5.conflicts.every((c) => !c.blocking));

  console.log("\n— mode: all_or_nothing —");
  const aon = await applyMemberReschedule({ ...base, mode: "all_or_nothing", previewHash: p.previewHash });
  ok("refuses while anything is blocked", (aon as { error?: string }).error === "blocked_all_or_nothing");
  ok("and wrote nothing", at((await read(series[0])).starts_at) === at(fromBkk(WEDS[0], "14:00").toISOString()));

  console.log("\n— stale preview —");
  const stale = await applyMemberReschedule({ ...base, previewHash: "deadbeef" });
  ok("refuses a plan that no longer matches", (stale as { error?: string }).error === "plan_changed");
  ok("hands back a fresh plan", "preview" in (stale as object));
  ok("still wrote nothing", at((await read(series[0])).starts_at) === at(fromBkk(WEDS[0], "14:00").toISOString()));

  console.log("\n— apply (skip_conflicts) —");
  const res = await applyMemberReschedule({ ...base, previewHash: p.previewHash });
  if (!("moved" in res)) { fail++; console.log("  FAIL apply errored:", res); return; }
  ok("moved 3", res.moved === 3, String(res.moved));
  ok("skipped 2", res.skipped === 2, String(res.skipped));

  for (let i = 0; i < WEDS.length; i++) {
    const row = await read(series[i]);
    const g = bkkParts(row.starts_at);
    const shouldMove = i !== 2 && i !== 3;
    ok(
      shouldMove ? `week ${i + 1} is now อังคาร ${TUES[i]} 15:00` : `week ${i + 1} stayed on พุธ (blocked)`,
      shouldMove
        ? g.date === TUES[i] && g.time === "15:00" && at(row.ends_at) - at(row.starts_at) === 3600_000
        : g.date === WEDS[i] && g.time === "14:00",
      `${g.weekdayLabel} ${g.date} ${g.time}`,
    );
    ok(`week ${i + 1} stayed in the same room`, row.room_id === ROOM);
  }

  for (const id of obstacles) {
    const before = id === obstacles[0] ? fromBkk(TUES[2], "15:00") : id === obstacles[1] ? fromBkk(TUES[3], "15:00") : fromBkk(TUES[4], "16:00");
    ok("obstacle untouched", at((await read(id)).starts_at) === at(before.toISOString()));
  }

  const meta = (await read(series[0])).metadata;
  const rec = meta.recurrence as Record<string, unknown>;
  ok("series template moved to 15:00", rec?.startHour === 15 && rec?.startMinute === 0, JSON.stringify(rec));
  ok("recurrence definition survived the write", rec?.rule === "weekly" && rec?.count === 5);
  ok("sibling link survived the write", (await read(series[1])).metadata.recurrence_of === `${TAG}-0`);
  ok("alerts_sent reset for the time-alert cron", Array.isArray(meta.alerts_sent) && (meta.alerts_sent as unknown[]).length === 0);

  console.log("\n— audit & notifications —");
  const { data: audit } = await sb.from("booking_audit_log").select("action").in("booking_id", [...series, ...obstacles]);
  const rows = (audit ?? []) as Array<{ action: string }>;
  ok("one 'rescheduled' entry per moved row", rows.filter((a) => a.action === "rescheduled").length === 3, String(rows.filter((a) => a.action === "rescheduled").length));
  ok("one 'series_rescheduled' summary", rows.filter((a) => a.action === "series_rescheduled").length === 1);
  ok("exactly one Telegram message, not three", sent.filter((s) => s.kind.startsWith("telegram")).length === 1, String(sent.filter((s) => s.kind.startsWith("telegram")).length));
  ok("one in-app notification for admins", sent.filter((s) => s.kind === "in_app").length === 1);
  ok("revalidated member and admin views", revalidated.includes("/app/my-bookings") && revalidated.includes("/admin/calendar"));

  console.log("\n— re-running the same move —");
  const p2 = await previewMemberReschedule(base);
  if ("occurrences" in p2) {
    ok("the 3 moved rows now read 'unchanged'", p2.summary.unchanged === 3, String(p2.summary.unchanged));
    ok("the 2 obstacles still block", p2.summary.blocked === 2, String(p2.summary.blocked));
    ok("nothing left to move", p2.summary.movable === 0, String(p2.summary.movable));
  } else { fail++; console.log("  FAIL second preview errored"); }

  console.log("\n— scope: one —");
  const one = await previewMemberReschedule({ ...base, scope: "one", date: "2027-05-06", startTime: "09:00", durationMin: 90 });
  if ("occurrences" in one) {
    ok("touches a single occurrence", one.occurrences.length === 1);
    ok("uses the explicit date and time", one.occurrences[0].to.startsAt === fromBkk("2027-05-06", "09:00").toISOString());
    ok("uses the explicit duration", at(one.occurrences[0].to.endsAt) - at(one.occurrences[0].to.startsAt) === 90 * 60_000);
  } else { fail++; console.log("  FAIL scope-one preview errored"); }

  console.log("\n— guards —");
  __setSignedIn(false);
  ok("signed-out is refused", (await previewMemberReschedule(base) as { error?: string }).error === "auth_required");
  __setSignedIn(true);
  __setTier("guest");
  ok("guest tier is refused", (await previewMemberReschedule(base) as { error?: string }).error === "tier_not_allowed");
  __setTier("member");
  const { data: foreign } = await sb.from("bookings").select("id").neq("member_id", TEST_MEMBER.id).not("member_id", "is", null).limit(1);
  const otherId = (foreign as Array<{ id: string }>)?.[0]?.id;
  if (otherId) ok("someone else's booking is refused", (await previewMemberReschedule({ ...base, bookingId: otherId }) as { error?: string }).error === "not_owner");
  ok("room change is refused by default", (await previewMemberReschedule({ ...base, roomId: "00000000-0000-0000-0000-000000000002" }) as { error?: string }).error === "room_change_not_allowed");
  ok("invalid time is rejected", (await previewMemberReschedule({ ...base, startTime: "25:00" }) as { error?: string }).error === "validation");
  ok("a past target is refused", (await previewMemberReschedule({ ...base, scope: "one", date: "2020-01-01" }) as { occurrences?: Array<{ status: string }> }).occurrences?.[0]?.status === "blocked");

  console.log(`\n${pass} passed, ${fail} failed`);
}

main()
  .catch((e) => { fail++; console.error("\nRUN ERROR:", e); })
  .finally(async () => {
    await purge();
    const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).like("reference_code", `${TAG}%`);
    console.log(`cleanup: ${count ?? 0} test rows left behind (want 0)`);
    process.exit(fail ? 1 : 0);
  });
