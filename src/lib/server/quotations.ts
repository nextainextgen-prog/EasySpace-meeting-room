/**
 * Request → quotation → acceptance for online bookings.
 *
 *   requested  customer sent a request (room held for request_hold_hours)
 *   quoted     admin issued a quotation (room held until it expires)
 *   accepted   customer accepted — now pays (online slip or slip via LINE)
 *   (paid)     booking_status → confirmed by applyPayment / admin
 *
 * Everything lives on the booking (metadata.public) — the quotation number
 * is derived from the booking reference, so it's unique without a counter.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getPublicRoomConfig, publicBaseUrl } from "@/lib/data/public-rooms";
import { createInAppNotification, dispatchEvent } from "@/lib/server/notifications";
import { sendBookingLine } from "@/lib/server/booking-line";
import { restoreDisplacedFor, type PublicMeta, type PublicQuotation } from "@/lib/server/public-booking";
import { getPaymentSetup } from "@/lib/server/payment-slips";
import { amountDueNow } from "@/lib/public-booking/payment";
import { totalsFromLines, type PriceLine } from "@/lib/public-booking/pricing";
import { escapeHtml } from "@/lib/integrations/telegram";
import { formatBaht } from "@/lib/format";
import { bkkDateLabel, bkkTime } from "@/lib/time/bkk";

const ACTIVE = ["pending", "confirmed", "in_use"];

export interface RequestRow {
  id: string;
  reference_code: string;
  booking_status: string;
  payment_status: string;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  total_amount: number;
  paid_amount: number;
  hold_expires_at: string | null;
  notes: string | null;
  created_at: string;
  metadata: { public?: PublicMeta } | null;
  room: { id: string; name: string; hourly_rate: number } | null;
  customer: { display_name: string; phone: string | null; email: string | null; company_name: string | null } | null;
}

const SELECT = `id, reference_code, booking_status, payment_status, starts_at, ends_at, attendees_count,
  total_amount, paid_amount, hold_expires_at, notes, created_at, metadata,
  room:rooms(id, name, hourly_rate), customer:customers(display_name, phone, email, company_name)`;

export async function listRequests(): Promise<RequestRow[]> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data } = await admin
    .from("bookings")
    .select(SELECT)
    .not("metadata->public", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as unknown as RequestRow[]).filter((r) => r.metadata?.public?.stage && r.metadata.public.stage !== "direct");
}

export async function countOpenRequests(): Promise<number> {
  try {
    const admin = createSupabaseAdminClient();
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("booking_status", "pending")
      .eq("metadata->public->>stage", "requested");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function load(id: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  return data as unknown as RequestRow | null;
}

async function saveMeta(id: string, pub: PublicMeta, patch: Record<string, unknown> = {}) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("bookings").select("metadata").eq("id", id).maybeSingle();
  const metadata = { ...(((data as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {}), public: pub };
  const { error } = await admin.from("bookings").update({ ...patch, metadata } as never).eq("id", id);
  if (error) throw error;
}

const who = (r: RequestRow) =>
  r.metadata?.public?.doc?.company || r.metadata?.public?.company || r.customer?.company_name || r.customer?.display_name || "-";

// ─── Admin: issue a quotation ─────────────────────────────────────────────

export async function issueQuotation(opts: {
  bookingId: string;
  lines: Array<{ label: string; qty: number; unitPrice: number }>;
  discount: number;
  withholding: boolean;
  validHours: number;
  note: string | null;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string; number?: string }> {
  const b = await load(opts.bookingId);
  const pub = b?.metadata?.public;
  if (!b || !pub) return { ok: false, message: "ไม่พบคำขอ" };
  if (!ACTIVE.includes(b.booking_status)) return { ok: false, message: "คำขอนี้ถูกยกเลิกหรือหมดอายุแล้ว" };
  if (Number(b.paid_amount) > 0) return { ok: false, message: "ลูกค้าชำระเงินแล้ว — แก้ราคาได้จากหน้าปฏิทิน" };

  const lines: PriceLine[] = opts.lines
    .filter((l) => l.label.trim() && l.qty > 0)
    .map((l) => ({ label: l.label.trim(), qty: l.qty, unitPrice: l.unitPrice, amount: Math.round(l.qty * l.unitPrice * 100) / 100 }));
  if (lines.length === 0) return { ok: false, message: "ต้องมีรายการอย่างน้อย 1 รายการ" };

  const cfg = await getPublicRoomConfig();
  const t = totalsFromLines(lines, opts.discount, cfg.pricing, opts.withholding && Boolean(pub.doc?.taxId));
  const breakdown = { ...t, otMinutes: pub.pricing?.otMinutes ?? 0, packageName: pub.pricing?.packageName ?? null, hourlyTotal: pub.pricing?.hourlyTotal ?? 0 };
  const revision = (pub.quote?.revision ?? 0) + 1;
  const number = `QT-${b.reference_code.replace(/^BK/, "")}${revision > 1 ? `-R${revision}` : ""}`;
  const validHours = Math.min(Math.max(1, opts.validHours || cfg.pricing.quote_valid_hours), 24 * 30);
  const validUntil = new Date(Math.min(Date.now() + validHours * 3_600_000, new Date(b.starts_at).getTime())).toISOString();

  const quote: PublicQuotation = {
    number,
    revision,
    lines: lines.map((l) => ({ label: l.label, qty: l.qty ?? 1, unitPrice: l.unitPrice ?? l.amount, amount: l.amount })),
    breakdown,
    note: opts.note?.trim() || null,
    validUntil,
    issuedAt: new Date().toISOString(),
    issuedBy: opts.actorName,
    acceptedAt: null,
  };
  const nextPub: PublicMeta = {
    ...pub,
    stage: "quoted",
    pricing: breakdown,
    quote,
    doc: pub.doc ? { ...pub.doc, withholding: t.withholding } : pub.doc,
    payment: undefined,
  };
  await saveMeta(b.id, nextPub, {
    total_amount: breakdown.grandTotal,
    discount_amount: breakdown.discount,
    base_amount: lines[0].amount,
    addons_amount: lines.slice(1).reduce((s, l) => s + l.amount, 0),
    hold_expires_at: validUntil,
  });

  const admin = createSupabaseAdminClient();
  await admin.from("booking_audit_log").insert({
    booking_id: b.id,
    action: "quotation_issued",
    actor_id: opts.actorId,
    actor_name: opts.actorName,
    changes: { number, grand_total: breakdown.grandTotal, net_payable: breakdown.netPayable, valid_until: validUntil },
  } as never);

  const statusUrl = `${publicBaseUrl()}/rooms/booking/${b.reference_code}?t=${pub.token}`;
  await Promise.allSettled([
    sendBookingLine(b.id, "quoted"),
    dispatchEvent(
      "booking.public",
      [
        `📄 <b>ออกใบเสนอราคา ${escapeHtml(number)}</b>`,
        `<code>${escapeHtml(b.reference_code)}</code> · ${escapeHtml(who(b))}`,
        `${escapeHtml(b.room?.name ?? "-")} · ${bkkDateLabel(b.starts_at)} ${bkkTime(b.starts_at)}–${bkkTime(b.ends_at)} น.`,
        `ราคารวม${breakdown.vatEnabled ? " VAT" : ""} <b>${formatBaht(breakdown.grandTotal)}</b>${breakdown.wht > 0 ? ` · หัก ณ ที่จ่าย ${formatBaht(breakdown.wht)} · ลูกค้าโอนจริง ${formatBaht(breakdown.netPayable)}` : ""}`,
        `ใช้ได้ถึง ${bkkDateLabel(validUntil)} ${bkkTime(validUntil)} น. · โดย ${escapeHtml(opts.actorName)}`,
        pub.line?.userId ? "ส่งใบเสนอราคาเข้า LINE ลูกค้าแล้ว" : `ลูกค้ายังไม่ผูก LINE — ส่งลิงก์นี้ให้ลูกค้า: ${escapeHtml(statusUrl)}`,
      ].join("\n"),
    ),
  ]);
  return { ok: true, number };
}

export async function rejectRequest(opts: {
  bookingId: string;
  reason: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const b = await load(opts.bookingId);
  if (!b?.metadata?.public) return { ok: false, message: "ไม่พบคำขอ" };
  if (Number(b.paid_amount) > 0) return { ok: false, message: "ลูกค้าชำระเงินแล้ว — ยกเลิกผ่านหน้าปฏิทินพร้อมคืนเงิน" };
  const admin = createSupabaseAdminClient();
  await admin
    .from("bookings")
    .update({
      booking_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: opts.reason,
      hold_expires_at: null,
    } as never)
    .eq("id", b.id)
    .in("booking_status", ACTIVE);
  await admin.from("booking_audit_log").insert({
    booking_id: b.id,
    action: "request_rejected",
    actor_name: opts.actorName,
    reason: opts.reason,
  } as never);
  await restoreDisplacedFor(b.id);
  await sendBookingLine(b.id, "cancelled");
  return { ok: true };
}

// ─── Customer: accept ─────────────────────────────────────────────────────

export async function acceptQuotation(bookingId: string, cfgOverride?: import("@/lib/data/public-rooms").PublicRoomConfig): Promise<{
  ok: boolean;
  message?: string;
  amountDue?: number;
  mode?: "online" | "manual";
}> {
  const b = await load(bookingId);
  const pub = b?.metadata?.public;
  if (!b || !pub?.quote) return { ok: false, message: "ยังไม่มีใบเสนอราคา" };
  if (pub.stage === "accepted") return { ok: true, amountDue: pub.payment?.due ?? 0, mode: pub.payment ? "online" : "manual" };
  if (pub.stage !== "quoted" || b.booking_status !== "pending") return { ok: false, message: "ใบเสนอราคานี้ใช้ไม่ได้แล้ว" };
  if (new Date(pub.quote.validUntil).getTime() <= Date.now()) {
    return { ok: false, message: "ใบเสนอราคาหมดอายุแล้ว กรุณาติดต่อแอดมินทาง LINE เพื่อขอใบใหม่" };
  }

  const cfg = cfgOverride ?? (await getPublicRoomConfig());
  const setup = await getPaymentSetup(cfg);
  const net = pub.quote.breakdown.netPayable;
  const due = amountDueNow(net, setup.mode, setup.depositPercent);
  const online = setup.ready && due > 0;
  const startMs = new Date(b.starts_at).getTime();
  const hold = online
    ? new Date(Math.min(Date.now() + setup.holdMinutes * 60_000, startMs)).toISOString()
    : pub.quote.validUntil;

  const nextPub: PublicMeta = {
    ...pub,
    stage: "accepted",
    quote: { ...pub.quote, acceptedAt: new Date().toISOString() },
    payment: online ? { mode: setup.mode, percent: setup.depositPercent, due } : undefined,
  };
  await saveMeta(b.id, nextPub, { hold_expires_at: hold });

  const admin = createSupabaseAdminClient();
  await admin.from("booking_audit_log").insert({
    booking_id: b.id,
    action: "quotation_accepted",
    actor_name: "ลูกค้า (ออนไลน์)",
    changes: { number: pub.quote.number, due, online },
  } as never);

  await Promise.allSettled([
    sendBookingLine(b.id, "received"),
    dispatchEvent(
      "booking.public",
      [
        `🤝 <b>ลูกค้ายืนยันใบเสนอราคา ${escapeHtml(pub.quote.number)}</b>`,
        `<code>${escapeHtml(b.reference_code)}</code> · ${escapeHtml(who(b))}`,
        online
          ? `รอลูกค้าโอน ${formatBaht(due)} และแนบสลิป — ระบบยืนยันให้อัตโนมัติ (ภายใน ${bkkTime(hold)} น.)`
          : `รอลูกค้าส่งสลิปทาง LINE (${formatBaht(amountDueNow(net, cfg.payment_mode, cfg.deposit_percent))}) — ตรวจแล้วกดยืนยันในปฏิทิน`,
      ].join("\n"),
    ),
    createInAppNotification({
      level: "info",
      category: "system",
      title: `ลูกค้ายืนยันใบเสนอราคา ${pub.quote.number}`,
      body: `${who(b)} · รอชำระเงิน`,
      link: `/admin/requests?focus=${b.id}`,
      relatedId: b.id,
    }),
  ]);
  return { ok: true, amountDue: online ? due : 0, mode: online ? "online" : "manual" };
}
