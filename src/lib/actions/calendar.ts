"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { dispatchEvent } from "@/lib/server/notifications";
import { getCurrentProfile } from "@/lib/auth";
import {
  bookingCancelledTemplate,
  paymentRecordedTemplate,
} from "@/lib/templates/telegram";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

/* ──────────────── Move / resize a booking ──────────────── */
const MoveSchema = z.object({
  bookingId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export async function moveBooking(raw: z.infer<typeof MoveSchema>) {
  const parsed = MoveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const input = parsed.data;
  if (new Date(input.endsAt) <= new Date(input.startsAt))
    return { ok: false as const, error: "invalid_range" };

  const supabase = createSupabaseAdminClient();
  const { data: current } = await supabase
    .from("bookings")
    .select("id, room_id, starts_at, ends_at, reference_code")
    .eq("id", input.bookingId)
    .single();
  if (!current) return { ok: false as const, error: "not_found" };
  const c = current as {
    id: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    reference_code: string;
  };

  const roomId = input.roomId ?? c.room_id;

  // conflict check excluding self
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id, reference_code")
    .eq("room_id", roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .neq("id", input.bookingId)
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt);
  if (conflicts && conflicts.length > 0) {
    return {
      ok: false as const,
      error: "time_conflict",
      conflicts: conflicts as Array<{ id: string; reference_code: string }>,
    };
  }

  const { error } = await supabase
    .from("bookings")
    .update({
      room_id: roomId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    } as never)
    .eq("id", input.bookingId);
  if (error) return { ok: false as const, error: error.message };

  const me = await getCurrentProfile();
  await supabase.from("booking_audit_log").insert({
    booking_id: input.bookingId,
    action: "moved",
    actor_id: me?.id ?? null,
    actor_name: me?.full_name ?? me?.email ?? null,
    changes: {
      from: {
        room_id: c.room_id,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
      },
      to: { room_id: roomId, starts_at: input.startsAt, ends_at: input.endsAt },
    },
  } as never);

  // Clear alerts_sent so time-alerts cron re-evaluates against the new time
  await supabase
    .from("bookings")
    .update({ metadata: { alerts_sent: [] } as never } as never)
    .eq("id", input.bookingId);

  // Auto-resolve stale in-app notifications tied to this booking
  await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq("related_id", input.bookingId)
    .is("resolved_at", null);

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}

/* ──────────────── Detail fetch (info + payments + audit) ──────────────── */
export async function getBookingDetail(id: string) {
  const supabase = createSupabaseAdminClient();
  const [bookingRes, paymentsRes, auditRes, addonsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "*, customer:customers(id, display_name, phone, email, type, tags, total_bookings, total_spent), room:rooms(*), package:room_packages(id, name, hours, price), promotion:promotions(id, name, code)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("booking_payments")
      .select(
        "id, paid_at, amount, method, reference, slip_url, notes, recorded_by",
      )
      .eq("booking_id", id)
      .order("paid_at", { ascending: false }),
    supabase
      .from("booking_audit_log")
      .select("id, created_at, action, actor_name, changes, reason")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("booking_addons")
      .select("addon_id, quantity, unit_price, addon:addons(name)")
      .eq("booking_id", id),
  ]);

  return {
    booking: bookingRes.data,
    payments: paymentsRes.data ?? [],
    audit: auditRes.data ?? [],
    addons: addonsRes.data ?? [],
  };
}

/* ──────────────── Add a payment ──────────────── */
const AddPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer", "promptpay", "qr", "credit_card"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().optional(),
});

export async function addBookingPayment(raw: z.infer<typeof AddPaymentSchema>) {
  const parsed = AddPaymentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, total_amount, paid_amount, reference_code, room:rooms(name), customer:customers(display_name)",
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) return { ok: false as const, error: "not_found" };
  const row = booking as unknown as {
    total_amount: number;
    paid_amount: number;
    reference_code: string;
    room: { name: string };
    customer: { display_name: string };
  };

  const newPaid = Number(row.paid_amount) + input.amount;
  const newStatus: PaymentStatus =
    newPaid >= Number(row.total_amount) ? "paid" : "deposit";

  const me = await getCurrentProfile();

  await Promise.all([
    supabase.from("booking_payments").insert({
      booking_id: input.bookingId,
      amount: input.amount,
      method: input.method as PaymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paid_at: input.paidAt ?? new Date().toISOString(),
      recorded_by: me?.id ?? null,
    } as never),
    supabase
      .from("bookings")
      .update({
        paid_amount: newPaid,
        payment_status: newStatus,
      } as never)
      .eq("id", input.bookingId),
    supabase.from("booking_audit_log").insert({
      booking_id: input.bookingId,
      action: "payment_added",
      actor_id: me?.id ?? null,
      actor_name: me?.full_name ?? me?.email ?? null,
      changes: { amount: input.amount, method: input.method },
    } as never),
  ]);

  void dispatchEvent(
    newStatus === "paid" ? "payment.paid" : "payment.deposit",
    paymentRecordedTemplate({
      reference: row.reference_code,
      customerName: row.customer.display_name,
      roomName: row.room.name,
      amount: input.amount,
      method: input.method as PaymentMethod,
      totalAmount: Number(row.total_amount),
      paidAmount: newPaid,
      remainingAmount: Math.max(0, Number(row.total_amount) - newPaid),
    }),
  );

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/finance");
  return { ok: true as const, paidAmount: newPaid, status: newStatus };
}

