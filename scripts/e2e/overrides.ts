/**
 * End-to-end check of queue overrides: a customer takes a free internal slot,
 * then the team handles the case from /admin/overrides.
 *
 * Real DB + engine; Telegram/LINE/EasySlip stubbed. Fixtures on the empty
 * 2026-10-26 and removed in `finally`.
 *
 *   npm run test:overrides
 */

import { createClient } from "@supabase/supabase-js";
import { createPublicBooking } from "@/lib/server/public-booking";
import {
  cancelCustomerAndRestore,
  countOpenOverrides,
  listOverrides,
  moveDisplaced,
  resolveWithoutMove,
  suggestSlots,
} from "@/lib/server/overrides";
import { applyPayment } from "@/lib/server/payment-slips";
import { getPublicRoomConfig, listPublicBusy, type PublicRoomConfig } from "@/lib/data/public-rooms";
import { sent } from "@/lib/server/notifications";
import { TEST_MEMBER } from "@/lib/data/members";
import { resolveBank } from "@/lib/banks";
import { fromBkk, bkkParts } from "@/lib/time/bkk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const PRIME = "00000000-0000-0000-0000-000000000001";
const MASTER = "00000000-0000-0000-0000-000000000002";
const MEETING = "00000000-0000-0000-0000-000000000003";
const ORG = "591f26fd-4b8f-49a4-b40e-317b6aa03024";
const DAY = "2026-10-26";
const TAG = "E2E-OVR";
const NAME = "E2E ลูกค้าทับคิว";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));
const created = new Set<string>();
const startedAt = new Date().toISOString();

function pure() {
  console.log("\n— bank registry");
  ok("KBank → KBANK", resolveBank("KBank")?.code === "KBANK");
  ok("กสิกรไทย → KBANK", resolveBank("ธนาคารกสิกรไทย จำกัด (มหาชน)")?.code === "KBANK");
  ok("EasySlip id 014 → SCB", resolveBank("014")?.code === "SCB");
  ok("TMB → TTB", resolveBank("TMB")?.code === "TTB");
  ok("Krungsri → BAY", resolveBank("Krungsri")?.code === "BAY");
  ok("unknown → null", resolveBank("Bank of Nowhere") === null);
}

