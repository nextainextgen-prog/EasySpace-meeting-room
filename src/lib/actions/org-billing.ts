"use server";

/**
 * Invoices for hours over a company's monthly quota. Every write is checked
 * against the live booking figures, recorded on the invoice's own trail
 * (org_invoice_events) and in the system audit log.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/actions/audit";
import { currentPeriod, periodLabel, periodLastDay } from "@/lib/billing/overage";
import { totalsFromLines } from "@/lib/public-booking/pricing";
import { getCompanyProfile, getPublicRoomConfig } from "@/lib/data/public-rooms";
import { getInvoice, getOrgMonth, toInvoiceLines } from "@/lib/server/org-billing";
import { sendEmail } from "@/lib/email";
import { dispatchEvent } from "@/lib/server/notifications";
import { addDays, bkkDate } from "@/lib/time/bkk";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const PATH = "/admin/orgs/billing";

async function event(invoiceId: string, action: string, actor: { id: string; full_name: string | null; email: string }, detail?: Record<string, unknown>) {
  await createSupabaseAdminClient()
    .from("org_invoice_events" as never)
    .insert({ invoice_id: invoiceId, action, detail: detail ?? null, actor_id: actor.id, actor_name: actor.full_name || actor.email } as never);
}

// ─── Issue ────────────────────────────────────────────────────────────────

const IssueSchema = z.object({
  orgId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  billTo: z.object({
    name: z.string().trim().min(1).max(200),
    taxId: z.string().trim().max(20).default(""),
    branch: z.string().trim().max(60).default(""),
    address: z.string().trim().max(500).default(""),
    email: z.string().trim().max(200).default(""),
  }),
  dueDays: z.number().int().min(0).max(120).default(15),
  withholding: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
  /** The amount the admin saw on screen — refuse if bookings moved since. */
  expectedAmount: z.number(),
  /** Set when reissuing after a void. */
  replacesId: z.string().uuid().optional(),
});

