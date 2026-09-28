/**
 * Checks for the pure half of member rescheduling — the date, weekday and
 * timezone arithmetic behind `planMoves`, plus the guards that stop a move
 * before the room is ever consulted.
 *
 * No database, no auth: it exercises the same module the server action uses.
 *
 *   npx tsx --env-file=.env.local scripts/test-reschedule-plan.ts
 */

import { planMoves, slotLabel, hashPlan, type OccurrenceRow, type PlanTarget } from "@/lib/server/reschedule-plan";
import { DEFAULT_RESCHEDULE_POLICY } from "@/lib/policy/member-reschedule";
import { bkkParts, fromBkk } from "@/lib/time/bkk";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

function row(id: string, startBkkDate: string, time = "14:00", durMin = 60): OccurrenceRow {
  const s = fromBkk(startBkkDate, time);
  return {
    id, reference_code: id, room_id: "R1", member_id: "M1", org_id: "O1",
    starts_at: s.toISOString(),
    ends_at: new Date(s.getTime() + durMin * 60000).toISOString(),
    booking_status: "confirmed", internal_title: "ประชุม", metadata: {}, is_recurring: true,
  };
}

const room = { service_days: [1, 2, 3, 4, 5, 6, 0] };
const policy = { ...DEFAULT_RESCHEDULE_POLICY };

// A future Wednesday series, like BoostSMS.
const rows = ["2027-01-06", "2027-01-13", "2027-01-20"].map((d, i) => row(`B${i}`, d));
const target: PlanTarget = { scope: "following", weekday: 2, startTime: "15:00", durationMin: 60 };

console.log("\n— Wednesday 14:00 → Tuesday 15:00 (same week) —");
const moves = planMoves(rows, target, policy, room, new Set());
for (const m of moves) console.log(`  ${m.row.reference_code}: ${slotLabel(m.row.starts_at, m.row.ends_at)}  →  ${slotLabel(m.startsAt, m.endsAt)}  guard=${m.guardNote ?? "-"}`);
check("all three planned", moves.length === 3);
check("lands on Tuesday", moves.every(m => bkkParts(m.startsAt).weekday === 2));
check("lands at 15:00 BKK", moves.every(m => bkkParts(m.startsAt).time === "15:00"));
check("moves back exactly one day", moves.every((m, i) => bkkParts(m.startsAt).date === ["2027-01-05","2027-01-12","2027-01-19"][i]));
check("keeps 60-min duration", moves.every(m => new Date(m.endsAt).getTime() - new Date(m.startsAt).getTime() === 3600000));
check("no guard trips", moves.every(m => m.guardNote === null));

console.log("\n— guards —");
const soon = planMoves([row("SOON", bkkParts(new Date(Date.now() + 3600_000)).date, bkkParts(new Date(Date.now() + 3600_000)).time)], target, policy, room, new Set());
check("min_notice blocks an imminent occurrence", soon[0].guardNote !== null, soon[0].guardNote ?? "");

const far = planMoves([row("FAR", "2030-01-09")], target, policy, room, new Set());
check("max_advance blocks a far-future date", far[0].guardNote?.includes("เกินช่วง") === true, far[0].guardNote ?? "");

const closedRoom = { service_days: [1, 3, 4, 5] }; // Tuesday not served
const closed = planMoves(rows, target, policy, closedRoom, new Set());
check("service_days blocks a closed weekday", closed.every(m => m.guardNote === "ห้องไม่เปิดให้บริการวันนี้"));

const holiday = planMoves(rows, target, policy, room, new Set(["2027-01-12"]));
check("holiday blocks just that date", holiday.filter(m => m.guardNote === "ตรงกับวันหยุดที่ปิดให้บริการ").length === 1);

const noService = planMoves(rows, target, { ...policy, respect_service_days: false }, closedRoom, new Set());
check("respect_service_days=false lifts the weekday guard", noService.every(m => m.guardNote === null));

console.log("\n— scope one with an explicit date —");
const one = planMoves([row("X", "2027-03-10")], { scope: "one", date: "2027-03-18", startTime: "09:30", durationMin: 90 }, policy, room, new Set());
check("uses the explicit date", bkkParts(one[0].startsAt).date === "2027-03-18");
check("uses the explicit time", bkkParts(one[0].startsAt).time === "09:30");
check("uses the explicit duration", new Date(one[0].endsAt).getTime() - new Date(one[0].startsAt).getTime() === 90 * 60000);

console.log("\n— week boundary: Sunday belongs to the week that starts Monday —");
const sun = planMoves([row("SUN", "2027-02-07")], { scope: "following", weekday: 1, startTime: "10:00", durationMin: 60 }, policy, room, new Set());
check("Sunday 7 Feb 2027 → Monday 1 Feb (same Mon-Sun week)", bkkParts(sun[0].startsAt).date === "2027-02-01", bkkParts(sun[0].startsAt).date);

const mon = planMoves([row("MON", "2027-02-08")], { scope: "following", weekday: 7, startTime: "10:00", durationMin: 60 }, policy, room, new Set());
check("Monday 8 Feb → Sunday 14 Feb (same week)", bkkParts(mon[0].startsAt).date === "2027-02-14", bkkParts(mon[0].startsAt).date);

console.log("\n— hash stability —");
const occ = (id: string, to: string, status: any) => ({ bookingId: id, referenceCode: id, from: { startsAt: to, endsAt: to, label: "" }, to: { startsAt: to, endsAt: to, label: "" }, status, note: null, conflicts: [] });
const h1 = hashPlan([occ("a", "2027-01-05T08:00:00Z", "ok"), occ("b", "2027-01-12T08:00:00Z", "ok")]);
const h2 = hashPlan([occ("b", "2027-01-12T08:00:00Z", "ok"), occ("a", "2027-01-05T08:00:00Z", "ok")]);
const h3 = hashPlan([occ("a", "2027-01-05T08:00:00Z", "ok"), occ("b", "2027-01-12T08:00:00Z", "blocked")]);
check("hash is order-independent", h1 === h2);
check("hash changes when a status changes", h1 !== h3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
