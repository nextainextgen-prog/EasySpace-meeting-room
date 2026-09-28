/**
 * End-to-end check of online payment: book → slip → EasySlip verdict →
 * booking confirmed, plus LINE linking/pushes and admin review.
 *
 * Real database, real storage bucket, real engine. EasySlip and the LINE API
 * are scripted doubles (tsconfig.e2e.json), so no quota is spent and no
 * customer is messaged. Everything created is deleted in `finally`.
 *
 *   npm run test:payment
 */

import { createClient } from "@supabase/supabase-js";
import { createPublicBooking, expireLapsedHolds } from "@/lib/server/public-booking";
import { submitSlip, reviewSlip, receiverMatches, getPaymentSetup } from "@/lib/server/payment-slips";
import { getPublicRoomConfig, listPublicBusy, type PublicRoomConfig } from "@/lib/data/public-rooms";
import { sent } from "@/lib/server/notifications";
import { __queue, __reset } from "@/lib/integrations/easyslip";
import { pushed } from "@/lib/integrations/line-messaging";
import { bookingFlexMessage } from "@/lib/templates/line-flex";
import {
  amountDueNow,
  maskedAccountMatches,
  namesLookAlike,
  promptPayPayload,
} from "@/lib/public-booking/payment";
import { bkkParts } from "@/lib/time/bkk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const MEETING = "00000000-0000-0000-0000-000000000003"; // ฿600/ชม.
const MASTER = "00000000-0000-0000-0000-000000000002";
const DAY = "2026-10-26";
const NAME = "E2E ลูกค้าชำระเงิน";
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
).buffer;

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));

const created = new Set<string>();
const startedAt = new Date().toISOString();

function pure() {
  console.log("\n— pure rules");
  // CRC-16/CCITT-FALSE check value: the PromptPay CRC must be the standard one.
  const pp = promptPayPayload("0812345678", 180)!;
  ok("promptpay payload well-formed", /^000201010212/.test(pp) && pp.includes("0066812345678") && pp.includes("5406180.00"));
  ok("promptpay ends with 4-hex CRC", /6304[0-9A-F]{4}$/.test(pp));
  ok("promptpay tax id accepted", promptPayPayload("0105551234567") !== null);
  ok("promptpay junk rejected", promptPayPayload("12345") === null);
  ok("deposit 30% of 600 = 180", amountDueNow(600, "deposit", 30) === 180);
  ok("deposit rounds up", amountDueNow(1140, "deposit", 30) === 342);
  ok("full = total", amountDueNow(1140, "full", 30) === 1140);
  ok("masked account match", maskedAccountMatches("xxx-x-x5678-x", "123-4-45678-9"));
  ok("masked account mismatch", !maskedAccountMatches("xxx-x-x5678-x", "123-4-45679-9"));
  ok("masked tail match (proxy)", maskedAccountMatches("xxx-xxx-5678", "0812345678"));
  ok("name match through title", namesLookAlike("บจก. อีซี่สเปซ", "บริษัท อีซี่สเปซ จำกัด"));
  const flex = bookingFlexMessage({
    kind: "received",
    reference: "BK1",
    roomName: "MEETING ROOM",
    startsAt: "2026-10-26T03:00:00.000Z",
    endsAt: "2026-10-26T04:00:00.000Z",
    bookerName: "ACME",
    totalAmount: 600,
    paidAmount: 0,
    dueNow: 180,
    dueBy: "2026-10-25T03:00:00.000Z",
    statusUrl: "https://example.com/x",
  }) as { type: string; altText: string; contents: { body: unknown; footer: unknown } };
  ok("flex message shape", flex.type === "flex" && flex.altText.length <= 400 && Boolean(flex.contents.body));
  ok("flex has pay button", JSON.stringify(flex).includes("ชำระเงิน"));
}

