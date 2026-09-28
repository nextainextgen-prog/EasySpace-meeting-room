/**
 * Online payment for public bookings: transfer → upload slip → EasySlip
 * verifies → booking confirms itself.
 *
 * A slip is accepted only when all of these hold:
 *   - EasySlip can read it and the bank confirms the transfer
 *   - it was paid INTO one of our active accounts (or our PromptPay ID)
 *   - it covers what is still due
 *   - it was made after the booking (an old slip can't be recycled)
 *   - its transRef has never paid for anything before
 * Anything else is logged for a person to review from /admin/finance/slips.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import {
  EASYSLIP_MESSAGES,
  easySlipConfigured,
  verifySlipImage,
  type EasySlipData,
} from "@/lib/integrations/easyslip";
import { getPublicRoomConfig, type PublicRoomConfig } from "@/lib/data/public-rooms";
import { dispatchEvent, createInAppNotification } from "@/lib/server/notifications";
import { slipPaymentTemplate, slipReviewTemplate } from "@/lib/templates/telegram";
import { sendBookingLine } from "@/lib/server/booking-line";
import { notifyOverrideFinal } from "@/lib/server/overrides";
import { listPaymentBanks, type BankForPayment } from "@/lib/server/payment-banks";

export type { BankForPayment };
import {
  amountDueNow,
  maskedAccountMatches,
  namesLookAlike,
  promptPayPayload,
} from "@/lib/public-booking/payment";

export const SLIP_BUCKET = "payment-slips";
const MAX_ATTEMPTS_PER_HOUR = 6;

export type SlipStatus =
  | "verified"
  | "approved"
  | "rejected"
  | "amount_mismatch"
  | "receiver_mismatch"
  | "duplicate"
  | "too_old"
  | "not_slip"
  | "pending_bank"
  | "api_error";

export const SLIP_STATUS_LABEL: Record<SlipStatus, string> = {
  verified: "ผ่าน",
  approved: "อนุมัติโดยแอดมิน",
  rejected: "ปฏิเสธ",
  amount_mismatch: "ยอดไม่ตรง",
  receiver_mismatch: "บัญชีรับไม่ตรง",
  duplicate: "สลิปซ้ำ",
  too_old: "สลิปก่อนวันจอง",
  not_slip: "อ่านสลิปไม่ได้",
  pending_bank: "ธนาคารยังไม่ยืนยัน",
  api_error: "ระบบตรวจขัดข้อง",
};

/** Statuses a person should look at — money may have moved. */
const NEEDS_REVIEW: SlipStatus[] = ["amount_mismatch", "receiver_mismatch", "too_old", "api_error"];

// ─── Setup ────────────────────────────────────────────────────────────────

export interface PaymentSetup {
  ready: boolean;
  /** Why online payment is off, for the admin screen. */
  missing: string[];
  mode: "deposit" | "full";
  depositPercent: number;
  holdMinutes: number;
  banks: BankForPayment[];
  promptpayId: string | null;
}

/** 10–15 digits and not a run of one repeated digit. */
export function isRealAccountNumber(n: string): boolean {
  const d = n.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 && !/^(\d)\1+$/.test(d);
}

async function slipTableExists(): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("payment_slips" as never).select("id", { head: true, count: "exact" }).limit(1);
  return !error;
}

export async function getPaymentSetup(cfgOverride?: PublicRoomConfig): Promise<PaymentSetup> {
  const admin = createSupabaseAdminClient();
  const [cfg, banksRes, methodsRes, keyOk, tableOk] = await Promise.all([
    cfgOverride ?? getPublicRoomConfig(),
    listPaymentBanks(),
    admin.from("settings").select("value").eq("key", "finance.payment_methods").maybeSingle(),
    easySlipConfigured(),
    slipTableExists(),
  ]);
  const allBanks = banksRes;
  // Never ask a customer to transfer into a placeholder like 000-0-00000-0.
  const banks = allBanks.filter((b) => isRealAccountNumber(b.account_number));
  const promptpayRaw = (methodsRes.data as { value?: { promptpay_id?: string } } | null)?.value?.promptpay_id ?? "";
  const promptpayId = promptPayPayload(promptpayRaw) ? promptpayRaw.replace(/\D/g, "") : null;

  const missing: string[] = [];
  if (!cfg.payment_enabled) missing.push("ปิดการชำระเงินออนไลน์ไว้");
  if (!tableOk) missing.push("ยังไม่ได้รัน migration 16");
  if (!keyOk) missing.push("ยังไม่ได้ใส่ EasySlip API key");
  if (banks.length === 0 && !promptpayId) {
    missing.push(
      allBanks.length > 0
        ? "บัญชีรับเงินยังเป็นเลขตัวอย่าง (เช่น 000-0-00000-0) — แก้เป็นบัญชีจริงที่การ์ดบัญชีธนาคาร"
        : "ยังไม่มีบัญชีรับเงิน",
    );
  }

  return {
    ready: missing.length === 0,
    missing,
    mode: cfg.payment_mode,
    depositPercent: cfg.deposit_percent,
    holdMinutes: cfg.payment_hold_minutes,
    banks,
    promptpayId,
  };
}

