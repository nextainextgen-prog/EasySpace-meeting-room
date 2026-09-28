/**
 * Customer-facing LINE notifications for online bookings.
 *
 * The customer's LINE userId is stored on the booking (metadata.public.line)
 * once they open a booking page through LIFF. Every sender here is
 * best-effort: a LINE outage must never fail a booking or a payment.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { linePush, resolveLiffUser } from "@/lib/integrations/line-messaging";
import { bookingFlexMessage, type BookingFlexKind } from "@/lib/templates/line-flex";
import { bookingStatusUrl, getPublicRoomConfig } from "@/lib/data/public-rooms";
import { PAYMENT_STATUS_LABEL, amountDueNow, paymentModeLabel } from "@/lib/public-booking/payment";

export interface PublicLineLink {
  userId: string;
  displayName: string;
  linkedAt: string;
}

interface BookingForLine {
  id: string;
  reference_code: string;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  booking_status: string;
  hold_expires_at: string | null;
  cancelled_reason: string | null;
  metadata: {
    public?: {
      token?: string;
      company?: string | null;
      line?: PublicLineLink;
      payment?: { due?: number };
      stage?: string;
      pricing?: {
        preVat: number; vat: number; vatRate: number; vatEnabled: boolean;
        grandTotal: number; wht: number; whtRate: number; netPayable: number;
      };
      quote?: { number: string; validUntil: string };
    };
  } | null;
  room: { name: string; thumbnail_url: string | null } | null;
  customer: { display_name: string; company_name: string | null } | null;
}

const SELECT = `id, reference_code, starts_at, ends_at, attendees_count, total_amount, paid_amount,
  payment_status, booking_status, hold_expires_at, cancelled_reason, metadata,
  room:rooms(name, thumbnail_url), customer:customers(display_name, company_name)`;

async function load(bookingId: string): Promise<BookingForLine | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("bookings").select(SELECT).eq("id", bookingId).maybeSingle();
  return (data as unknown as BookingForLine | null) ?? null;
}

/** Pick the message that matches where the booking stands right now. */
function kindFor(b: BookingForLine): BookingFlexKind {
  if (b.booking_status === "cancelled" || b.booking_status === "no_show") return "cancelled";
  if (b.booking_status === "confirmed" || b.booking_status === "in_use" || b.booking_status === "completed") {
    return "confirmed";
  }
  const stage = b.metadata?.public?.stage;
  if (stage === "requested") return "requested";
  if (stage === "quoted") return "quoted";
  return "received";
}

export async function sendBookingLine(
  bookingId: string,
  kind?: BookingFlexKind,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const b = await load(bookingId);
    const line = b?.metadata?.public?.line;
    const token = b?.metadata?.public?.token;
    if (!b || !line?.userId || !token) return { ok: false, message: "not_linked" };

    const cfg = await getPublicRoomConfig();
    const k = kind ?? kindFor(b);
    const total = Number(b.total_amount);
    const paid = Number(b.paid_amount);
    const due = Math.max(0, Number(b.metadata?.public?.payment?.due ?? 0) - paid);

    const msg = bookingFlexMessage({
      kind: k,
      reference: b.reference_code,
      roomName: b.room?.name ?? "-",
      roomImage: b.room?.thumbnail_url,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      bookerName: b.metadata?.public?.company || b.customer?.company_name || b.customer?.display_name || "-",
      attendees: b.attendees_count,
      totalAmount: total,
      paidAmount: paid,
      dueNow: k === "received" && due > 0 ? due : null,
      manualDue:
        k === "received" && due === 0
          ? amountDueNow(Number(b.metadata?.public?.pricing?.netPayable ?? total) - paid, cfg.payment_mode, cfg.deposit_percent)
          : null,
      money: b.metadata?.public?.pricing ?? null,
      quoteNumber: b.metadata?.public?.quote?.number ?? null,
      validUntil: k === "quoted" ? (b.metadata?.public?.quote?.validUntil ?? null) : null,
      manualLabel: paymentModeLabel(cfg.payment_mode, cfg.deposit_percent),
      dueBy: k === "received" ? b.hold_expires_at : null,
      paymentLabel: PAYMENT_STATUS_LABEL[b.payment_status] ?? null,
      statusUrl:
        k === "cancelled"
          ? bookingStatusUrl(cfg, b.reference_code, token).replace(/booking\/[^?]+\?.*$/, "")
          : bookingStatusUrl(cfg, b.reference_code, token),
      note: k === "cancelled" ? b.cancelled_reason : null,
    });
    const r = await linePush(line.userId, [msg]);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  } catch (err) {
    console.error("[line] sendBookingLine failed", err);
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Attach the LIFF user to a booking (verified with LINE, never trusted from
 * the browser) and send them the booking card straight away.
 */
export async function linkLineToBooking(
  bookingId: string,
  accessToken: string,
  liffIdOverride?: string,
): Promise<{ ok: boolean; message?: string; pushed?: boolean }> {
  const liffId = liffIdOverride ?? (await getPublicRoomConfig()).liff_id;
  if (!liffId) return { ok: false, message: "ยังไม่ได้ตั้งค่า LIFF" };
  const who = await resolveLiffUser(accessToken, liffId);
  if (!who.ok) return { ok: false, message: "ยืนยันตัวตน LINE ไม่สำเร็จ" };

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("bookings").select("metadata").eq("id", bookingId).maybeSingle();
  const metadata = ((data as { metadata?: Record<string, any> } | null)?.metadata ?? {}) as Record<string, any>;
  const already = metadata.public?.line?.userId === who.userId;
  metadata.public = {
    ...(metadata.public ?? {}),
    line: { userId: who.userId, displayName: who.displayName, linkedAt: new Date().toISOString() },
  };
  await admin.from("bookings").update({ metadata } as never).eq("id", bookingId);

  if (already) return { ok: true, pushed: false };
  const sent = await sendBookingLine(bookingId);
  return { ok: true, pushed: sent.ok, message: sent.ok ? undefined : sent.message };
}

// ─── OA contact ───────────────────────────────────────────────────────────

let oaCache: { basicId: string | null; at: number } | null = null;

/**
 * The OA's real basic ID (e.g. "@784aazqk"), read from the Messaging API so
 * chat links can't drift from the account the token belongs to. Falls back
 * to the configured `line_id` when no token is set.
 */
export async function getLineOaBasicId(): Promise<string | null> {
  if (oaCache && Date.now() - oaCache.at < 10 * 60_000) return oaCache.basicId;
  const { lineBotInfo } = await import("@/lib/integrations/line-messaging");
  const info = await lineBotInfo();
  const basicId = info.ok ? info.basicId : null;
  oaCache = { basicId, at: Date.now() };
  if (basicId) return basicId;
  const cfg = await getPublicRoomConfig();
  return /^@[a-z0-9._-]{3,}$/i.test(cfg.line_id) ? cfg.line_id : null;
}

/** Contact details for the public pages, with a chat link that actually opens the OA. */
export async function getPublicLineContact(cfg: { line_url: string; line_id: string }) {
  const basicId = await getLineOaBasicId();
  return {
    line_id: basicId ?? cfg.line_id,
    line_url: basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : cfg.line_url,
    line_oa_id: basicId,
  };
}
