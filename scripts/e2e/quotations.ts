/**
 * End-to-end check of the quotation workflow:
 *   request (price estimate incl. VAT / WHT / OT) → admin quotation →
 *   customer accepts → pays → booking confirmed; plus rejection and expiry.
 *
 * Real DB and engine; Telegram, LINE and EasySlip are stubbed.
 *   npm run test:quotations
 */

import { createClient } from "@supabase/supabase-js";
import { createPublicBooking } from "@/lib/server/public-booking";
import { acceptQuotation, issueQuotation, rejectRequest } from "@/lib/server/quotations";
import { submitSlip, getPaymentSetup } from "@/lib/server/payment-slips";
import { getPublicRoomConfig, type PublicRoomConfig } from "@/lib/data/public-rooms";
import { sent } from "@/lib/server/notifications";
import { pushed } from "@/lib/integrations/line-messaging";
import { __queue } from "@/lib/integrations/easyslip";
import { DEFAULT_PRICING, estimatePrice, otMinutesFor, totalsFromLines } from "@/lib/public-booking/pricing";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const MEETING = "00000000-0000-0000-0000-000000000003";
const DAY = "2026-10-27";
const NAME = "E2E ลูกค้าใบเสนอราคา";
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0)).buffer;

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const created = new Set<string>();
const startedAt = new Date().toISOString();

function pure() {
  console.log("\n— price maths");
  const inc = totalsFromLines([{ label: "ห้อง", amount: 600 }], 0, { ...DEFAULT_PRICING, vat_inclusive: true }, true);
  ok("VAT inclusive: 600 → 560.75 + 39.25", near(inc.preVat, 560.75) && near(inc.vat, 39.25) && near(inc.grandTotal, 600), JSON.stringify(inc));
  ok("WHT 3% on pre-VAT: 16.82 → net 583.18", near(inc.wht, 16.82) && near(inc.netPayable, 583.18));
  const ex = totalsFromLines([{ label: "ห้อง", amount: 600 }], 0, { ...DEFAULT_PRICING, vat_inclusive: false }, true);
  ok("VAT exclusive: 600 + 42 = 642; WHT 18 → 624", near(ex.grandTotal, 642) && near(ex.wht, 18) && near(ex.netPayable, 624));
  const noWht = totalsFromLines([{ label: "ห้อง", amount: 600 }], 0, DEFAULT_PRICING, false);
  ok("no WHT for non-juristic", noWht.wht === 0 && noWht.netPayable === 600);
  const disc = totalsFromLines([{ label: "ห้อง", amount: 600 }], 100, { ...DEFAULT_PRICING, vat_enabled: false }, false);
  ok("discount applied before VAT", disc.grandTotal === 500);
  ok("OT minutes 17:00–20:00 after 18:00 = 120", otMinutesFor("17:00", 180, DEFAULT_PRICING) === 120);
  ok("no OT before 18:00", otMinutesFor("09:00", 120, DEFAULT_PRICING) === 0);
  const est = estimatePrice({ hourlyRate: 600, packages: [], startTime: "17:00", minutes: 180, cfg: { ...DEFAULT_PRICING, ot_value: 100 }, withholding: false });
  ok("estimate: room 1800 + OT 200 = 2000", est.lines.length === 2 && est.lines[1].amount === 200 && est.grandTotal === 2000, JSON.stringify(est.lines));
  const pct = estimatePrice({ hourlyRate: 600, packages: [], startTime: "17:00", minutes: 180, cfg: { ...DEFAULT_PRICING, ot_type: "percent", ot_value: 50 }, withholding: false });
  ok("OT as 50% of hourly → 300/hr → 600", pct.lines[1]?.amount === 600);
}