// ─── Customer uploads a slip ──────────────────────────────────────────────

interface BookingForPayment {
  id: string;
  reference_code: string;
  booking_status: string;
  payment_status: string;
  total_amount: number;
  paid_amount: number;
  created_at: string;
  starts_at: string;
  ends_at: string;
  customer_id: string | null;
  metadata: { public?: { token?: string; company?: string | null; payment?: { due?: number } } } | null;
  room: { name: string } | null;
  customer: { display_name: string; company_name: string | null; phone: string | null } | null;
}

async function loadBooking(reference: string, token: string): Promise<BookingForPayment | null> {
  if (!reference || !token || token.length < 16) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      `id, reference_code, booking_status, payment_status, total_amount, paid_amount, created_at,
       starts_at, ends_at, customer_id, metadata, room:rooms(name),
       customer:customers(display_name, company_name, phone)`,
    )
    .eq("reference_code", reference)
    .maybeSingle();
  const row = data as unknown as BookingForPayment | null;
  if (!row?.metadata?.public?.token || row.metadata.public.token !== token) return null;
  return row;
}

/** What this booking still has to pay online. */
export function outstandingOnline(b: {
  total_amount: number;
  paid_amount: number;
  metadata: { public?: { payment?: { due?: number } } } | null;
}): number {
  const due = Number(b.metadata?.public?.payment?.due ?? 0);
  return Math.max(0, due - Number(b.paid_amount));
}

function describeSlip(d: EasySlipData) {
  const proxyType = d.receiver?.account?.proxy?.type;
  const slipType = proxyType
    ? proxyType === "MSISDN"
      ? "พร้อมเพย์ (เบอร์โทร)"
      : proxyType === "NATID"
        ? "พร้อมเพย์ (เลขประจำตัว)"
        : proxyType === "EWALLETID"
          ? "พร้อมเพย์ (e-Wallet)"
          : `พร้อมเพย์ (${proxyType})`
    : d.receiver?.merchantId
      ? "ร้านค้า / Biller"
      : "โอนเข้าบัญชี";
  const name = (a?: { name?: { th?: string; en?: string } }) => a?.name?.th || a?.name?.en || null;
  return {
    slip_type: slipType,
    sender_bank: d.sender?.bank?.short || d.sender?.bank?.name || null,
    sender_name: name(d.sender?.account),
    sender_account: d.sender?.account?.bank?.account || d.sender?.account?.proxy?.account || null,
    receiver_bank: d.receiver?.bank?.short || d.receiver?.bank?.name || null,
    receiver_name: name(d.receiver?.account),
    receiver_account: d.receiver?.account?.bank?.account || d.receiver?.account?.proxy?.account || null,
  };
}

export function receiverMatches(d: EasySlipData, banks: BankForPayment[], promptpayId: string | null): boolean {
  const acct = d.receiver?.account;
  const bankAcct = acct?.bank?.account;
  const proxyAcct = acct?.proxy?.account;
  if (bankAcct && banks.some((b) => maskedAccountMatches(bankAcct, b.account_number))) return true;
  if (proxyAcct && promptpayId && maskedAccountMatches(proxyAcct, promptpayId)) return true;
  // Some banks reveal no digits at all — fall back to the account name.
  const recvName = acct?.name?.th || acct?.name?.en;
  if (!bankAcct && !proxyAcct && recvName) {
    return banks.some((b) => namesLookAlike(recvName, b.account_name));
  }
  // Digits were shown but didn't line up with any of our accounts: a name
  // match alone is not enough to call the money ours.
  return false;
}

