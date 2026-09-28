/**
 * End-to-end check of public (QR / LINE) self-service booking, against the
 * real database and the real engine in `lib/server/public-booking`.
 *
 * Telegram / in-app dispatch and next/cache are swapped for the doubles in
 * this directory (see tsconfig.e2e.json), so nothing reaches the live group.
 * Fixtures live in an empty evening of 2026-10-26 and are deleted in a
 * finally block, including after a failure.
 *
 *   npm run test:public
 */

import { createClient } from "@supabase/supabase-js";
import {
  createPublicBooking,
  cancelPublicBookingByToken,
  getPublicBookingView,
  restoreDisplacedFor,
} from "@/lib/server/public-booking";
import {
  DEFAULT_PUBLIC_ROOM_CONFIG,
  getPublicRoomConfig,
  listPublicBusy,
} from "@/lib/data/public-rooms";
import { sent } from "@/lib/server/notifications";
import { TEST_MEMBER } from "@/lib/data/members";
import { fromBkk, bkkParts, addDays } from "@/lib/time/bkk";
import {
  checkPublicWindow,
  maxRunFrom,
  mergeBlocks,
  normalisePhone,
  quotePublic,
  slotState,
} from "@/lib/public-booking/shared";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const PRIME = "00000000-0000-0000-0000-000000000001"; // cap 6
const MASTER = "00000000-0000-0000-0000-000000000002"; // cap 10
const MEETING = "00000000-0000-0000-0000-000000000003"; // cap 40
const ORG = "591f26fd-4b8f-49a4-b40e-317b6aa03024"; // Thunder Solution
const DAY = "2026-10-26";
const TAG = "E2E-PUBLIC";
const NAME = "E2E ลูกค้าออนไลน์";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));

const created = new Set<string>();
const startedAt = new Date().toISOString();