async function purge() {
  const { data } = await sb.from("bookings").select("id, customer:customers!inner(display_name)").eq("customer.display_name", NAME);
  for (const r of (data ?? []) as Array<{ id: string }>) created.add(r.id);
  const ids = [...created];
  if (ids.length) {
    for (const id of ids) {
      const { data: f } = await sb.storage.from("payment-slips").list(id);
      if (f?.length) await sb.storage.from("payment-slips").remove(f.map((x) => `${id}/${x.name}`));
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
    .select("booking_status, payment_status, total_amount, paid_amount, hold_expires_at, metadata")
    .eq("id", id)
    .single();
  return data as { booking_status: string; payment_status: string; total_amount: number; paid_amount: number; hold_expires_at: string | null; metadata: Record<string, any> };
}

async function main() {
  pure();
  const live = await getPublicRoomConfig();
  const CFG: PublicRoomConfig = {
    ...live,
    enabled: true, booking_enabled: true, booking_days_ahead: 60, min_duration_minutes: 60, max_duration_minutes: 480,
    liff_id: "1234567890-E2ETEST",
    pricing: { ...live.pricing, quote_required: true },
    payment_enabled: true,
  };
  await purge();

  console.log("\n— request: estimate with VAT / WHT / OT, nothing to pay yet");
  sent.length = 0;
  pushed.length = 0;
  const r = await createPublicBooking(
    {
      roomId: MEETING, date: DAY, startTime: "17:00", durationMinutes: 180, name: NAME, phone: "0990000301",
      company: null, attendees: 12, note: "ขอจัดโต๊ะแบบห้องเรียน", channel: "line", ip: null, lineAccessToken: "tok-Uquote1",
      doc: { company: "บริษัท ทดสอบ จำกัด", taxId: "0105551234567", branch: "สำนักงานใหญ่", address: "1 ถนนทดสอบ กรุงเทพฯ", withholding: true },
    },
    CFG,
  );
  ok("request accepted", r.ok, JSON.stringify(r));
  if (!r.ok) throw new Error("stop");
  created.add(r.bookingId);
  ok("stage requested, nothing due now", r.stage === "requested" && r.amountDue === 0);
  ok("estimate has OT line", r.pricing.lines.some((l) => l.label.includes("OT")) === (live.pricing.ot_enabled && live.pricing.ot_value > 0));
  ok("WHT applied for juristic customer", r.pricing.withholding === live.pricing.wht_enabled && (r.pricing.withholding ? r.pricing.netPayable < r.pricing.grandTotal : true));
  let b = await row(r.bookingId);
  ok("booking total = grand total incl. VAT", near(Number(b.total_amount), r.pricing.grandTotal));
  const holdH = (new Date(b.hold_expires_at!).getTime() - Date.now()) / 3_600_000;
  ok("room held ≈ request_hold_hours", Math.abs(holdH - live.pricing.request_hold_hours) < 0.2, holdH.toFixed(2));
  ok("doc info stored", b.metadata.public?.doc?.taxId === "0105551234567");
  const { data: cust } = await sb.from("customers").select("tax_id, billing_address").eq("phone", "0990000301").limit(1).maybeSingle();
  ok("customer tax id saved", (cust as any)?.tax_id === "0105551234567");
  const tg = sent.find((s) => s.kind === "telegram:booking.public");
  ok("telegram: request with breakdown + doc", Boolean(tg && String(tg.payload).includes("รอออกใบเสนอราคา") && String(tg.payload).includes("0105551234567") && String(tg.payload).includes("หัก ณ ที่จ่าย")));
  ok("LINE 'ได้รับคำขอจอง' pushed", pushed.some((p) => p.to === "Uquote1" && JSON.stringify(p.messages).includes("ได้รับคำขอจอง")));
  const early = await submitSlip({ reference: r.reference, token: r.token, bytes: PNG, mime: "image/png", filename: "s.png" });
  ok("paying before a quotation is refused", !early.ok && early.message.includes("ใบเสนอราคา"), JSON.stringify(early));
  ok("accepting before a quotation is refused", !(await acceptQuotation(r.bookingId)).ok);

  console.log("\n— admin issues a quotation (edited lines + discount)");
  pushed.length = 0;
  const adminId = await anyAdmin();
  const q = await issueQuotation({
    bookingId: r.bookingId,
    lines: [
      { label: "ค่าห้อง MEETING ROOM 3 ชม.", qty: 3, unitPrice: 600 },
      { label: "ค่า OT หลัง 18:00", qty: 2, unitPrice: 100 },
      { label: "อาหารว่าง", qty: 12, unitPrice: 50 },
    ],
    discount: 100,
    withholding: true,
    validHours: 48,
    note: "รวมน้ำดื่ม",
    actorId: adminId!,
    actorName: "E2E",
  });
  ok("quotation issued", q.ok && q.number === `QT-${r.reference.replace(/^BK/, "")}`, JSON.stringify(q));
  b = await row(r.bookingId);
  const quote = b.metadata.public.quote;
  const expected = totalsFromLines(
    [{ label: "a", amount: 1800 }, { label: "b", amount: 200 }, { label: "c", amount: 600 }],
    100,
    live.pricing,
    live.pricing.wht_enabled,
  );
  ok("stage quoted, totals match maths", b.metadata.public.stage === "quoted" && near(quote.breakdown.grandTotal, expected.grandTotal) && near(Number(b.total_amount), expected.grandTotal));
  ok("hold moved to quote validity", Math.abs(new Date(b.hold_expires_at!).getTime() - new Date(quote.validUntil).getTime()) < 1000);
  ok("LINE quotation card pushed", pushed.some((p) => JSON.stringify(p.messages).includes("ใบเสนอราคา")));
  const q2 = await issueQuotation({ bookingId: r.bookingId, lines: quote.lines, discount: 0, withholding: true, validHours: 48, note: null, actorId: adminId!, actorName: "E2E" });
  ok("re-issue makes revision R2", q2.ok && q2.number?.endsWith("-R2"));

  console.log("\n— customer accepts and pays");
  sent.length = 0;
  const acc = await acceptQuotation(r.bookingId, CFG);
  ok("accepted", acc.ok, JSON.stringify(acc));
  b = await row(r.bookingId);
  ok("stage accepted", b.metadata.public.stage === "accepted" && Boolean(b.metadata.public.quote.acceptedAt));
  ok("team told", sent.some((s) => s.kind === "telegram:booking.public" && String(s.payload).includes("ยืนยันใบเสนอราคา")));
  const setup = await getPaymentSetup(CFG);
  if (acc.mode === "online") {
    const net = b.metadata.public.quote.breakdown.netPayable;
    ok("deposit computed from net payable (after WHT)", acc.amountDue === Math.ceil((net * setup.depositPercent) / 100) || (setup.mode === "full" && acc.amountDue === Math.round(net)));
    const digits = setup.banks[0].account_number.replace(/\D/g, "");
    __queue({
      ok: true, status: 200,
      data: { transRef: `E2EQ${Date.now()}`, date: new Date().toISOString(), amount: { amount: acc.amountDue! },
        receiver: { account: { bank: { account: digits.slice(0, -4).replace(/\d/g, "x") + digits.slice(-4) } } } },
    });
    const paid = await submitSlip({ reference: r.reference, token: r.token, bytes: PNG, mime: "image/png", filename: "s.png", cfg: CFG });
    ok("slip verified → booking confirmed", paid.ok && (await row(r.bookingId)).booking_status === "confirmed", JSON.stringify(paid));
  } else {
    ok("manual mode: slip via LINE, nothing due online", acc.amountDue === 0);
  }
  ok("accepting twice is harmless", (await acceptQuotation(r.bookingId, CFG)).ok);
  ok("online branch exercised", acc.mode === "online");

  console.log("\n— rejection and expiry");
  const r2 = await createPublicBooking(
    { roomId: MEETING, date: DAY, startTime: "09:00", durationMinutes: 60, name: NAME, phone: "0990000302", channel: "qr", ip: null, lineAccessToken: "tok-Uquote2" },
    CFG,
  );
  if (!r2.ok) throw new Error("r2");
  created.add(r2.bookingId);
  pushed.length = 0;
  const rej = await rejectRequest({ bookingId: r2.bookingId, reason: "ห้องปิดปรับปรุงวันนั้น", actorName: "E2E" });
  ok("reject ok", rej.ok && (await row(r2.bookingId)).booking_status === "cancelled");
  ok("customer told why", pushed.some((p) => p.to === "Uquote2" && JSON.stringify(p.messages).includes("ปิดปรับปรุง")));

  const r3 = await createPublicBooking(
    { roomId: MEETING, date: DAY, startTime: "11:00", durationMinutes: 60, name: NAME, phone: "0990000303", channel: "qr", ip: null },
    CFG,
  );
  if (!r3.ok) throw new Error("r3");
  created.add(r3.bookingId);
  await issueQuotation({ bookingId: r3.bookingId, lines: [{ label: "ค่าห้อง", qty: 1, unitPrice: 600 }], discount: 0, withholding: false, validHours: 24, note: null, actorId: adminId!, actorName: "E2E" });
  const m = (await row(r3.bookingId)).metadata;
  m.public.quote.validUntil = new Date(Date.now() - 60_000).toISOString();
  await sb.from("bookings").update({ metadata: m } as never).eq("id", r3.bookingId);
  const late = await acceptQuotation(r3.bookingId);
  ok("expired quotation can't be accepted", !late.ok && (late.message ?? "").includes("หมดอายุ"));
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
    const { count } = await sb.from("bookings").select("id, customer:customers!inner(display_name)", { count: "exact", head: true }).eq("customer.display_name", NAME);
    console.log(`\ncleanup: ${count ?? 0} test bookings left`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