export type SlipSubmitResult =
  | { ok: true; status: "verified"; amount: number; paymentStatus: string; message: string }
  | { ok: false; status: SlipStatus | "not_ready" | "not_found" | "closed" | "paid" | "rate_limited" | "bad_file"; message: string };

export async function submitSlip(opts: {
  reference: string;
  token: string;
  bytes: ArrayBuffer;
  mime: string;
  filename: string;
  /** Tests only: evaluate against this config instead of the live one. */
  cfg?: PublicRoomConfig;
}): Promise<SlipSubmitResult> {
  const booking = await loadBooking(opts.reference, opts.token);
  if (!booking) return { ok: false, status: "not_found", message: "ไม่พบการจอง" };
  const stageEarly = (booking.metadata?.public as { stage?: string } | undefined)?.stage;
  if (stageEarly === "requested" || stageEarly === "quoted") {
    return { ok: false, status: "closed", message: "กรุณารอใบเสนอราคาและกดยืนยันก่อนชำระเงิน" };
  }
  const setup = await getPaymentSetup(opts.cfg);
  if (!setup.ready) {
    return { ok: false, status: "not_ready", message: "ระบบชำระเงินออนไลน์ยังไม่พร้อม กรุณาติดต่อทีมงาน" };
  }
  if (!["pending", "confirmed"].includes(booking.booking_status)) {
    return {
      ok: false,
      status: "closed",
      message: "การจองนี้ถูกยกเลิกหรือหมดเวลาชำระแล้ว หากโอนเงินไปแล้วกรุณาติดต่อทีมงานทาง LINE",
    };
  }
  const stage = (booking.metadata?.public as { stage?: string } | undefined)?.stage;
  if (stage === "requested" || stage === "quoted") {
    return { ok: false, status: "closed", message: "กรุณารอใบเสนอราคาและกดยืนยันก่อนชำระเงิน" };
  }
  const outstanding = outstandingOnline(booking);
  if (outstanding <= 0) return { ok: false, status: "paid", message: "การจองนี้ชำระเงินเรียบร้อยแล้ว" };
  if (opts.bytes.byteLength === 0 || opts.bytes.byteLength > 8 * 1024 * 1024) {
    return { ok: false, status: "bad_file", message: "ไฟล์ต้องเป็นรูปภาพขนาดไม่เกิน 8MB" };
  }

  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("payment_slips" as never)
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return { ok: false, status: "rate_limited", message: "อัปโหลดสลิปหลายครั้งเกินไป กรุณาติดต่อทีมงานทาง LINE" };
  }

  // Keep the image whatever the verdict — it's the evidence either way.
  const ext = (opts.mime.split("/")[1] || "jpg").replace("jpeg", "jpg").slice(0, 5);
  const imagePath = `${booking.id}/${Date.now()}.${ext}`;
  const up = await admin.storage
    .from(SLIP_BUCKET)
    .upload(imagePath, new Blob([opts.bytes], { type: opts.mime }), { contentType: opts.mime, upsert: false });

  const api = await verifySlipImage(opts.bytes, opts.mime, opts.filename);

  let status: SlipStatus;
  let message: string;
  let data: EasySlipData | null = null;

  if (api.ok) {
    data = api.data;
    const amount = Number(api.data.amount?.amount ?? 0);
    const slipAt = new Date(api.data.date).getTime();
    const bookedAt = new Date(booking.created_at).getTime();
    if (!receiverMatches(api.data, setup.banks, setup.promptpayId)) {
      status = "receiver_mismatch";
      message = "บัญชีปลายทางในสลิปไม่ตรงกับบัญชีของเรา ทีมงานจะตรวจสอบและติดต่อกลับ";
    } else if (Number.isFinite(slipAt) && slipAt < bookedAt - 60 * 60_000) {
      status = "too_old";
      message = "สลิปนี้ทำรายการก่อนการจอง กรุณาใช้สลิปของการโอนครั้งนี้";
    } else if (amount + 0.009 < outstanding) {
      status = "amount_mismatch";
      message = `ยอดโอน ฿${amount.toLocaleString("th-TH")} น้อยกว่ายอดที่ต้องชำระ ฿${outstanding.toLocaleString("th-TH")} ทีมงานจะตรวจสอบและติดต่อกลับ`;
    } else {
      status = "verified";
      message = "ตรวจสอบสลิปสำเร็จ การจองของคุณได้รับการยืนยันแล้ว";
    }
  } else if (api.message === "duplicate_slip") {
    status = "duplicate";
    message = EASYSLIP_MESSAGES.duplicate_slip;
  } else if (api.message === "slip_pending") {
    status = "pending_bank";
    message = EASYSLIP_MESSAGES.slip_pending;
  } else if (["invalid_image", "qrcode_not_found", "slip_not_found", "invalid_payload", "image_size_too_large"].includes(api.message)) {
    status = "not_slip";
    message = EASYSLIP_MESSAGES[api.message];
  } else {
    status = "api_error";
    message = "ระบบตรวจสลิปขัดข้องชั่วคราว ทีมงานได้รับสลิปแล้วและจะตรวจสอบให้";
  }

  const described: Partial<ReturnType<typeof describeSlip>> = data ? describeSlip(data) : {};
  const { data: slipRow, error: slipErr } = await admin
    .from("payment_slips" as never)
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      status,
      api_status: api.status,
      api_message: api.ok ? null : api.message,
      trans_ref: data?.transRef ?? null,
      amount: data ? Number(data.amount?.amount ?? 0) : null,
      expected_amount: outstanding,
      slip_date: data?.date ?? null,
      image_path: up.error ? null : imagePath,
      raw: api.ok ? api.data : { status: api.status, message: api.message },
      ...described,
    } as never)
    .select("id")
    .single();

  // The unique index is the last word on replays: a transRef that already
  // paid for something can't be accepted twice.
  if (slipErr?.code === "23505") {
    await admin.from("payment_slips" as never).insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      status: "duplicate",
      api_status: api.status,
      trans_ref: data?.transRef ?? null,
      amount: data ? Number(data.amount?.amount ?? 0) : null,
      expected_amount: outstanding,
      slip_date: data?.date ?? null,
      image_path: up.error ? null : imagePath,
      raw: data,
      ...described,
    } as never);
    return { ok: false, status: "duplicate", message: EASYSLIP_MESSAGES.duplicate_slip };
  }
  const slipId = (slipRow as { id: string } | null)?.id ?? null;

  if (status === "verified" && data) {
    const applied = await applyPayment({
      bookingId: booking.id,
      amount: Number(data.amount.amount),
      transRef: data.transRef,
      method: data.receiver?.account?.proxy ? "promptpay" : "bank_transfer",
      imagePath: up.error ? null : imagePath,
      actorName: "ระบบ (EasySlip)",
      note: `ตรวจสลิปอัตโนมัติ · ${described.sender_bank ?? ""} ${described.sender_name ?? ""}`.trim(),
      slip: { senderName: described.sender_name, senderBank: described.sender_bank, slipAt: data.date },
    });
    return {
      ok: true,
      status: "verified",
      amount: Number(data.amount.amount),
      paymentStatus: applied.paymentStatus,
      message,
    };
  }

  if (NEEDS_REVIEW.includes(status)) {
    const who = booking.metadata?.public?.company || booking.customer?.company_name || booking.customer?.display_name || "-";
    void dispatchEvent(
      "payment.slip_review",
      slipReviewTemplate({
        reference: booking.reference_code,
        customerName: who,
        customerPhone: booking.customer?.phone ?? null,
        roomName: booking.room?.name ?? "-",
        statusLabel: SLIP_STATUS_LABEL[status],
        amount: data ? Number(data.amount?.amount ?? 0) : null,
        expected: outstanding,
        senderName: described.sender_name ?? null,
        receiverName: described.receiver_name ?? null,
      }),
    );
    await createInAppNotification({
      level: "warning",
      category: "finance",
      title: `สลิปต้องตรวจสอบ ${booking.reference_code} — ${SLIP_STATUS_LABEL[status]}`,
      body: `${who} · ยอดสลิป ${data ? `฿${Number(data.amount?.amount ?? 0).toLocaleString("th-TH")}` : "-"} / ต้องชำระ ฿${outstanding.toLocaleString("th-TH")}`,
      link: "/admin/finance/slips",
      relatedId: slipId ?? booking.id,
    });
  }

  return { ok: false, status, message };
}

