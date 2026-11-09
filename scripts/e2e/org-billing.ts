/**
 * End-to-end check of over-quota billing against the real database:
 * live figures → issue → refuse duplicates and stale amounts → a booking
 * changes → the check flags it → void → reissue → partial and full
 * payment (overpay and repeated references refused) → send.
 *
 * Everything runs on a throwaway company in January 2025, a month with no
 * real bookings, and is deleted in the finally block. E-mail and Telegram
 * are stubbed. Needs migration 17 (org_invoices).
 *
 *   npm run test:billing
 */

import { createClient } from "@supabase/supabase-js";
import { getOrgMonth, getInvoice, listInvoices, runBillingChecks } from "@/lib/server/org-billing";
import { issueOrgInvoice, recordOrgInvoicePayment, sendOrgInvoice, voidOrgInvoice } from "@/lib/actions/org-billing";
import { mailed } from "@/lib/email";
import { fromBkk } from "@/lib/time/bkk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const PERIOD = "2025-01";
const NAME = "E2E บริษัททดสอบใบแจ้งหนี้";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra: unknown = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${JSON.stringify(extra)}`));

let orgId = "";
const bookingIds: string[] = [];

async function main() {
  const { error: tableErr } = await sb.from("org_invoices").select("id").limit(1);
  if (tableErr) {
    console.log("org_invoices is missing — run supabase/migrations/00000000000017_org_overage_billing.sql first");
    process.exit(1);
  }
  const { data: prof } = await sb.from("profiles").select("id").limit(1).single();
  process.env.E2E_PROFILE_ID = (prof as { id: string }).id;
  const { data: rooms } = await sb.from("rooms").select("id, name, hourly_rate").eq("status", "active").order("display_order");
  const [r1, r2] = rooms as Array<{ id: string; name: string; hourly_rate: number }>;

  const { data: org } = await sb.from("organizations").insert({ name: NAME, status: "active" }).select("id").single();
  orgId = (org as { id: string }).id;
  await sb.from("settings").upsert({ key: `org.${orgId}.meta`, value: { quota_hours_monthly: 2 }, category: "organizations" }, { onConflict: "key" });

  // 2 h free, then 3 h + 2 h charged.
  const add = async (day: string, from: string, to: string, roomId: string, n: number) => {
    const { data, error } = await sb
      .from("bookings")
      .insert({
        reference_code: `E2EOB${Date.now().toString(36).toUpperCase()}${n}`,
        source: "internal",
        org_id: orgId,
        room_id: roomId,
        starts_at: fromBkk(day, from).toISOString(),
        ends_at: fromBkk(day, to).toISOString(),
        booking_status: n === 3 ? "no_show" : "completed",
        payment_status: "free",
        internal_title: "E2E",
      })
      .select("id")
      .single();
    if (error) throw error;
    bookingIds.push((data as { id: string }).id);
  };
  await add("2025-01-06", "09:00", "11:00", r1.id, 1);
  await add("2025-01-08", "09:00", "12:00", r1.id, 2);
  await add("2025-01-10", "13:00", "15:00", r2.id, 3);
  const expected = 3 * Number(r1.hourly_rate) + 2 * Number(r2.hourly_rate);

  console.log("live figures");
  const month = (await getOrgMonth(orgId, PERIOD))!;
  ok("used 7 h, over 5 h", month.usedHours === 7 && month.overHours === 5, month);
  ok("amount = 3 h × room 1 + 2 h × room 2 (no-show charged)", month.amount === expected, { amount: month.amount, expected });

  console.log("issue");
  const billTo = { name: NAME, taxId: "0000000000000", branch: "สำนักงานใหญ่", address: "ที่อยู่ทดสอบ", email: "e2e-billing@example.com" };
  const stale = await issueOrgInvoice({ orgId, period: PERIOD, billTo, expectedAmount: expected + 1 });
  ok("refused when the amount on screen is stale", !stale.ok);
  const first = await issueOrgInvoice({ orgId, period: PERIOD, billTo, expectedAmount: expected, dueDays: 15 });
  ok("issued", first.ok, first);
  if (!first.ok) return;
  ok("number INV-202501-####", /^INV-202501-\d{4}$/.test(first.invoiceNo), first.invoiceNo);
  const again = await issueOrgInvoice({ orgId, period: PERIOD, billTo, expectedAmount: expected });
  ok("second live invoice for the month refused", !again.ok);
  const inv1 = (await getInvoice(first.id))!;
  ok("snapshot has every booking, totals add up", inv1.invoice.lines.length === 3 && inv1.invoice.subtotal === expected, inv1.invoice);
  ok("net payable = grand total − WHT", Math.abs(inv1.invoice.netPayable - (inv1.invoice.grandTotal - inv1.invoice.whtAmount)) < 0.01);
  const { data: meta } = await sb.from("settings").select("value").eq("key", `org.${orgId}.meta`).single();
  ok("billing details remembered, quota kept", (meta as { value: Record<string, unknown> }).value.tax_id === "0000000000000" && (meta as { value: Record<string, unknown> }).value.quota_hours_monthly === 2);

  console.log("booking changes after issuing");
  await sb.from("bookings").update({ booking_status: "cancelled" }).eq("id", bookingIds[2]);
  const months = [(await getOrgMonth(orgId, PERIOD))!];
  const checks = await runBillingChecks(PERIOD, months, (await listInvoices({ orgId }))!);
  ok("check flags the mismatch", checks.some((c) => c.level === "error" && c.invoiceId === first.id), checks);

  console.log("void and reissue");
  ok("void needs a reason", !(await voidOrgInvoice({ id: first.id, reason: "" })).ok);
  ok("voided", (await voidOrgInvoice({ id: first.id, reason: "E2E booking cancelled" })).ok);
  const after = (await getOrgMonth(orgId, PERIOD))!;
  const second = await issueOrgInvoice({ orgId, period: PERIOD, billTo, expectedAmount: after.amount, replacesId: first.id });
  ok("reissued with the new amount", second.ok && after.amount === 3 * Number(r1.hourly_rate), { second, amount: after.amount });
  if (!second.ok) return;
  ok("new number", second.invoiceNo !== first.invoiceNo);
  const checks2 = await runBillingChecks(PERIOD, [after], (await listInvoices({ orgId }))!);
  ok("no error left", !checks2.some((c) => c.level === "error"), checks2);

  console.log("payments");
  const inv2 = (await getInvoice(second.id))!.invoice;
  const half = Math.round((inv2.netPayable / 2) * 100) / 100;
  ok("part payment", (await recordOrgInvoicePayment({ id: second.id, amount: half, paidOn: "2025-02-05", method: "bank_transfer", reference: "E2E-1" })).ok);
  ok("status partial", (await getInvoice(second.id))!.invoice.status === "partial");
  ok("same reference refused", !(await recordOrgInvoicePayment({ id: second.id, amount: 1, paidOn: "2025-02-05", method: "bank_transfer", reference: "E2E-1" })).ok);
  ok("overpay refused", !(await recordOrgInvoicePayment({ id: second.id, amount: inv2.netPayable, paidOn: "2025-02-06", method: "bank_transfer" })).ok);
  const rest = Math.round((inv2.netPayable - half) * 100) / 100;
  ok("rest paid", (await recordOrgInvoicePayment({ id: second.id, amount: rest, paidOn: "2025-02-06", method: "cash", reference: "E2E-2" })).ok);
  const paid = (await getInvoice(second.id))!;
  ok("status paid, balance 0", paid.invoice.status === "paid" && Math.abs(paid.invoice.paidAmount - paid.invoice.netPayable) < 0.01, paid.invoice);
  ok("paid invoice cannot be voided", !(await voidOrgInvoice({ id: second.id, reason: "test" })).ok);

  console.log("send and trail");
  ok("sent by e-mail", (await sendOrgInvoice({ id: second.id, to: "e2e-billing@example.com", viaEmail: true })).ok && mailed.some((m) => m.to === "e2e-billing@example.com"));
  const trail = (await getInvoice(second.id))!.events.map((e) => e.action);
  ok("trail: reissued, payment ×2, sent", JSON.stringify(trail) === JSON.stringify(["reissued", "payment", "payment", "sent"]), trail);
  ok("voided invoice keeps its trail", (await getInvoice(first.id))!.events.map((e) => e.action).join() === "issued,void");
}

main()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(async () => {
    if (orgId) {
      const { data: invs } = await sb.from("org_invoices").select("id").eq("org_id", orgId);
      const ids = ((invs ?? []) as Array<{ id: string }>).map((i) => i.id);
      if (ids.length) {
        await sb.from("org_invoice_events").delete().in("invoice_id", ids);
        await sb.from("org_invoice_payments").delete().in("invoice_id", ids);
        await sb.from("org_invoices").update({ replaces_id: null }).in("id", ids);
        await sb.from("org_invoices").delete().in("id", ids);
        await sb.from("audit_log").delete().eq("target_type", "org_invoice").in("target_id", ids);
      }
      if (bookingIds.length) await sb.from("bookings").delete().in("id", bookingIds);
      await sb.from("settings").delete().eq("key", `org.${orgId}.meta`);
      await sb.from("organizations").delete().eq("id", orgId);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