async function purge() {
  const { data } = await sb
    .from("bookings")
    .select("id, customer:customers!inner(display_name)")
    .eq("customer.display_name", NAME);
  for (const r of (data ?? []) as Array<{ id: string }>) created.add(r.id);
  const ids = [...created];
  if (ids.length) {
    for (const id of ids) {
      const { data: files } = await sb.storage.from("payment-slips").list(id);
      if (files?.length) await sb.storage.from("payment-slips").remove(files.map((f) => `${id}/${f.name}`));
    }
    await sb.from("payment_slips" as never).delete().in("booking_id", ids);
    await sb.from("booking_payments").delete().in("booking_id", ids);
    await sb.from("booking_audit_log").delete().in("booking_id", ids);
    await sb.from("notifications").delete().in("related_id", ids);
    await sb.from("bookings").delete().in("id", ids);
  }
  await sb.from("customers").delete().eq("display_name", NAME).gte("created_at", startedAt);
}

async function row(id: string) {
  const { data } = await sb
    .from("bookings")
    .select("booking_status, payment_status, paid_amount, hold_expires_at, metadata, cancelled_reason")
    .eq("id", id)
    .single();
  return data as {
    booking_status: string;
    payment_status: string;
    paid_amount: number;
    hold_expires_at: string | null;
    metadata: Record<string, any>;
    cancelled_reason: string | null;
  };
}

