/**
 * Over-quota billing: live month figures per company, invoices, and the
 * checks that keep the two honest. Server-only; the maths lives in
 * src/lib/billing/overage.ts.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import {
  computeOverage,
  currentPeriod,
  periodRange,
  type OverageBooking,
  type OverageLine,
  type OverageResult,
} from "@/lib/billing/overage";
import { bkkDate } from "@/lib/time/bkk";

export interface BillTo {
  name: string;
  taxId: string;
  branch: string;
  address: string;
  email: string;
}

export interface OrgMonth extends OverageResult {
  orgId: string;
  orgName: string;
  orgStatus: string;
  logoUrl: string | null;
  brandColor: string | null;
  billTo: BillTo;
}

export interface InvoiceLine {
  bookingId: string;
  reference: string;
  date: string;
  start: string;
  end: string;
  roomName: string;
  memberName: string;
  title: string;
  status: string;
  hours: number;
  freeHours: number;
  chargedHours: number;
  rate: number;
  amount: number;
}

export interface OrgInvoice {
  id: string;
  invoiceNo: string;
  orgId: string;
  orgName: string;
  period: string;
  status: "issued" | "sent" | "partial" | "paid" | "void";
  quotaHours: number;
  usedHours: number;
  overHours: number;
  subtotal: number;
  vatRate: number;
  vatInclusive: boolean;
  preVat: number;
  vatAmount: number;
  grandTotal: number;
  whtRate: number;
  whtAmount: number;
  netPayable: number;
  paidAmount: number;
  lines: InvoiceLine[];
  billTo: BillTo;
  issuer: { name: string; legal_name: string; tax_id: string; address: string; phone: string; email: string };
  dueDate: string | null;
  notes: string | null;
  issuedByName: string | null;
  issuedAt: string;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  replacesId: string | null;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  paidOn: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface InvoiceEvent {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

const num = (v: unknown) => Number(v ?? 0);

/** Quota and billing details kept in settings `org.<id>.meta`. */
async function orgMeta(orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, Record<string, unknown>>();
  const { data } = await createSupabaseAdminClient()
    .from("settings")
    .select("key, value")
    .in("key", orgIds.map((id) => `org.${id}.meta`));
  return new Map(
    ((data ?? []) as Array<{ key: string; value: Record<string, unknown> | null }>).map((r) => [
      r.key.slice(4, -5),
      r.value ?? {},
    ]),
  );
}

function quotaFrom(meta: Record<string, unknown>) {
  const hours = typeof meta.quota_hours_monthly === "number" && meta.quota_hours_monthly >= 0 ? meta.quota_hours_monthly : 40;
  return { hours, unlimited: meta.quota_unlimited === true };
}

function billToFrom(
  org: { name: string; contact_email: string | null },
  meta: Record<string, unknown>,
): BillTo {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  return {
    name: s("billing_name") || org.name,
    taxId: s("tax_id"),
    branch: s("billing_branch"),
    address: s("billing_address"),
    email: s("billing_email") || org.contact_email || "",
  };
}

type OrgRow = {
  id: string;
  name: string;
  status: string;
  logo_url: string | null;
  brand_color: string | null;
  contact_email: string | null;
};

async function bookingsFor(orgIds: string[], period: string) {
  const { start, end } = periodRange(period);
  const { data } = await createSupabaseAdminClient()
    .from("bookings")
    .select(
      "id, org_id, reference_code, starts_at, ends_at, booking_status, internal_title, created_at, updated_at, room:rooms(id, name, hourly_rate), member:members(full_name)",
    )
    .in("org_id", orgIds)
    .gte("starts_at", start)
    .lt("starts_at", end);
  return (data ?? []) as unknown as Array<{
    id: string;
    org_id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    internal_title: string | null;
    created_at: string;
    updated_at: string;
    room: { id: string; name: string; hourly_rate: number } | null;
    member: { full_name: string } | null;
  }>;
}

/** Live figures for every company in a month (or just the ones asked for). */
export async function listOrgMonths(period: string, onlyOrgId?: string): Promise<OrgMonth[]> {
  let q = createSupabaseAdminClient()
    .from("organizations")
    .select("id, name, status, logo_url, brand_color, contact_email")
    .order("name");
  if (onlyOrgId) q = q.eq("id", onlyOrgId);
  const { data: orgData } = await q;
  const orgs = (orgData ?? []) as OrgRow[];
  const ids = orgs.map((o) => o.id);
  const [meta, rows] = await Promise.all([orgMeta(ids), ids.length ? bookingsFor(ids, period) : Promise.resolve([])]);

  return orgs.map((o) => {
    const m = meta.get(o.id) ?? {};
    const bookings: OverageBooking[] = rows
      .filter((r) => r.org_id === o.id)
      .map((r) => ({
        id: r.id,
        reference: r.reference_code,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.booking_status,
        roomId: r.room?.id ?? "",
        roomName: r.room?.name ?? "-",
        rate: num(r.room?.hourly_rate),
        memberName: r.member?.full_name ?? "-",
        title: r.internal_title ?? "",
        createdAt: r.created_at,
      }));
    return {
      orgId: o.id,
      orgName: o.name,
      orgStatus: o.status,
      logoUrl: o.logo_url,
      brandColor: o.brand_color,
      billTo: billToFrom(o, m),
      ...computeOverage(bookings, quotaFrom(m)),
    };
  });
}