// ─── Money lands on the booking ───────────────────────────────────────────

export async function applyPayment(opts: {
  bookingId: string;
  amount: number;
  transRef: string | null;
  method: "bank_transfer" | "promptpay";
  imagePath: string | null;
  actorName: string;
  actorId?: string | null;
  note?: string;
  slip?: { senderName?: string | null; senderBank?: string | null; slipAt?: string | null };
}): Promise<{ paymentStatus: string }> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      "id, reference_code, total_amount, paid_amount, booking_status, starts_at, ends_at, room:rooms(name), customer:customers(display_name, company_name, phone), metadata",
    )
    .eq("id", opts.bookingId)
    .single();
  const b = data as unknown as {
    id: string;
    reference_code: string;
    total_amount: number;
    paid_amount: number;
    booking_status: string;
    starts_at: string;
    ends_at: string;
    room: { name: string } | null;
    customer: { display_name: string; company_name: string | null; phone: string | null } | null;
    metadata: { public?: { company?: string | null } } | null;
  };

  const newPaid = Number(b.paid_amount) + opts.amount;
  // With withholding tax the customer legitimately transfers less than the
  // invoice total — "paid in full" is measured against what they owe us.
  const payable = Number(
    (b.metadata as { public?: { pricing?: { netPayable?: number } } } | null)?.public?.pricing?.netPayable ??
      b.total_amount,
  );
  const paymentStatus = newPaid + 0.009 >= payable ? "paid" : "deposit";

  await admin.from("booking_payments").insert({
    booking_id: b.id,
    amount: opts.amount,
    method: opts.method,
    reference: opts.transRef,
    slip_url: opts.imagePath ? `${SLIP_BUCKET}/${opts.imagePath}` : null,
    notes: opts.note ?? null,
    recorded_by: opts.actorId ?? null,
  } as never);

  await admin
    .from("bookings")
    .update({
      paid_amount: newPaid,
      payment_status: paymentStatus,
      // Money in = the room is theirs. Nothing left for the hold cron to chase.
      booking_status: b.booking_status === "pending" ? "confirmed" : b.booking_status,
      hold_expires_at: null,
    } as never)
    .eq("id", b.id);

  await admin.from("booking_audit_log").insert({
    booking_id: b.id,
    action: "paid",
    actor_id: opts.actorId ?? null,
    actor_name: opts.actorName,
    changes: { amount: opts.amount, method: opts.method, trans_ref: opts.transRef, payment_status: paymentStatus },
  } as never);

  const who = b.metadata?.public?.company || b.customer?.company_name || b.customer?.display_name || "-";
  await Promise.allSettled([
    dispatchEvent(
      paymentStatus === "paid" ? "payment.paid" : "payment.deposit",
      slipPaymentTemplate({
        reference: b.reference_code,
        customerName: who,
        customerPhone: b.customer?.phone ?? null,
        roomName: b.room?.name ?? "-",
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        amount: opts.amount,
        totalAmount: Number(b.total_amount),
        paidAmount: newPaid,
        channel: opts.method === "promptpay" ? "พร้อมเพย์" : "โอนเข้าบัญชี",
        senderName: opts.slip?.senderName ?? null,
        senderBank: opts.slip?.senderBank ?? null,
        transRef: opts.transRef,
        slipAt: opts.slip?.slipAt ?? null,
        verifiedBy: opts.actorName,
      }),
    ),
    createInAppNotification({
      level: "success",
      category: "finance",
      title: `รับชำระ ${b.reference_code} ฿${opts.amount.toLocaleString("th-TH")} — ยืนยันการจองแล้ว`,
      body: `${who} · ${b.room?.name ?? "-"} · ${paymentStatus === "paid" ? "ชำระครบ" : "มัดจำ"}`,
      link: "/admin/finance/slips",
      relatedId: b.id,
    }),
    sendBookingLine(b.id, "confirmed"),
    notifyOverrideFinal(b.id),
  ]);

  return { paymentStatus };
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface SlipListRow {
  id: string;
  created_at: string;
  status: SlipStatus;
  api_status: number | null;
  api_message: string | null;
  trans_ref: string | null;
  amount: number | null;
  expected_amount: number | null;
  slip_date: string | null;
  slip_type: string | null;
  sender_bank: string | null;
  sender_name: string | null;
  sender_account: string | null;
  receiver_bank: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  image_path: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  booking: {
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    payment_status: string;
    total_amount: number;
    paid_amount: number;
    metadata: { public?: { company?: string | null } } | null;
    room: { name: string } | null;
  } | null;
  customer: { display_name: string; company_name: string | null; phone: string | null } | null;
}