function slip(over: { amount?: number; account?: string; date?: string; transRef?: string } = {}) {
  return {
    ok: true as const,
    status: 200 as const,
    data: {
      transRef: over.transRef ?? `E2E${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      date: over.date ?? new Date().toISOString(),
      amount: { amount: over.amount ?? 180 },
      sender: { bank: { short: "SCB" }, account: { name: { th: "นาย ทดสอบ ระบบ" }, bank: { type: "BANKAC", account: "xxx-x-x1111-x" } } },
      receiver: { bank: { short: "KBANK" }, account: { name: { th: "บจก. อีซี่สเปซ" }, bank: { type: "BANKAC", account: over.account ?? "" } } },
    },
  };
}

async function main() {
  pure();

  const { error: tableErr } = await sb.from("payment_slips" as never).select("id").limit(1);
  if (tableErr) {
    console.log("\n(skip DB part — migration 16 not applied yet)");
    return;
  }

  const base = await getPublicRoomConfig();
  const CFG: PublicRoomConfig = {
    ...base,
    enabled: true,
    booking_enabled: true,
    allow_override_internal: true,
    booking_days_ahead: 30,
    min_duration_minutes: 60,
    max_duration_minutes: 480,
    payment_enabled: true,
    payment_mode: "deposit",
    deposit_percent: 30,
    payment_hold_minutes: 60,
    liff_id: "1234567890-E2ETEST",
  };

  const setup = await getPaymentSetup(CFG);
  ok("payment setup ready (key stub + table + bank)", setup.ready, setup.missing.join(", "));
  const bank = setup.banks[0];
  const digits = bank.account_number.replace(/\D/g, "");
  const masked = digits.slice(0, -4).replace(/\d/g, "x") + digits.slice(-4);
  const wrong = "xxxxxx" + String((Number(digits.slice(-4)) + 1) % 10000).padStart(4, "0");
  ok("receiver match on our account", receiverMatches(slip({ account: masked }).data as never, setup.banks, null));
  ok("receiver mismatch on other account", !receiverMatches(slip({ account: wrong }).data as never, setup.banks, null));

  await purge();
  __reset();

  const book = (start: string, phone: string, extra: Partial<Parameters<typeof createPublicBooking>[0]> = {}, cfg = CFG) =>
    createPublicBooking(
      {
        roomId: MEETING, date: DAY, startTime: start, durationMinutes: 60, name: NAME, phone,
        email: null, company: "E2E Co., Ltd.", attendees: 5, note: null, channel: "line", ip: null, ...extra,
      },
      cfg,
    ).then((r) => {
      if (r.ok) created.add(r.bookingId);
      return r;
    });

  console.log("\n— booking asks for a deposit, holds briefly, links LINE");
  pushed.length = 0;
  const b1 = await book("10:00", "0990000101", { lineAccessToken: "tok-Ue2e1" });
  ok("booking created", b1.ok, JSON.stringify(b1));
  if (!b1.ok) throw new Error("stop");
  ok("deposit due = 180 (30% of 600)", b1.amountDue === 180 && b1.paymentMode === "deposit", String(b1.amountDue));
  const holdMin = (new Date(b1.holdExpiresAt).getTime() - Date.now()) / 60_000;
  ok("hold ≈ 60 minutes", holdMin > 55 && holdMin <= 61, holdMin.toFixed(1));
  let r1 = await row(b1.bookingId);
  ok("LINE user linked from LIFF token", r1.metadata.public?.line?.userId === "Ue2e1");
  ok("LINE 'received' card pushed with pay button", pushed.some((p) => p.to === "Ue2e1" && JSON.stringify(p.messages).includes("ชำระเงิน")));
  ok("telegram booking.public mentions transfer", sent.some((s) => s.kind === "telegram:booking.public" && String(s.payload).includes("แนบสลิป")));

  const up = (ref: string, token: string) =>
    submitSlip({ reference: ref, token, bytes: PNG, mime: "image/png", filename: "slip.png" });

  console.log("\n— slips that must NOT confirm the booking");
  sent.length = 0;
  __queue(slip({ account: wrong }));
  let s = await up(b1.reference, b1.token);
  ok("wrong receiver → receiver_mismatch", !s.ok && s.status === "receiver_mismatch", JSON.stringify(s));
  ok("…team alerted for review", sent.some((x) => x.kind === "telegram:payment.slip_review"));
  __queue(slip({ account: masked, amount: 100 }));
  s = await up(b1.reference, b1.token);
  ok("short amount → amount_mismatch", !s.ok && s.status === "amount_mismatch");
  __queue(slip({ account: masked, date: new Date(Date.now() - 5 * 3600_000).toISOString() }));
  s = await up(b1.reference, b1.token);
  ok("slip older than booking → too_old", !s.ok && s.status === "too_old");
  __queue({ ok: false, status: 400, message: "duplicate_slip" });
  s = await up(b1.reference, b1.token);
  ok("EasySlip duplicate → duplicate", !s.ok && s.status === "duplicate");
  __queue({ ok: false, status: 404, message: "qrcode_not_found" });
  s = await up(b1.reference, b1.token);
  ok("not a slip → not_slip", !s.ok && s.status === "not_slip");
  ok("wrong token refused", !(await up(b1.reference, "x".repeat(24))).ok);
  r1 = await row(b1.bookingId);
  ok("booking still pending, unpaid", r1.booking_status === "pending" && r1.payment_status === "unpaid");

  console.log("\n— good slip confirms automatically");
  pushed.length = 0;
  sent.length = 0;
  const goodRef = `E2EGOOD${Date.now()}`;
  __queue(slip({ account: masked, amount: 180, transRef: goodRef }));
  s = await up(b1.reference, b1.token);
  ok("verified", s.ok && s.status === "verified", JSON.stringify(s));
  r1 = await row(b1.bookingId);
  ok("booking confirmed", r1.booking_status === "confirmed", r1.booking_status);
  ok("payment_status deposit, paid 180", r1.payment_status === "deposit" && Number(r1.paid_amount) === 180);
  ok("hold cleared", r1.hold_expires_at === null);
  const { data: pays } = await sb.from("booking_payments").select("amount, reference, slip_url").eq("booking_id", b1.bookingId);
  ok("booking_payments row with slip", (pays ?? []).length === 1 && (pays as any)[0].reference === goodRef && Boolean((pays as any)[0].slip_url));
  ok("LINE 'การจองสำเร็จ' pushed", pushed.some((p) => p.to === "Ue2e1" && JSON.stringify(p.messages).includes("การจองสำเร็จ")));
  ok("telegram payment.deposit sent", sent.some((x) => x.kind === "telegram:payment.deposit"));
  const { data: stored } = await sb.storage.from("payment-slips").list(b1.bookingId);
  ok("slip images stored privately", (stored ?? []).length >= 6, String(stored?.length));
  s = await up(b1.reference, b1.token);
  ok("paying again → already paid", !s.ok && s.status === "paid");

  console.log("\n— one transfer can't pay twice");
  const b2 = await book("12:00", "0990000102");
  if (!b2.ok) throw new Error("b2");
  __queue(slip({ account: masked, amount: 180, transRef: goodRef }));
  s = await up(b2.reference, b2.token);
  ok("reused transRef on another booking → duplicate", !s.ok && s.status === "duplicate", JSON.stringify(s));
  ok("…and b2 not confirmed", (await row(b2.bookingId)).booking_status === "pending");

  console.log("\n— admin review");
  __queue(slip({ account: wrong, amount: 180 }));
  await up(b2.reference, b2.token);
  const { data: pend } = await sb
    .from("payment_slips" as never)
    .select("id, status")
    .eq("booking_id", b2.bookingId)
    .eq("status", "receiver_mismatch")
    .single();
  const rv = await reviewSlip({ slipId: (pend as any).id, decision: "approve", note: "e2e", actorId: (await anyAdmin())!, actorName: "E2E" });
  ok("admin approves mismatched slip", rv.ok, JSON.stringify(rv));
  const r2 = await row(b2.bookingId);
  ok("…booking confirmed with deposit", r2.booking_status === "confirmed" && r2.payment_status === "deposit");
  const again = await reviewSlip({ slipId: (pend as any).id, decision: "approve", note: "", actorId: (await anyAdmin())!, actorName: "E2E" });
  ok("approving twice refused", !again.ok);

  console.log("\n— unpaid hold lapses and frees the room");
  pushed.length = 0;
  const b3 = await book("14:00", "0990000103", { lineAccessToken: "tok-Ue2e3" });
  if (!b3.ok) throw new Error("b3");
  await sb.from("bookings").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() } as never).eq("id", b3.bookingId);
  const busy = await listPublicBusy({ roomIds: [MEETING], fromDate: bkkParts(new Date()).date, days: 30, includeInternal: false });
  ok("lapsed hold not shown as busy", !(busy.get(MEETING) ?? []).some((b) => b.startsAt === b3.startsAt));
  const b4 = await book("14:00", "0990000104");
  ok("someone else can book the lapsed slot", b4.ok, JSON.stringify(b4));
  const r3 = await row(b3.bookingId);
  ok("lapsed booking cancelled", r3.booking_status === "cancelled" && (r3.cancelled_reason ?? "").includes("ไม่ได้ชำระ"));
  ok("LINE 'ยกเลิก' pushed to lapsed customer", pushed.some((p) => p.to === "Ue2e3" && JSON.stringify(p.messages).includes("ยกเลิก")));
  __queue(slip({ account: masked }));
  s = await up(b3.reference, b3.token);
  ok("paying a lapsed booking refused", !s.ok && s.status === "closed");
  void expireLapsedHolds;

  console.log("\n— modes");
  const full = await book("16:00", "0990000105", {}, { ...CFG, payment_mode: "full" });
  ok("full mode → due = total", full.ok && full.amountDue === full.totalAmount, JSON.stringify(full));
  const off = await book("18:00", "0990000106", { roomId: MASTER }, { ...CFG, payment_enabled: false });
  ok("payment off → nothing due, day-long hold", off.ok && off.amountDue === 0 && new Date(off.holdExpiresAt).getTime() - Date.now() > 12 * 3600_000);
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
    const { count } = await sb
      .from("bookings")
      .select("id, customer:customers!inner(display_name)", { count: "exact", head: true })
      .eq("customer.display_name", NAME);
    console.log(`\ncleanup: ${count ?? 0} test bookings left`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