export async function getOrgMonth(orgId: string, period: string): Promise<OrgMonth | null> {
  return (await listOrgMonths(period, orgId))[0] ?? null;
}

/** Latest change to any booking of the company in the month — for the "changed after invoicing" check. */
export async function lastBookingChange(orgId: string, period: string): Promise<string | null> {
  const { start, end } = periodRange(period);
  const { data } = await createSupabaseAdminClient()
    .from("bookings")
    .select("updated_at")
    .eq("org_id", orgId)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { updated_at?: string } | null)?.updated_at ?? null;
}

export function toInvoiceLines(lines: OverageLine[]): InvoiceLine[] {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  return lines.map((l) => ({
    bookingId: l.id,
    reference: l.reference,
    date: bkkDate(l.startsAt),
    start: t(l.startsAt),
    end: t(l.endsAt),
    roomName: l.roomName,
    memberName: l.memberName,
    title: l.title,
    status: l.status,
    hours: l.hours,
    freeHours: l.freeHours,
    chargedHours: l.chargedHours,
    rate: l.rate,
    amount: l.amount,
  }));
}

// ─── Invoices ─────────────────────────────────────────────────────────────

type InvoiceRow = Record<string, unknown> & { organization?: { name: string } | null };

function mapInvoice(r: InvoiceRow): OrgInvoice {
  return {
    id: r.id as string,
    invoiceNo: r.invoice_no as string,
    orgId: r.org_id as string,
    orgName: r.organization?.name ?? (r.bill_to as BillTo)?.name ?? "",
    period: r.period as string,
    status: r.status as OrgInvoice["status"],
    quotaHours: num(r.quota_hours),
    usedHours: num(r.used_hours),
    overHours: num(r.over_hours),
    subtotal: num(r.subtotal),
    vatRate: num(r.vat_rate),
    vatInclusive: r.vat_inclusive as boolean,
    preVat: num(r.pre_vat),
    vatAmount: num(r.vat_amount),
    grandTotal: num(r.grand_total),
    whtRate: num(r.wht_rate),
    whtAmount: num(r.wht_amount),
    netPayable: num(r.net_payable),
    paidAmount: num(r.paid_amount),
    lines: (r.lines ?? []) as InvoiceLine[],
    billTo: r.bill_to as BillTo,
    issuer: r.issuer as OrgInvoice["issuer"],
    dueDate: (r.due_date as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    issuedByName: (r.issued_by_name as string | null) ?? null,
    issuedAt: r.issued_at as string,
    sentAt: (r.sent_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    voidedAt: (r.voided_at as string | null) ?? null,
    voidReason: (r.void_reason as string | null) ?? null,
    replacesId: (r.replaces_id as string | null) ?? null,
  };
}

const INVOICE_SELECT = "*, organization:organizations(name)";

/** Null when the billing tables have not been created yet (migration 17). */
export async function listInvoices(filter: { period?: string; orgId?: string } = {}): Promise<OrgInvoice[] | null> {
  let q = createSupabaseAdminClient().from("org_invoices" as never).select(INVOICE_SELECT).order("issued_at", { ascending: false });
  if (filter.period) q = q.eq("period", filter.period);
  if (filter.orgId) q = q.eq("org_id", filter.orgId);
  const { data, error } = await q;
  if (error) return null;
  return ((data ?? []) as InvoiceRow[]).map(mapInvoice);
}

export async function getInvoice(id: string): Promise<{
  invoice: OrgInvoice;
  payments: InvoicePayment[];
  events: InvoiceEvent[];
} | null> {
  const sb = createSupabaseAdminClient();
  const [{ data: inv }, { data: pays }, { data: evs }] = await Promise.all([
    sb.from("org_invoices" as never).select(INVOICE_SELECT).eq("id", id).maybeSingle(),
    sb.from("org_invoice_payments" as never).select("*").eq("invoice_id", id).order("paid_on"),
    sb.from("org_invoice_events" as never).select("*").eq("invoice_id", id).order("created_at"),
  ]);
  if (!inv) return null;
  return {
    invoice: mapInvoice(inv as InvoiceRow),
    payments: ((pays ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      amount: num(p.amount),
      paidOn: p.paid_on as string,
      method: p.method as string,
      reference: (p.reference as string | null) ?? null,
      notes: (p.notes as string | null) ?? null,
      recordedByName: (p.recorded_by_name as string | null) ?? null,
      createdAt: p.created_at as string,
    })),
    events: ((evs ?? []) as Array<Record<string, unknown>>).map((e) => ({
      id: e.id as string,
      action: e.action as string,
      detail: (e.detail as Record<string, unknown> | null) ?? null,
      actorName: (e.actor_name as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
  };
}

// ─── Checks ───────────────────────────────────────────────────────────────

export type CheckLevel = "error" | "warn" | "info";
export interface BillingCheck {
  level: CheckLevel;
  orgId?: string;
  invoiceId?: string;
  title: string;
  detail: string;
}

/**
 * Everything that should make someone look twice before money changes
 * hands. Runs on every dashboard load, so problems surface on their own.
 */
export async function runBillingChecks(
  period: string,
  months: OrgMonth[],
  invoices: OrgInvoice[],
): Promise<BillingCheck[]> {
  const out: BillingCheck[] = [];
  const ended = period < currentPeriod();
  const today = bkkDate(new Date());
  const live = invoices.filter((i) => i.status !== "void");

  for (const m of months) {
    const inv = live.find((i) => i.orgId === m.orgId && i.period === period);
    if (inv) {
      if (Math.abs(inv.subtotal - m.amount) >= 0.01 || Math.abs(inv.overHours - m.overHours) >= 0.01) {
        out.push({
          level: "error",
          orgId: m.orgId,
          invoiceId: inv.id,
          title: `${m.orgName}: ยอดในใบแจ้งหนี้ไม่ตรงกับการจองล่าสุด`,
          detail: `ใบ ${inv.invoiceNo} คิด ${inv.overHours} ชม. ${inv.subtotal.toLocaleString()} บาท แต่ตอนนี้คำนวณได้ ${m.overHours} ชม. ${m.amount.toLocaleString()} บาท มีการจองถูกแก้หลังออกใบ ควรยกเลิกใบนี้แล้วออกใหม่`,
        });
      } else {
        const changed = await lastBookingChange(m.orgId, period);
        if (changed && changed > inv.issuedAt) {
          out.push({
            level: "info",
            orgId: m.orgId,
            invoiceId: inv.id,
            title: `${m.orgName}: มีการแก้การจองหลังออกใบ ${inv.invoiceNo}`,
            detail: "ยอดเงินยังตรงกันอยู่ ไม่ต้องทำอะไร แจ้งไว้เพื่อให้ตรวจย้อนได้",
          });
        }
      }
    } else if (ended && m.amount > 0) {
      out.push({
        level: "warn",
        orgId: m.orgId,
        title: `${m.orgName}: เดือนนี้จบแล้วแต่ยังไม่ได้ออกใบแจ้งหนี้`,
        detail: `ใช้เกิน ${m.overHours} ชม. ยอด ${m.amount.toLocaleString()} บาท`,
      });
    }

    const noRate = m.lines.filter((l) => l.chargedHours > 0 && l.rate <= 0);
    if (noRate.length) {
      out.push({
        level: "error",
        orgId: m.orgId,
        title: `${m.orgName}: มีห้องที่ไม่ได้ตั้งราคาต่อชั่วโมง`,
        detail: `${[...new Set(noRate.map((l) => l.roomName))].join(", ")} ถูกคิด 0 บาท ตั้งราคาห้องก่อนออกใบแจ้งหนี้`,
      });
    }
    if (m.amount > 0 && (!m.billTo.taxId || !m.billTo.address)) {
      out.push({
        level: "warn",
        orgId: m.orgId,
        title: `${m.orgName}: ข้อมูลออกใบแจ้งหนี้ยังไม่ครบ`,
        detail: [!m.billTo.taxId && "ไม่มีเลขผู้เสียภาษี", !m.billTo.address && "ไม่มีที่อยู่"].filter(Boolean).join(" · ") + " กรอกได้ตอนออกใบแจ้งหนี้",
      });
    }
  }

  for (const inv of live) {
    const due = inv.netPayable - inv.paidAmount;
    if (inv.dueDate && inv.dueDate < today && due > 0.009) {
      out.push({
        level: "warn",
        orgId: inv.orgId,
        invoiceId: inv.id,
        title: `${inv.orgName}: ใบ ${inv.invoiceNo} เลยกำหนดชำระ`,
        detail: `ครบกำหนด ${inv.dueDate} ยังค้าง ${due.toLocaleString()} บาท`,
      });
    }
    if (inv.paidAmount - inv.netPayable > 0.009) {
      out.push({
        level: "error",
        orgId: inv.orgId,
        invoiceId: inv.id,
        title: `${inv.orgName}: ใบ ${inv.invoiceNo} รับเงินเกินยอด`,
        detail: `รับแล้ว ${inv.paidAmount.toLocaleString()} บาท จากยอด ${inv.netPayable.toLocaleString()} บาท`,
      });
    }
  }

  const order: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