/* ──────────────── Update booking info (notes, attendees, etc.) ──────────────── */
const UpdateBookingSchema = z.object({
  bookingId: z.string().uuid(),
  attendees: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
  internalTitle: z.string().nullable().optional(),
  internalAgenda: z.string().nullable().optional(),
});

export async function updateBookingInfo(
  raw: z.infer<typeof UpdateBookingSchema>,
) {
  const parsed = UpdateBookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  const patch: Record<string, unknown> = {};
  if (input.attendees !== undefined) patch.attendees_count = input.attendees;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.internalTitle !== undefined)
    patch.internal_title = input.internalTitle;
  if (input.internalAgenda !== undefined)
    patch.internal_agenda = input.internalAgenda;

  if (Object.keys(patch).length === 0)
    return { ok: true as const, noop: true as const };

  const { error } = await supabase
    .from("bookings")
    .update(patch as never)
    .eq("id", input.bookingId);
  if (error) return { ok: false as const, error: error.message };

  const me = await getCurrentProfile();
  await supabase.from("booking_audit_log").insert({
    booking_id: input.bookingId,
    action: "updated",
    actor_id: me?.id ?? null,
    actor_name: me?.full_name ?? me?.email ?? null,
    changes: patch,
  } as never);

  revalidatePath("/admin/calendar");
  return { ok: true as const };
}

/* ──────────────── Bulk operations ──────────────── */
const BulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function bulkCancelBookings(
  raw: z.infer<typeof BulkIdsSchema> & { reason: string },
) {
  const parsed = BulkIdsSchema.safeParse({ ids: raw.ids });
  if (!parsed.success) return { ok: false as const, error: "validation" };
  if (!raw.reason?.trim())
    return { ok: false as const, error: "reason_required" };

  const supabase = createSupabaseAdminClient();
  const { data: rows } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, room:rooms(name), customer:customers(display_name)",
    )
    .in("id", parsed.data.ids);

  await Promise.all([
    supabase
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: raw.reason,
      } as never)
      .in("id", parsed.data.ids),
    supabase.from("booking_audit_log").insert(
      parsed.data.ids.map((id) => ({
        booking_id: id,
        action: "cancelled",
        reason: raw.reason,
      })) as never,
    ),
  ]);

  for (const r of (rows ?? []) as unknown as Array<{
    reference_code: string;
    starts_at: string;
    ends_at: string;
    room: { name: string };
    customer: { display_name: string };
  }>) {
    void dispatchEvent(
      "booking.cancelled",
      bookingCancelledTemplate({
        reference: r.reference_code,
        customerName: r.customer.display_name,
        roomName: r.room.name,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        reason: raw.reason,
      }),
    );
  }

  revalidatePath("/admin/calendar");
  return { ok: true as const, count: parsed.data.ids.length };
}

export async function bulkNotifyTelegram(
  raw: z.infer<typeof BulkIdsSchema> & { message: string },
) {
  const parsed = BulkIdsSchema.safeParse({ ids: raw.ids });
  if (!parsed.success) return { ok: false as const, error: "validation" };

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, room:rooms(name), customer:customers(display_name), starts_at, ends_at",
    )
    .in("id", parsed.data.ids);

  const head = raw.message?.trim() || "ประกาศจากแอดมิน";
  const lines: string[] = [`<b>${head}</b>`, ""];
  for (const b of (data ?? []) as unknown as Array<{
    reference_code: string;
    room: { name: string };
    customer: { display_name: string };
    starts_at: string;
    ends_at: string;
  }>) {
    lines.push(
      `• <code>${b.reference_code}</code> · ${b.customer.display_name} · ${b.room.name}`,
    );
  }

  void dispatchEvent("notification.system", lines.join("\n"));

  return { ok: true as const, count: parsed.data.ids.length };
}