export async function listSlips(): Promise<{ rows: SlipListRow[]; tableMissing: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_slips" as never)
    .select(
      `id, created_at, status, api_status, api_message, trans_ref, amount, expected_amount, slip_date,
       slip_type, sender_bank, sender_name, sender_account, receiver_bank, receiver_name,
       receiver_account, image_path, review_note, reviewed_at,
       booking:bookings(id, reference_code, starts_at, ends_at, booking_status, payment_status,
         total_amount, paid_amount, metadata, room:rooms(name)),
       customer:customers(display_name, company_name, phone)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { rows: [], tableMissing: true };
  return { rows: (data ?? []) as unknown as SlipListRow[], tableMissing: false };
}

export async function slipSignedUrl(imagePath: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from(SLIP_BUCKET).createSignedUrl(imagePath, 300);
  return data?.signedUrl ?? null;
}

export async function reviewSlip(opts: {
  slipId: string;
  decision: "approve" | "reject";
  note: string;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("payment_slips" as never)
    .select("id, booking_id, status, amount, expected_amount, trans_ref, image_path, raw, sender_name, sender_bank, slip_date")
    .eq("id", opts.slipId)
    .maybeSingle();
  const slip = data as unknown as {
    id: string;
    booking_id: string | null;
    status: SlipStatus;
    amount: number | null;
    expected_amount: number | null;
    trans_ref: string | null;
    image_path: string | null;
    raw: EasySlipData | null;
    sender_name: string | null;
    sender_bank: string | null;
    slip_date: string | null;
  } | null;
  if (!slip) return { ok: false, message: "ไม่พบสลิป" };
  if (slip.status === "verified" || slip.status === "approved") {
    return { ok: false, message: "สลิปนี้ถูกนำไปใช้ชำระแล้ว" };
  }

  const { error } = await admin
    .from("payment_slips" as never)
    .update({
      status: opts.decision === "approve" ? "approved" : "rejected",
      reviewed_by: opts.actorId,
      reviewed_at: new Date().toISOString(),
      review_note: opts.note || null,
    } as never)
    .eq("id", slip.id);
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "เลขอ้างอิงสลิปนี้ถูกใช้ชำระรายการอื่นไปแล้ว" : error.message,
    };
  }

  if (opts.decision === "approve" && slip.booking_id) {
    const amount = Number(slip.amount ?? slip.expected_amount ?? 0);
    if (amount > 0) {
      await applyPayment({
        bookingId: slip.booking_id,
        amount,
        transRef: slip.trans_ref,
        method: slip.raw?.receiver?.account?.proxy ? "promptpay" : "bank_transfer",
        imagePath: slip.image_path,
        actorName: opts.actorName,
        actorId: opts.actorId,
        note: `อนุมัติสลิปด้วยตนเอง${opts.note ? ` · ${opts.note}` : ""}`,
        slip: { senderName: slip.sender_name, senderBank: slip.sender_bank, slipAt: slip.slip_date },
      });
    }
  }
  return { ok: true };
}

export { amountDueNow };

/** The browser-safe slice of the setup. */
export async function getPublicPaymentInfo(): Promise<import("@/lib/public-booking/payment").PublicPaymentInfo> {
  const s = await getPaymentSetup();
  return {
    ready: s.ready,
    mode: s.mode,
    depositPercent: s.depositPercent,
    holdMinutes: s.holdMinutes,
    banks: s.banks.map(({ id, bank_name, account_number, account_name }) => ({
      id,
      bank_name,
      account_number,
      account_name,
    })),
    promptpayId: s.promptpayId,
  };
}