async function internal(ref: string, room: string, start: string, attendees: number) {
  const s = fromBkk(DAY, start);
  const { data, error } = await sb
    .from("bookings")
    .insert({
      reference_code: `${TAG}-${ref}`, source: "internal", member_id: TEST_MEMBER.id, org_id: ORG,
      room_id: room, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 3600_000).toISOString(),
      attendees_count: attendees, base_amount: 0, addons_amount: 0, discount_amount: 0, total_amount: 0,
      deposit_amount: 0, paid_amount: 0, payment_status: "free", booking_status: "confirmed",
      free_reason: "e2e", internal_title: `E2E ${ref}`, is_public: false,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  created.add((data as { id: string }).id);
  return (data as { id: string }).id;
}

async function row(id: string) {
  const { data } = await sb.from("bookings").select("booking_status, room_id, starts_at, metadata").eq("id", id).single();
  return data as { booking_status: string; room_id: string; starts_at: string; metadata: Record<string, any> };
}

async function purge() {
  const { data: a } = await sb.from("bookings").select("id").like("reference_code", `${TAG}%`);
  const { data: b } = await sb.from("bookings").select("id, customer:customers!inner(display_name)").eq("customer.display_name", NAME);
  for (const r of [...(a ?? []), ...(b ?? [])] as Array<{ id: string }>) created.add(r.id);
  const ids = [...created];
  if (ids.length) {
    await sb.from("booking_payments").delete().in("booking_id", ids);
    await sb.from("booking_audit_log").delete().in("booking_id", ids);
    await sb.from("notifications").delete().in("related_id", ids);
    await sb.from("bookings").delete().in("id", ids);
  }
  await sb.from("customers").delete().eq("display_name", NAME).gte("created_at", startedAt);
}

async function main() {
  pure();
  const base = await getPublicRoomConfig();
  const CFG: PublicRoomConfig = {
    ...base, enabled: true, booking_enabled: true, allow_override_internal: true, auto_relocate_internal: true,
    override_protect_minutes: 0, booking_days_ahead: 30, min_duration_minutes: 60, max_duration_minutes: 480,
    payment_enabled: false,
  };
  await purge();
  const book = (room: string, start: string, phone: string, cfg = CFG) =>
    createPublicBooking(
      { roomId: room, date: DAY, startTime: start, durationMinutes: 60, name: NAME, phone, company: "E2E Co.", channel: "qr", ip: null },
      cfg,
    ).then((r) => {
      if (r.ok) created.add(r.bookingId);
      return r;
    });

  console.log("\n— released case: suggestions + one-click move");
  const i1 = await internal("I1", MEETING, "19:00", 20); // only MEETING fits 20
  sent.length = 0;
  const c1 = await book(MEETING, "19:00", "0990000201");
  ok("customer booked over I1", c1.ok, JSON.stringify(c1));
  ok("I1 released", (await row(i1)).booking_status === "cancelled");
  const tg = sent.find((s) => s.kind === "telegram:booking.override");
  ok("telegram has admin link + customer phone", Boolean(tg && String(tg.payload).includes("/admin/overrides?focus=") && String(tg.payload).includes("099")));
  const bell = sent.find((s) => s.kind === "in_app" && String((s.payload as any).title).includes("ขอทับคิว"));
  ok("bell links to the case", (bell?.payload as any)?.link === `/admin/overrides?focus=${i1}`);
  let cases = await listOverrides();
  const case1 = cases.find((c) => c.id === i1);
  ok("case listed as open/released", case1?.state === "open" && case1.outcome === "released");
  ok("case shows customer + payment", case1?.customer?.reference === (c1.ok ? c1.reference : "") && case1?.customer?.company === "E2E Co.");
  ok("open count ≥ 1", (await countOpenOverrides()) >= 1);
  const sug = await suggestSlots(i1);
  ok("suggestions found", sug.length > 0, JSON.stringify(sug));
  ok("suggestions only in rooms that fit 20", sug.every((s) => s.roomId === MEETING));
  ok("no suggestion overlaps the customer", sug.every((s) => s.startsAt !== fromBkk(DAY, "19:00").toISOString()));
  const pick = sug[0];
  sent.length = 0;
  const mv = await moveDisplaced({ internalId: i1, roomId: pick.roomId, startsAt: pick.startsAt, endsAt: pick.endsAt, actorId: (await anyAdmin())!, actorName: "E2E" });
  ok("move ok", mv.ok, JSON.stringify(mv));
  const r1 = await row(i1);
  ok("I1 active again at new slot", r1.booking_status === "confirmed" && new Date(r1.starts_at).toISOString() === pick.startsAt);
  ok("case resolved as moved", r1.metadata.displaced_by?.resolution?.kind === "moved");
  ok("member told", sent.some((s) => s.kind === "in_app" && (s.payload as any).recipientId !== undefined));
  const again = await moveDisplaced({ internalId: i1, roomId: MEETING, startsAt: fromBkk(DAY, "19:00").toISOString(), endsAt: fromBkk(DAY, "20:00").toISOString(), actorId: (await anyAdmin())!, actorName: "E2E" });
  ok("moving onto the customer's slot refused", !again.ok);

  console.log("\n— relocated case: acknowledge");
  const i2 = await internal("I2", PRIME, "10:00", 4);
  const c2 = await book(PRIME, "10:00", "0990000202");
  ok("customer booked over I2", c2.ok);
  ok("I2 relocated to MASTER (smallest that fits)", (await row(i2)).room_id === MASTER);
  const ack = await resolveWithoutMove({ internalId: i2, kind: "acknowledged", note: "โทรแจ้งแล้ว", actorName: "E2E" });
  ok("acknowledge ok", ack.ok && (await row(i2)).metadata.displaced_by?.resolution?.kind === "acknowledged");

  console.log("\n— cancel customer, give slot back");
  const i3 = await internal("I3", MEETING, "21:00", 20);
  const c3 = await book(MEETING, "21:00", "0990000203");
  ok("customer booked over I3", c3.ok);
  const cc = await cancelCustomerAndRestore({ internalId: i3, reason: "ลูกค้าแจ้งยกเลิกทางโทรศัพท์", actorName: "E2E" });
  ok("cancel+restore ok", cc.ok, JSON.stringify(cc));
  ok("I3 back to confirmed", (await row(i3)).booking_status === "confirmed");
  if (c3.ok) {
    const { data } = await sb.from("bookings").select("booking_status").eq("id", c3.bookingId).single();
    ok("customer booking cancelled", (data as any).booking_status === "cancelled");
  }

  console.log("\n— customer pays → team told the override is permanent");
  const i4 = await internal("I4", MEETING, "08:30", 20);
  const c4 = await book(MEETING, "08:30", "0990000204");
  ok("customer booked over I4", c4.ok);
  sent.length = 0;
  if (c4.ok) await applyPayment({ bookingId: c4.bookingId, amount: 180, transRef: null, method: "bank_transfer", imagePath: null, actorName: "E2E" });
  ok("telegram 'ชำระแล้ว — ถาวร' sent", sent.some((s) => s.kind === "telegram:booking.override" && String(s.payload).includes("ถาวร")));
  ok("bell danger with case link", sent.some((s) => s.kind === "in_app" && (s.payload as any).level === "danger" && String((s.payload as any).link).includes(i4)));

  console.log("\n— protection window");
  const i5 = await internal("I5", PRIME, "15:00", 4);
  const protect = 60 * 24 * 40; // test day is < 40 days away
  const c5 = await book(PRIME, "15:00", "0990000205", { ...CFG, override_protect_minutes: protect });
  ok("protected internal meeting can't be taken", !c5.ok && c5.error === "slot_taken", JSON.stringify(c5));
  ok("…and is untouched", (await row(i5)).booking_status === "confirmed" && (await row(i5)).room_id === PRIME);
  const busy = await listPublicBusy({ roomIds: [PRIME], fromDate: bkkParts(new Date()).date, days: 40, includeInternal: false, protectMinutes: protect });
  ok("shows as busy (nameless) to customers", (busy.get(PRIME) ?? []).some((b) => new Date(b.startsAt).getTime() === fromBkk(DAY, "15:00").getTime()));
  const busyOff = await listPublicBusy({ roomIds: [PRIME], fromDate: bkkParts(new Date()).date, days: 40, includeInternal: false, protectMinutes: 0 });
  ok("hidden again with protection off", !(busyOff.get(PRIME) ?? []).some((b) => new Date(b.startsAt).getTime() === fromBkk(DAY, "15:00").getTime()));

  cases = await listOverrides();
  ok("resolved cases no longer open", [i1, i2, i3].every((id) => cases.find((c) => c.id === id)?.state === "resolved"));
}

async function anyAdmin() {
  const { data } = await sb.from("profiles").select("id").in("role", ["super_admin", "owner", "admin"]).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

main()
  .catch((e) => {
    fail++;
    console.error("\nERROR", e);
  })
  .finally(async () => {
    await purge();
    const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).like("reference_code", `${TAG}%`);
    console.log(`\ncleanup: ${count ?? 0} tagged rows left`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