/* ──────────────── Bulk send invoices (best-effort: just a Telegram blast) ──────────────── */
export async function bulkSendInvoices(raw: z.infer<typeof BulkIdsSchema>) {
  const parsed = BulkIdsSchema.safeParse({ ids: raw.ids });
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, total_amount, paid_amount, customer:customers(display_name, email), room:rooms(name)",
    )
    .in("id", parsed.data.ids);

  const lines = ["<b>ส่งใบแจ้งหนี้</b>", ""];
  for (const b of (data ?? []) as unknown as Array<{
    reference_code: string;
    total_amount: number;
    paid_amount: number;
    room: { name: string };
    customer: { display_name: string; email: string | null };
  }>) {
    const remaining = Math.max(0, Number(b.total_amount) - Number(b.paid_amount));
    lines.push(
      `• <code>${b.reference_code}</code> · ${b.customer.display_name} · ค้าง ${remaining.toLocaleString()} บาท · ${b.customer.email ?? "no-email"}`,
    );
  }
  void dispatchEvent("outstanding.alert", lines.join("\n"));
  return { ok: true as const, count: parsed.data.ids.length };
}

/* ──────────────── Booking lock (best-effort via metadata) ──────────────── */
type LockMeta = { by: string; by_name: string; until: string };

export async function acquireBookingLock(bookingId: string) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const, error: "auth_required" };

  const { data: existing } = await supabase
    .from("bookings")
    .select("metadata")
    .eq("id", bookingId)
    .maybeSingle();
  const meta = ((existing as { metadata?: Record<string, unknown> } | null)
    ?.metadata ?? {}) as Record<string, unknown>;
  const lock = meta.lock as LockMeta | undefined;
  const now = Date.now();

  if (lock && lock.by !== me.id && new Date(lock.until).getTime() > now) {
    return {
      ok: false as const,
      error: "locked_by_other",
      lockedBy: lock.by_name,
      until: lock.until,
    };
  }

  const newLock: LockMeta = {
    by: me.id,
    by_name: me.full_name ?? me.email ?? "ผู้ใช้",
    until: new Date(now + 5 * 60_000).toISOString(),
  };
  await supabase
    .from("bookings")
    .update({ metadata: { ...meta, lock: newLock } as never } as never)
    .eq("id", bookingId);

  return { ok: true as const, lock: newLock };
}

export async function releaseBookingLock(bookingId: string) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const };
  const { data: existing } = await supabase
    .from("bookings")
    .select("metadata")
    .eq("id", bookingId)
    .maybeSingle();
  const meta = ((existing as { metadata?: Record<string, unknown> } | null)
    ?.metadata ?? {}) as Record<string, unknown>;
  const lock = meta.lock as LockMeta | undefined;
  if (!lock || lock.by !== me.id) return { ok: true as const };
  const { lock: _drop, ...rest } = meta;
  void _drop;
  await supabase
    .from("bookings")
    .update({ metadata: rest as never } as never)
    .eq("id", bookingId);
  return { ok: true as const };
}

/* ──────────────── AI suggest alternative free slots ──────────────── */
export async function suggestAlternativeSlots(input: {
  roomId: string;
  durationMinutes: number;
  date: string;
  maxResults?: number;
}): Promise<
  Array<{
    startsAt: string;
    endsAt: string;
    startLabel: string;
    endLabel: string;
    score: number;
  }>
> {
  if (!input.roomId || !input.date || !input.durationMinutes) return [];
  const supabase = createSupabaseAdminClient();
  const dayStart = new Date(`${input.date}T00:00:00+07:00`);
  const dayEnd = new Date(`${input.date}T23:59:59+07:00`);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("room_id", input.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .order("starts_at");

  const taken = (bookings ?? []) as Array<{
    starts_at: string;
    ends_at: string;
  }>;

  const SERVICE_START = 8 * 60 + 30;
  const SERVICE_END = 22 * 60;
  const SLOT_STEP = 30;
  const duration = input.durationMinutes;

  function fromDayMinute(min: number) {
    const d = new Date(dayStart);
    d.setHours(0, min, 0, 0);
    return d;
  }
  function minutesOf(iso: string) {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }

  const suggestions: Array<{
    startsAt: string;
    endsAt: string;
    startLabel: string;
    endLabel: string;
    score: number;
  }> = [];

  for (let start = SERVICE_START; start + duration <= SERVICE_END; start += SLOT_STEP) {
    const end = start + duration;
    const conflict = taken.some((b) => {
      const bs = minutesOf(b.starts_at);
      const be = minutesOf(b.ends_at);
      return start < be && end > bs;
    });
    if (conflict) continue;
    const sDate = fromDayMinute(start);
    const eDate = fromDayMinute(end);
    const score = Math.max(0, 100 - Math.abs(start - (10 * 60))); // prefer near 10am
    const hh = (x: number) => String(Math.floor(x / 60)).padStart(2, "0");
    const mm = (x: number) => String(x % 60).padStart(2, "0");
    suggestions.push({
      startsAt: sDate.toISOString(),
      endsAt: eDate.toISOString(),
      startLabel: `${hh(start)}:${mm(start)}`,
      endLabel: `${hh(end)}:${mm(end)}`,
      score,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, input.maxResults ?? 5);
}