export async function issueOrgInvoice(raw: z.input<typeof IssueSchema>): Promise<Result<{ id: string; invoiceNo: string }>> {
  const me = await requireRole("accountant");
  const parsed = IssueSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ครบ" };
  const input = parsed.data;
  if (input.period >= currentPeriod()) return { ok: false, error: "ออกใบแจ้งหนี้ได้เมื่อเดือนนั้นจบแล้ว" };

  const month = await getOrgMonth(input.orgId, input.period);
  if (!month) return { ok: false, error: "ไม่พบบริษัท" };
  if (month.amount <= 0) return { ok: false, error: "เดือนนี้บริษัทนี้ไม่ได้ใช้เกินโควตา" };
  if (Math.abs(month.amount - input.expectedAmount) >= 0.01) {
    return { ok: false, error: `ยอดเปลี่ยนเป็น ${month.amount.toLocaleString()} บาทระหว่างที่เปิดหน้านี้ โหลดหน้าใหม่แล้วตรวจอีกครั้ง` };
  }
  const noRate = month.lines.some((l) => l.chargedHours > 0 && l.rate <= 0);
  if (noRate) return { ok: false, error: "มีห้องที่ยังไม่ได้ตั้งราคาต่อชั่วโมง" };

  const sb = createSupabaseAdminClient();
  const { data: live } = await sb
    .from("org_invoices" as never)
    .select("id, invoice_no")
    .eq("org_id", input.orgId)
    .eq("period", input.period)
    .neq("status", "void")
    .maybeSingle();
  if (live) return { ok: false, error: `บริษัทนี้มีใบแจ้งหนี้เดือนนี้แล้ว (${(live as { invoice_no: string }).invoice_no})` };

  const [cfg, company] = await Promise.all([getPublicRoomConfig(), getCompanyProfile()]);
  const charged = month.lines.filter((l) => l.chargedHours > 0);
  const totals = totalsFromLines(
    charged.map((l) => ({ label: l.roomName, amount: l.amount, qty: l.chargedHours, unitPrice: l.rate })),
    0,
    cfg.pricing,
    input.withholding,
  );

  const prefix = `INV-${input.period.replace("-", "")}-`;
  // Due N days after month end — or after today when billing a month late.
  const today = bkkDate(new Date());
  const lastDay = periodLastDay(input.period);
  const dueDate = addDays(lastDay < today ? today : lastDay, input.dueDays);

  // Running number per month; the unique constraint settles any race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count } = await sb
      .from("org_invoices" as never)
      .select("id", { count: "exact", head: true })
      .like("invoice_no", `${prefix}%`);
    const invoiceNo = `${prefix}${String((count ?? 0) + 1 + attempt).padStart(4, "0")}`;
    const { data, error } = await sb
      .from("org_invoices" as never)
      .insert({
        invoice_no: invoiceNo,
        org_id: input.orgId,
        period: input.period,
        status: "issued",
        quota_hours: month.quotaHours,
        used_hours: month.usedHours,
        over_hours: month.overHours,
        subtotal: totals.subtotal,
        vat_rate: totals.vatEnabled ? totals.vatRate : 0,
        vat_inclusive: totals.vatInclusive,
        pre_vat: totals.preVat,
        vat_amount: totals.vat,
        grand_total: totals.grandTotal,
        wht_rate: totals.withholding ? totals.whtRate : 0,
        wht_amount: totals.wht,
        net_payable: totals.netPayable,
        lines: toInvoiceLines(month.lines),
        bill_to: input.billTo,
        issuer: company,
        due_date: dueDate,
        notes: input.notes || null,
        issued_by: me.id,
        issued_by_name: me.full_name || me.email,
        replaces_id: input.replacesId ?? null,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505" && /invoice_no/.test(error.message)) continue;
      if (error.code === "23505") return { ok: false, error: "บริษัทนี้มีใบแจ้งหนี้เดือนนี้แล้ว" };
      if (error.code === "42P01") return { ok: false, error: "ยังไม่ได้สร้างตารางใบแจ้งหนี้ในฐานข้อมูล" };
      return { ok: false, error: "บันทึกไม่สำเร็จ" };
    }
    const id = (data as { id: string }).id;

    // Remember the billing details for next month.
    const { data: metaRow } = await sb.from("settings").select("value").eq("key", `org.${input.orgId}.meta`).maybeSingle();
    const meta = ((metaRow as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
    await sb.from("settings").upsert(
      {
        key: `org.${input.orgId}.meta`,
        value: {
          ...meta,
          billing_name: input.billTo.name,
          tax_id: input.billTo.taxId,
          billing_branch: input.billTo.branch,
          billing_address: input.billTo.address,
          billing_email: input.billTo.email,
        } as never,
        category: "organizations",
      } as never,
      { onConflict: "key" },
    );

    await event(id, input.replacesId ? "reissued" : "issued", me, {
      invoiceNo,
      overHours: month.overHours,
      subtotal: totals.subtotal,
      netPayable: totals.netPayable,
      bookings: charged.length,
      replacesId: input.replacesId ?? null,
    });
    await recordAudit({
      action: "org_invoice_issued",
      targetType: "org_invoice",
      targetId: id,
      changes: { invoiceNo, orgId: input.orgId, period: input.period, netPayable: totals.netPayable },
    });
    void dispatchEvent(
      "outstanding.alert",
      `<b>ออกใบแจ้งหนี้ใช้เกินโควตา</b>\n${invoiceNo} · ${month.orgName}\n${periodLabel(input.period)} · เกิน ${month.overHours} ชม.\nยอดชำระ ${totals.netPayable.toLocaleString()} บาท · ครบกำหนด ${dueDate}`,
    );
    revalidatePath(PATH);
    return { ok: true, id, invoiceNo };
  }
  return { ok: false, error: "ออกเลขที่ใบแจ้งหนี้ไม่สำเร็จ ลองอีกครั้ง" };
}

// ─── Send ─────────────────────────────────────────────────────────────────

const SendSchema = z.object({ id: z.string().uuid(), to: z.string().trim().email(), viaEmail: z.boolean().default(true) });

export async function sendOrgInvoice(raw: z.input<typeof SendSchema>): Promise<Result> {
  const me = await requireRole("accountant");
  const parsed = SendSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "อีเมลไม่ถูกต้อง" };
  const found = await getInvoice(parsed.data.id);
  if (!found) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };
  const inv = found.invoice;
  if (inv.status === "void") return { ok: false, error: "ใบนี้ถูกยกเลิกแล้ว" };

  if (parsed.data.viaEmail) {
    try {
      await sendEmail({
        to: parsed.data.to,
        subject: `ใบแจ้งหนี้ ${inv.invoiceNo} ค่าใช้ห้องประชุมเกินโควตา ${periodLabel(inv.period)}`,
        html: invoiceEmailHtml(inv),
        replyTo: inv.issuer.email || undefined,
      });
    } catch {
      return { ok: false, error: "ส่งอีเมลไม่สำเร็จ ตรวจการตั้งค่าอีเมลของระบบ" };
    }
  }
  const sb = createSupabaseAdminClient();
  await sb
    .from("org_invoices" as never)
    .update({
      sent_at: new Date().toISOString(),
      status: inv.status === "issued" ? "sent" : inv.status,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", inv.id);
  await event(inv.id, "sent", me, { to: parsed.data.to, viaEmail: parsed.data.viaEmail });
  await recordAudit({ action: "org_invoice_sent", targetType: "org_invoice", targetId: inv.id, changes: { to: parsed.data.to, viaEmail: parsed.data.viaEmail } });
  revalidatePath(PATH);
  return { ok: true };
}

function invoiceEmailHtml(inv: Awaited<ReturnType<typeof getInvoice>> extends infer R ? (R extends { invoice: infer I } ? I : never) : never) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = inv.lines
    .filter((l) => l.chargedHours > 0)
    .map(
      (l) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.date)} ${esc(l.start)}–${esc(l.end)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.roomName)}<br><span style="color:#888">${esc(l.memberName)} · ${esc(l.reference)}</span></td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${l.chargedHours} ชม. × ${baht(l.rate)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${baht(l.amount)}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:sans-serif;font-size:14px;color:#1a1a1a;max-width:640px">
<p>เรียน ${esc(inv.billTo.name)}</p>
<p>${esc(inv.issuer.legal_name || inv.issuer.name)} ขอแจ้งค่าใช้ห้องประชุมส่วนที่เกินโควตาประจำเดือน ${periodLabel(inv.period)}<br>
โควตา ${inv.quotaHours} ชม. · ใช้จริง ${inv.usedHours} ชม. · เกิน ${inv.overHours} ชม.</p>
<p><b>ใบแจ้งหนี้เลขที่ ${esc(inv.invoiceNo)}</b>${inv.dueDate ? ` · ครบกำหนดชำระ ${esc(inv.dueDate)}` : ""}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>
<table style="margin-top:12px;margin-left:auto;font-size:13px">
<tr><td style="padding:2px 8px">รวม</td><td style="padding:2px 8px;text-align:right">${baht(inv.subtotal)}</td></tr>
${inv.vatRate ? `<tr><td style="padding:2px 8px">VAT ${inv.vatRate}% ${inv.vatInclusive ? "(รวมในราคาแล้ว)" : ""}</td><td style="padding:2px 8px;text-align:right">${baht(inv.vatAmount)}</td></tr>` : ""}
${inv.whtAmount ? `<tr><td style="padding:2px 8px">หัก ณ ที่จ่าย ${inv.whtRate}%</td><td style="padding:2px 8px;text-align:right">-${baht(inv.whtAmount)}</td></tr>` : ""}
<tr><td style="padding:4px 8px"><b>ยอดชำระ</b></td><td style="padding:4px 8px;text-align:right"><b>${baht(inv.netPayable)} บาท</b></td></tr>
</table>
${inv.notes ? `<p style="color:#555">${esc(inv.notes)}</p>` : ""}
<p style="color:#555">${esc([inv.issuer.phone, inv.issuer.email].filter(Boolean).join(" · "))}</p>
</div>`;
}

// ─── Payments ─────────────────────────────────────────────────────────────

const PaySchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["cash", "bank_transfer", "promptpay", "qr", "credit_card"]),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function recordOrgInvoicePayment(raw: z.input<typeof PaySchema>): Promise<Result> {
  const me = await requireRole("accountant");
  const parsed = PaySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ครบ" };
  const p = parsed.data;
  const found = await getInvoice(p.id);
  if (!found) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };
  const inv = found.invoice;
  if (inv.status === "void") return { ok: false, error: "ใบนี้ถูกยกเลิกแล้ว" };
  const due = r2(inv.netPayable - inv.paidAmount);
  if (p.amount - due > 0.009) return { ok: false, error: `ยอดค้างเหลือ ${due.toLocaleString()} บาท ใส่เกินไม่ได้` };
  if (p.reference && found.payments.some((x) => x.reference && x.reference === p.reference)) {
    return { ok: false, error: "เลขอ้างอิงนี้บันทึกไปแล้ว" };
  }

  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("org_invoice_payments" as never).insert({
    invoice_id: inv.id,
    amount: p.amount,
    paid_on: p.paidOn,
    method: p.method,
    reference: p.reference || null,
    notes: p.notes || null,
    recorded_by: me.id,
    recorded_by_name: me.full_name || me.email,
  } as never);
  if (error) return { ok: false, error: "บันทึกไม่สำเร็จ" };

  const paid = r2(inv.paidAmount + p.amount);
  const full = paid >= inv.netPayable - 0.009;
  await sb
    .from("org_invoices" as never)
    .update({
      paid_amount: paid,
      status: full ? "paid" : "partial",
      paid_at: full ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", inv.id);
  await event(inv.id, "payment", me, { amount: p.amount, paidOn: p.paidOn, method: p.method, reference: p.reference ?? null, balance: r2(inv.netPayable - paid) });
  await recordAudit({ action: "org_invoice_payment", targetType: "org_invoice", targetId: inv.id, changes: { ...p, paidTotal: paid } });
  revalidatePath(PATH);
  return { ok: true };
}

// ─── Void ─────────────────────────────────────────────────────────────────

const VoidSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(300) });

export async function voidOrgInvoice(raw: z.input<typeof VoidSchema>): Promise<Result> {
  const me = await requireRole("admin");
  const parsed = VoidSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "ใส่เหตุผลที่ยกเลิก" };
  const found = await getInvoice(parsed.data.id);
  if (!found) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };
  if (found.invoice.status === "void") return { ok: false, error: "ใบนี้ถูกยกเลิกไปแล้ว" };
  if (found.invoice.paidAmount > 0) return { ok: false, error: "ใบนี้รับเงินแล้ว ยกเลิกไม่ได้ ติดต่อฝ่ายบัญชีเพื่อคืนเงินก่อน" };

  await createSupabaseAdminClient()
    .from("org_invoices" as never)
    .update({ status: "void", voided_at: new Date().toISOString(), void_reason: parsed.data.reason, updated_at: new Date().toISOString() } as never)
    .eq("id", parsed.data.id);
  await event(parsed.data.id, "void", me, { reason: parsed.data.reason });
  await recordAudit({ action: "org_invoice_voided", targetType: "org_invoice", targetId: parsed.data.id, changes: { invoiceNo: found.invoice.invoiceNo }, reason: parsed.data.reason });
  revalidatePath(PATH);
  return { ok: true };
}
