/**
 * Checks for the over-quota billing maths (src/lib/billing/overage.ts).
 * Pure functions only — no database.
 *
 *   npm run test:overage
 */

import { computeOverage, periodRange, shiftPeriod, type OverageBooking } from "../src/lib/billing/overage";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra: unknown = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${JSON.stringify(extra)}`));

const room = { MASTER: 380, PRIME: 200, MEETING: 600 } as const;
let seq = 0;
function bk(day: number, from: string, to: string, name: keyof typeof room, status = "confirmed"): OverageBooking {
  seq++;
  const d = `2026-11-${String(day).padStart(2, "0")}`;
  return {
    id: `b${seq}`,
    reference: `BK${seq}`,
    startsAt: new Date(`${d}T${from}:00+07:00`).toISOString(),
    endsAt: new Date(`${d}T${to}:00+07:00`).toISOString(),
    status,
    roomId: name,
    roomName: `${name} ROOM`,
    rate: room[name],
    memberName: "สมชาย",
    title: "ประชุม",
    createdAt: new Date(`2026-11-01T08:00:00+07:00`).toISOString(),
  };
}

console.log("quota not reached");
{
  const r = computeOverage([bk(3, "09:00", "11:00", "MASTER")], { hours: 10, unlimited: false });
  ok("nothing charged", r.amount === 0 && r.overHours === 0 && r.usedHours === 2, r);
  ok("line is all free", r.lines[0].freeHours === 2 && r.lines[0].chargedHours === 0);
}

console.log("crossing the quota inside one booking");
{
  // 39 h used, then MASTER 2 h → 1 h free + 1 h × 380
  const filler = Array.from({ length: 13 }, (_, i) => bk(2 + i, "09:00", "12:00", "PRIME"));
  const r = computeOverage([...filler, bk(20, "14:00", "16:00", "MASTER")], { hours: 40, unlimited: false });
  const last = r.lines[r.lines.length - 1];
  ok("used 41 h", r.usedHours === 41, r.usedHours);
  ok("over 1 h", r.overHours === 1, r.overHours);
  ok("1 h free + 1 h charged on the crossing booking", last.freeHours === 1 && last.chargedHours === 1, last);
  ok("charged at that room's rate", r.amount === 380 && last.amount === 380, r.amount);
}

console.log("free hours go in the order rooms were used, not booked");
{
  const late = bk(25, "09:00", "11:00", "MEETING");
  const early = bk(5, "09:00", "11:00", "PRIME");
  late.createdAt = new Date("2026-10-01T00:00:00Z").toISOString(); // booked first, used last
  const r = computeOverage([late, early], { hours: 2, unlimited: false });
  ok("earlier use is free", r.lines[0].id === early.id && r.lines[0].chargedHours === 0);
  ok("later use is charged at MEETING rate", r.amount === 1200, r.amount);
}

console.log("statuses");
{
  const r = computeOverage(
    [bk(3, "09:00", "10:00", "PRIME", "cancelled"), bk(4, "09:00", "10:00", "PRIME", "no_show"), bk(5, "09:00", "10:00", "PRIME", "completed")],
    { hours: 0, unlimited: false },
  );
  ok("cancelled is left out", r.lines.length === 2 && !r.lines.some((l) => l.status === "cancelled"));
  ok("no-show is charged like any booking", r.amount === 400, r.amount);
}

console.log("half hours and unlimited");
{
  const r = computeOverage([bk(3, "09:00", "10:30", "MASTER")], { hours: 1, unlimited: false });
  ok("30 minutes over = 190", r.overHours === 0.5 && r.amount === 190, r);
  const u = computeOverage([bk(3, "09:00", "18:00", "MEETING")], { hours: 0, unlimited: true });
  ok("unlimited never charges", u.amount === 0 && u.overHours === 0 && u.usedHours === 9, u);
}

console.log("periods");
{
  const { start, end } = periodRange("2026-11");
  ok("starts at Bangkok midnight on the 1st", start === "2026-10-31T17:00:00.000Z", start);
  ok("ends at the next month's start", end === "2026-11-30T17:00:00.000Z", end);
  ok("shift back across a year", shiftPeriod("2026-01", -1) === "2025-12");
  ok("shift forward", shiftPeriod("2026-11", 1) === "2026-12");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