async function internal(ref: string, room: string, start: string, minutes: number, attendees: number) {
  const s = fromBkk(DAY, start);
  const { data, error } = await sb
    .from("bookings")
    .insert({
      reference_code: `${TAG}-${ref}`, source: "internal", member_id: TEST_MEMBER.id,
      org_id: ORG, room_id: room, starts_at: s.toISOString(),
      ends_at: new Date(s.getTime() + minutes * 60_000).toISOString(),
      attendees_count: attendees, base_amount: 0, addons_amount: 0, discount_amount: 0,
      total_amount: 0, deposit_amount: 0, paid_amount: 0, payment_status: "free",
      booking_status: "confirmed", free_reason: "e2e", internal_title: `E2E ${ref}`,
      is_public: false,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  created.add(id);
  return id;
}

async function row(id: string) {
  const { data } = await sb
    .from("bookings")
    .select("id, room_id, booking_status, cancelled_reason, metadata, source, total_amount, hold_expires_at, source_channel")
    .eq("id", id)
    .single();
  return data as {
    id: string;
    room_id: string;
    booking_status: string;
    cancelled_reason: string | null;
    metadata: Record<string, any> | null;
    source: string;
    total_amount: number;
    hold_expires_at: string | null;
    source_channel: string | null;
  };
}

let CFG: Awaited<ReturnType<typeof getPublicRoomConfig>>;

function book(over: Partial<Parameters<typeof createPublicBooking>[0]> = {}) {
  return createPublicBooking(
    {
    roomId: MEETING,
    date: DAY,
    startTime: "19:00",
    durationMinutes: 60,
    name: NAME,
    phone: "0990000001",
    email: "e2e@example.com",
    company: null,
    attendees: 4,
    note: "e2e",
    channel: "qr",
    ip: null,
    ...over,
    },
    CFG,
  );
}

async function track<T extends { ok: boolean }>(p: Promise<T>): Promise<T> {
  const r = await p;
  if (r.ok) created.add((r as unknown as { bookingId: string }).bookingId);
  return r;
}

async function purge() {
  // Everything this run created, plus anything that still carries the tag.
  const { data } = await sb.from("bookings").select("id").like("reference_code", `${TAG}%`);
  for (const r of (data ?? []) as Array<{ id: string }>) created.add(r.id);
  const { data: byCust } = await sb
    .from("bookings")
    .select("id, customer:customers!inner(display_name)")
    .eq("customer.display_name", NAME);
  for (const r of (byCust ?? []) as Array<{ id: string }>) created.add(r.id);

  const ids = [...created];
  if (ids.length) {
    await sb.from("booking_audit_log").delete().in("booking_id", ids);
    await sb.from("notifications").delete().in("related_id", ids);
    await sb.from("bookings").delete().in("id", ids);
  }
  await sb.from("customers").delete().eq("display_name", NAME).gte("created_at", startedAt);
}

function pure() {
  console.log("\n— pure rules");
  const now = fromBkk(DAY, "10:10");
  ok("slot 10:00 still bookable at 10:10 (grace)", slotState(DAY, "10:00", [], now) === "free");
  ok("slot 09:30 is past at 10:10", slotState(DAY, "09:30", [], now) === "past");
  const busy = [{ startsAt: fromBkk(DAY, "12:00").toISOString(), endsAt: fromBkk(DAY, "13:00").toISOString() }];
  ok("run from 10:30 stops at busy 12:00", maxRunFrom(DAY, "10:30", busy, now) === 90);
  ok("run from 21:00 stops at close", maxRunFrom(DAY, "21:00", [], now) === 60);
  ok(
    "merge hides back-to-back bookings",
    mergeBlocks([
      { startsAt: fromBkk(DAY, "09:00").toISOString(), endsAt: fromBkk(DAY, "10:00").toISOString() },
      { startsAt: fromBkk(DAY, "10:00").toISOString(), endsAt: fromBkk(DAY, "11:00").toISOString() },
    ]).length === 1,
  );
  ok("phone +66 normalises", normalisePhone("+66 81-234-5678") === "0812345678");
  ok("phone junk rejected", normalisePhone("12345") === null);
  const q = quotePublic(380, [{ id: "a", name: "3 ชั่วโมง", hours: 3, price: 1550 }], 180);
  ok("package dearer than hourly is ignored", q.total === 1140 && q.packageId === null, JSON.stringify(q));
  const q2 = quotePublic(600, [{ id: "b", name: "ครึ่งวัน", hours: 4, price: 2000 }], 300);
  ok("cheaper package wins", q2.total === 2000 && q2.packageName === "ครึ่งวัน", JSON.stringify(q2));
  const base = { now: fromBkk(DAY, "08:00"), daysAhead: 30, minMinutes: 60, maxMinutes: 480 };
  ok("window ok", checkPublicWindow({ ...base, date: DAY, startTime: "09:00", durationMinutes: 60 }).ok);
  ok("window past close", checkPublicWindow({ ...base, date: DAY, startTime: "21:30", durationMinutes: 60 }).reason === "outside_hours");
  ok("window too short", checkPublicWindow({ ...base, date: DAY, startTime: "09:00", durationMinutes: 30 }).reason === "too_short");
  ok("window too far", checkPublicWindow({ ...base, date: addDays(DAY, 31), startTime: "09:00", durationMinutes: 60 }).reason === "too_far");
  ok("window odd minute", checkPublicWindow({ ...base, date: DAY, startTime: "09:15", durationMinutes: 60 }).reason === "outside_hours");
}

async function main() {
  pure();

  const today = bkkParts(new Date()).date;
  const cfg = await getPublicRoomConfig();
  const fullCfg = { ...cfg, enabled: true, booking_enabled: true, allow_override_internal: true, auto_relocate_internal: true, booking_days_ahead: 30, min_duration_minutes: 60, max_duration_minutes: 480 };
  CFG = fullCfg;

  await purge();

  console.log("\n— visibility: customers never see internal bookings");
  const i1 = await internal("I1", MEETING, "19:00", 60, 4);
  let busy = await listPublicBusy({ roomIds: [MEETING], fromDate: today, days: 60, includeInternal: false });
  const onDay = (list: Array<{ startsAt: string }>) =>
    list.filter((b) => bkkParts(b.startsAt).date === DAY);
  ok("internal 19:00 hidden from public", onDay(busy.get(MEETING)!).length === 0);
  busy = await listPublicBusy({ roomIds: [MEETING], fromDate: today, days: 60, includeInternal: true });
  ok("…but shows as nameless block when override is off", onDay(busy.get(MEETING)!).length === 1);

  console.log("\n— override: internal meeting relocated to a free room");
  sent.length = 0;
  const p1 = await track(book({ channel: "line" }));
  ok("customer booking created", p1.ok, JSON.stringify(p1));
  if (!p1.ok) throw new Error("cannot continue");
  const p1Row = await row(p1.bookingId);
  ok("customer booking is pending (รอยืนยัน) with hold deadline", p1Row.booking_status === "pending" && Boolean(p1Row.hold_expires_at));
  ok("channel recorded as line", p1Row.source_channel === "line" && p1Row.metadata?.public?.channel === "line");
  ok("priced at hourly 600", Number(p1Row.total_amount) === 600, String(p1Row.total_amount));
  const i1Row = await row(i1);
  ok("internal I1 moved to PRIME (smallest room that fits 4)", i1Row.room_id === PRIME, i1Row.room_id);
  ok("internal I1 still confirmed", i1Row.booking_status === "confirmed");
  ok("I1 marked displaced_by customer ref", i1Row.metadata?.displaced_by?.reference === p1.reference);
  ok("telegram booking.public sent", sent.some((s) => s.kind === "telegram:booking.public"));
  ok("telegram booking.override sent", sent.some((s) => s.kind === "telegram:booking.override" && String(s.payload).includes("ย้ายไปห้อง")));
  const inApp = sent.filter((s) => s.kind === "in_app").map((s) => s.payload as { recipientId?: string; title: string });
  ok("admin bell notified", inApp.some((n) => !n.recipientId && n.title.includes("ขอทับคิว")));
  ok("member bell notified (if member has a profile)", inApp.some((n) => n.recipientId) || !(await memberHasProfile()));

  busy = await listPublicBusy({ roomIds: [MEETING], fromDate: today, days: 60, includeInternal: false });
  ok("slot now shows busy to other customers", onDay(busy.get(MEETING)!).length === 1);

  console.log("\n— other customers are blocked, never overridden");
  const dup = await track(book({ phone: "0990000002" }));
  ok("second customer same slot → slot_taken", !dup.ok && dup.error === "slot_taken", JSON.stringify(dup));
  const overlap = await track(book({ phone: "0990000002", startTime: "19:30" }));
  ok("partial overlap → slot_taken", !overlap.ok && overlap.error === "slot_taken");

  console.log("\n— override with no free room: internal released, then restored on cancel");
  const i2 = await internal("I2", MEETING, "20:00", 60, 20); // only MEETING fits 20
  sent.length = 0;
  const p2 = await track(book({ startTime: "20:00", phone: "0990000003", attendees: 20 }));
  ok("customer booking over I2 created", p2.ok, JSON.stringify(p2));
  if (!p2.ok) throw new Error("cannot continue");
  let i2Row = await row(i2);
  ok("I2 released (cancelled)", i2Row.booking_status === "cancelled", i2Row.booking_status);
  ok("I2 reason mentions customer ref", (i2Row.cancelled_reason ?? "").includes(p2.reference));
  ok("override message says released", sent.some((s) => s.kind === "telegram:booking.override" && String(s.payload).includes("ปล่อยคิว")));

  ok("status view rejects wrong token", (await getPublicBookingView(p2.reference, "x".repeat(24))) === null);
  const view = await getPublicBookingView(p2.reference, p2.token);
  ok("status view with token works + cancellable", Boolean(view?.canCancel) && view?.status === "pending");

  const cancel = await cancelPublicBookingByToken(p2.reference, p2.token);
  ok("customer cancels via token", cancel.ok, JSON.stringify(cancel));
  i2Row = await row(i2);
  ok("I2 restored to confirmed", i2Row.booking_status === "confirmed" && !i2Row.cancelled_reason, i2Row.booking_status);
  ok("I2 restore stamped", Boolean(i2Row.metadata?.displaced_by?.restored_at));
  ok("restore is idempotent", (await restoreDisplacedFor(p2.bookingId)) === 0);
  const again = await cancelPublicBookingByToken(p2.reference, p2.token);
  ok("cancel twice refused", !again.ok);

  console.log("\n— settings respected");
  const i3 = await internal("I3", MASTER, "18:00", 60, 4);
  const noOverride = await track(
    createPublicBooking(
      { roomId: MASTER, date: DAY, startTime: "18:00", durationMinutes: 60, name: NAME, phone: "0990000004", channel: "qr", ip: null },
      { ...fullCfg, allow_override_internal: false },
    ),
  );
  ok("override off → slot_taken", !noOverride.ok && noOverride.error === "slot_taken");
  ok("…and internal untouched", (await row(i3)).booking_status === "confirmed" && (await row(i3)).room_id === MASTER);

  const i4 = await internal("I4", MASTER, "20:30", 60, 4);
  const noRelocate = await track(
    createPublicBooking(
      { roomId: MASTER, date: DAY, startTime: "20:30", durationMinutes: 60, name: NAME, phone: "0990000004", channel: "qr", ip: null },
      { ...fullCfg, auto_relocate_internal: false },
    ),
  );
  ok("relocate off → booking ok", noRelocate.ok, JSON.stringify(noRelocate));
  ok("…internal released instead of moved", (await row(i4)).booking_status === "cancelled");

  // Hold-expiry cron path: expire the customer booking, restore runs.
  if (noRelocate.ok) {
    await sb.from("bookings").update({ booking_status: "cancelled", hold_expires_at: null } as never).eq("id", noRelocate.bookingId);
    const n = await restoreDisplacedFor(noRelocate.bookingId);
    ok("expired hold gives I4 back", n === 1 && (await row(i4)).booking_status === "confirmed");
  }

  console.log("\n— validation & abuse guards");
  const past = await track(book({ date: today, startTime: "08:30", phone: "0990000005" }));
  ok("past slot rejected", !past.ok && past.error === "invalid_window", JSON.stringify(past));
  const far = await track(book({ date: addDays(today, 45), phone: "0990000005" }));
  ok("beyond booking_days_ahead rejected", !far.ok && far.error === "invalid_window");
  const cap = await track(book({ roomId: PRIME, startTime: "09:00", attendees: 12, phone: "0990000005" }));
  ok("over capacity rejected", !cap.ok && cap.error === "over_capacity");
  const closed = await track(createPublicBooking(
    { roomId: PRIME, date: DAY, startTime: "09:00", durationMinutes: 60, name: NAME, phone: "0990000005", channel: "qr", ip: null },
    { ...fullCfg, booking_enabled: false },
  ));
  ok("booking disabled → closed", !closed.ok && closed.error === "closed");

  // Per-phone cap: 3 live pending bookings, the 4th is refused.
  const phone = "0990000009";
  const slots = ["09:00", "10:00", "11:00"];
  let allOk = true;
  for (const s of slots) {
    const r = await track(book({ roomId: PRIME, startTime: s, phone }));
    allOk &&= r.ok;
  }
  ok("3 bookings for one phone accepted", allOk);
  const fourth = await track(book({ roomId: PRIME, startTime: "13:00", phone }));
  ok("4th live booking for same phone refused", !fourth.ok && fourth.error === "too_many_active", JSON.stringify(fourth));

  // Unknown room / inactive room.
  const bad = await track(book({ roomId: "00000000-0000-0000-0000-00000000dead" }));
  ok("unknown room refused", !bad.ok && bad.error === "room_unavailable");

  void DEFAULT_PUBLIC_ROOM_CONFIG;
}

async function memberHasProfile() {
  const { data } = await sb.from("members").select("profile_id").eq("id", TEST_MEMBER.id).maybeSingle();
  return Boolean((data as { profile_id: string | null } | null)?.profile_id);
}

main()
  .catch((e) => {
    fail++;
    console.error("\nERROR", e);
  })
  .finally(async () => {
    await purge();
    const { count } = await sb
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .like("reference_code", `${TAG}%`);
    console.log(`\ncleanup: ${count ?? 0} tagged rows left`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
