"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import {
  upsertCustomerForBooking,
  generateBookingCode,
  findCustomerCandidates,
} from "@/lib/data";
import { dispatchEvent } from "@/lib/server/notifications";
import { recordAudit } from "./audit";
import {
  bookingCreatedTemplate,
  paymentRecordedTemplate,
  bookingCancelledTemplate,
  bookingHoldTemplate,
} from "@/lib/templates/telegram";
import { getCurrentProfile } from "@/lib/auth";
import { getSettingValue } from "./settings";
import {
  DEFAULT_HOLD_EXPIRY_DAYS,
  computeHoldExpiry,
} from "@/lib/booking-hold";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

/** Resolve the configured hold grace period, falling back to the default. */
async function resolveHoldExpiryDays(): Promise<number> {
  try {
    const policy = await getSettingValue<{ hold_expiry_days?: number }>(
      "booking.policy",
    );
    const raw = policy?.hold_expiry_days;
    if (typeof raw === "number" && raw > 0 && raw <= 90) return raw;
  } catch {
    // settings row missing / malformed — fall through to the default
  }
  return DEFAULT_HOLD_EXPIRY_DAYS;
}

/**
 * Live conflict check used by the booking form. Returns overlapping
 * bookings for the same room (excluding cancelled / no-show) so the UI can
 * warn before submission. Safe to call repeatedly — read-only.
 */
export async function checkBookingConflict(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
  excludeBookingId?: string;
}): Promise<
  Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    customer_name: string | null;
  }>
> {
  if (!input.roomId || !input.startsAt || !input.endsAt) return [];
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return [];

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, customer:customers(display_name)",
    )
    .eq("room_id", input.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt);

  if (input.excludeBookingId) {
    query = query.neq("id", input.excludeBookingId);
  }

  const { data } = await query;
  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    customer: { display_name: string } | null;
  }>).map((b) => ({
    id: b.id,
    reference_code: b.reference_code,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    customer_name: b.customer?.display_name ?? null,
  }));
}

/** Fuzzy customer lookup for booking form autocomplete. */
export async function searchCustomers(query: string) {
  if (!query.trim() || query.trim().length < 2) return [];
  const candidates = await findCustomerCandidates({ name: query.trim() });
  return candidates.slice(0, 6).map((c) => ({
    id: c.id,
    display_name: c.display_name,
    phone: c.phone,
    email: c.email,
    type: c.type,
    total_bookings: c.total_bookings,
    total_spent: c.total_spent,
    tags: c.tags,
    similarity: c.similarity,
  }));
}

/** Bookings for a room on a single day — used by the booking form calendar
 * to display existing bookings and grey-out booked slots. */
export async function listDayBookings(input: {
  roomId: string;
  date: string;
}): Promise<
  Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    customer_name: string | null;
    member_name: string | null;
    org_name: string | null;
    source: string;
  }>
> {
  if (!input.roomId || !input.date) return [];
  const supabase = createSupabaseAdminClient();
  const dayStart = new Date(`${input.date}T00:00:00+07:00`).toISOString();
  const dayEnd = new Date(`${input.date}T23:59:59+07:00`).toISOString();
  // Include "completed" so today's past finished bookings still show up — admin
  // wants to see the full day, not just the upcoming/active ones.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, booking_status, source, customer:customers(display_name), member:members(full_name), org:organizations(name, short_name)",
    )
    .eq("room_id", input.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use", "completed"])
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd)
    .order("starts_at");
  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    source: string;
    customer: { display_name: string } | null;
    member: { full_name: string } | null;
    org: { name: string; short_name: string | null } | null;
  }>).map((b) => ({
    id: b.id,
    reference_code: b.reference_code,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    booking_status: b.booking_status,
    source: b.source,
    customer_name: b.customer?.display_name ?? null,
    member_name: b.member?.full_name ?? null,
    org_name: b.org?.short_name ?? b.org?.name ?? null,
  }));
}

/** Active promotions for the booking form dropdown. */
export async function listActivePromotionsForBooking(): Promise<
  Array<{
    id: string;
    name: string;
    code: string | null;
    discount_type: string;
    discount_value: number;
    max_discount: number | null;
    min_order: number | null;
    applicable_room_ids: string[];
    ends_at: string | null;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("promotions")
    .select(
      "id, name, code, discount_type, discount_value, max_discount, min_order, applicable_room_ids, starts_at, ends_at, status",
    )
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    code: string | null;
    discount_type: string;
    discount_value: number;
    max_discount: number | null;
    min_order: number | null;
    applicable_room_ids: string[];
    starts_at: string;
    ends_at: string | null;
    status: string;
  }>)
    .filter((p) => !p.ends_at || new Date(p.ends_at) >= new Date())
    .map(({ starts_at: _s, status: _st, ...rest }) => rest);
}

/* ──────────────────── ติดจอง (tentative hold) ──────────────────── */

const CreateHoldSchema = z.object({
  roomId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  customerName: z.string().trim().min(1, "ใส่ชื่อลูกค้า"),
  // Deliberately optional: the whole point of a hold is to get it down while
  // the customer is still on the phone. Missing phone is surfaced as a warning
  // in the modal instead of blocking the save.
  customerPhone: z.string().trim().optional(),
  note: z.string().trim().optional(),
  source: z
    .enum([
      "line",
      "walk_in",
      "referral_bni",
      "facebook",
      "google",
      "email",
      "other",
    ])
    .default("other"),
});

export type CreateHoldInput = z.infer<typeof CreateHoldSchema>;

/**
 * Create a ติดจอง — blocks the room, carries no money, expires on its own.
 *
 * Kept separate from `createBooking` because that schema requires amounts and
 * a payment status, none of which exist yet when someone is simply holding a
 * slot over the phone.
 */
export async function createHold(raw: CreateHoldInput) {
  const parsed = CreateHoldSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  }
  const input = parsed.data;

  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    return { ok: false as const, error: "invalid_time_range" };
  }

  const supabase = createSupabaseAdminClient();

  // Conflict check first — cheaper than creating a customer we may not keep.
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id, reference_code")
    .eq("room_id", input.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt);

  if (conflicts && conflicts.length > 0) {
    return {
      ok: false as const,
      error: "time_conflict",
      conflicts: conflicts as Array<{ id: string; reference_code: string }>,
    };
  }

  const customerId = await upsertCustomerForBooking({
    name: input.customerName,
    phone: input.customerPhone || undefined,
    type: "individual",
    source: input.source,
  });

  const reference = await generateBookingCode();
  const holdDays = await resolveHoldExpiryDays();
  const expiresAt = computeHoldExpiry(input.startsAt, holdDays);

  const { data: bookingRow, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      reference_code: reference,
      source: "external",
      customer_id: customerId,
      room_id: input.roomId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      base_amount: 0,
      addons_amount: 0,
      discount_amount: 0,
      total_amount: 0,
      deposit_amount: 0,
      paid_amount: 0,
      payment_status: "unpaid" as PaymentStatus,
      booking_status: "pending",
      hold_expires_at: expiresAt,
      source_channel: input.source,
      notes: input.note ?? null,
    } as never)
    .select("id")
    .single();

  if (insertErr) {
    return { ok: false as const, error: insertErr.message };
  }

  const bookingId = (bookingRow as { id: string }).id;
  const me = await getCurrentProfile();

  await supabase.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "hold_created",
    actor_id: me?.id ?? null,
    actor_name: me?.full_name ?? me?.email ?? null,
    changes: { hold_expires_at: expiresAt, note: input.note ?? null },
  } as never);

  const { data: room } = await supabase
    .from("rooms")
    .select("name")
    .eq("id", input.roomId)
    .single();

  void dispatchEvent(
    "booking.hold",
    bookingHoldTemplate({
      reference,
      customerName: input.customerName,
      customerPhone: input.customerPhone || null,
      roomName: (room as { name: string } | null)?.name ?? "—",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      expiresAt,
      note: input.note ?? null,
      createdBy: me?.full_name ?? me?.email ?? null,
    }),
  );

  await recordAudit({
    action: "booking_created",
    targetType: "booking",
    targetId: bookingId,
    changes: {
      reference,
      kind: "hold",
      roomId: input.roomId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      holdExpiresAt: expiresAt,
    },
  });

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/dashboard");

  return {
    ok: true as const,
    bookingId,
    reference,
    holdExpiresAt: expiresAt,
    hasPhone: Boolean(input.customerPhone),
  };
}

/** Load a hold so the full booking form can pre-fill from it. */
export async function getHoldForConversion(bookingId: string): Promise<{
  id: string;
  reference_code: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  source_channel: string | null;
  hold_expires_at: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_type: string;
} | null> {
  if (!bookingId) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, room_id, starts_at, ends_at, notes, source_channel, hold_expires_at, booking_status, customer:customers(display_name, phone, email, type)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    reference_code: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    notes: string | null;
    source_channel: string | null;
    hold_expires_at: string | null;
    booking_status: string;
    customer: {
      display_name: string;
      phone: string | null;
      email: string | null;
      type: string;
    } | null;
  };
  // Only a live hold is convertible — a confirmed/cancelled booking must go
  // through the normal edit path instead.
  if (row.booking_status !== "pending") return null;
  return {
    id: row.id,
    reference_code: row.reference_code,
    room_id: row.room_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    notes: row.notes,
    source_channel: row.source_channel,
    hold_expires_at: row.hold_expires_at,
    customer_name: row.customer?.display_name ?? "",
    customer_phone: row.customer?.phone ?? null,
    customer_email: row.customer?.email ?? null,
    customer_type: row.customer?.type ?? "individual",
  };
}

const CreateBookingSchema = z.object({
  customer: z.object({
    name: z.string().min(1, "ใส่ชื่อลูกค้า"),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    type: z.enum(["individual", "company", "government"]).default("individual"),
    source: z
      .enum([
        "line",
        "walk_in",
        "referral_bni",
        "facebook",
        "google",
        "email",
        "other",
      ])
      .default("other"),
    sourceDetail: z.string().optional(),
  }),
  booking: z.object({
    roomId: z.string().uuid(),
    startsAt: z.string(),
    endsAt: z.string(),
    attendees: z.number().int().positive().optional(),
    packageId: z.string().uuid().optional(),
    addonIds: z.array(z.string().uuid()).default([]),
    baseAmount: z.number().nonnegative(),
    addonsAmount: z.number().nonnegative().default(0),
    discountAmount: z.number().nonnegative().default(0),
    discountNote: z.string().optional(),
    promotionId: z.string().uuid().optional(),
    totalAmount: z.number().nonnegative(),
    depositAmount: z.number().nonnegative().default(0),
    paymentStatus: z.enum(["unpaid", "deposit", "paid", "free"]),
    freeReason: z.string().optional(),
    notes: z.string().optional(),
    // Set when this submission converts an existing ติดจอง into a real
    // booking — the row is updated in place so the reference code survives.
    holdId: z.string().uuid().optional(),
  }),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export async function createBooking(raw: CreateBookingInput) {
  const parsed = CreateBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  }
  const input = parsed.data;

  if (input.booking.paymentStatus === "free" && !input.booking.freeReason) {
    return { ok: false as const, error: "free_reason_required" };
  }

  if (
    input.booking.discountAmount >
    input.booking.baseAmount + input.booking.addonsAmount
  ) {
    return { ok: false as const, error: "discount_exceeds_subtotal" };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Find or create customer (Phase 1 = trigram only, AI verification later)
  const customerId = await upsertCustomerForBooking({
    name: input.customer.name,
    phone: input.customer.phone || undefined,
    email: input.customer.email || undefined,
    type: input.customer.type,
    source: input.customer.source,
  });

  // 2. Conflict check — overlapping bookings on the same room. When converting
  //    a hold, that hold is the row we are about to overwrite, so it must not
  //    count as a conflict against itself.
  let conflictQuery = supabase
    .from("bookings")
    .select("id, reference_code")
    .eq("room_id", input.booking.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .lt("starts_at", input.booking.endsAt)
    .gt("ends_at", input.booking.startsAt);
  if (input.booking.holdId) {
    conflictQuery = conflictQuery.neq("id", input.booking.holdId);
  }
  const { data: conflicts } = await conflictQuery;

  if (conflicts && conflicts.length > 0) {
    return {
      ok: false as const,
      error: "time_conflict",
      conflicts: conflicts as Array<{ id: string; reference_code: string }>,
    };
  }

  // 3. Insert booking — or convert the hold in place, keeping its reference.
  const paidAmount =
    input.booking.paymentStatus === "paid"
      ? input.booking.totalAmount
      : input.booking.paymentStatus === "deposit"
        ? input.booking.depositAmount
        : 0;

  const fields = {
    customer_id: customerId,
    room_id: input.booking.roomId,
    starts_at: input.booking.startsAt,
    ends_at: input.booking.endsAt,
    attendees_count: input.booking.attendees ?? null,
    package_id: input.booking.packageId ?? null,
    base_amount: input.booking.baseAmount,
    addons_amount: input.booking.addonsAmount,
    discount_amount: input.booking.discountAmount,
    discount_note: input.booking.discountNote ?? null,
    promotion_id: input.booking.promotionId ?? null,
    total_amount: input.booking.totalAmount,
    deposit_amount: input.booking.depositAmount,
    paid_amount: paidAmount,
    payment_status: input.booking.paymentStatus as PaymentStatus,
    booking_status: "confirmed",
    free_reason: input.booking.freeReason ?? null,
    source_channel: input.customer.source,
    source_detail: input.customer.sourceDetail ?? null,
    notes: input.booking.notes ?? null,
  };

  let bookingId: string;
  let reference: string;

  if (input.booking.holdId) {
    const { data: converted, error: convertErr } = await supabase
      .from("bookings")
      .update({
        ...fields,
        // The room is no longer merely held — drop the expiry so the cron
        // stops watching it.
        hold_expires_at: null,
      } as never)
      .eq("id", input.booking.holdId)
      .eq("booking_status", "pending")
      .select("id, reference_code")
      .maybeSingle();

    if (convertErr) return { ok: false as const, error: convertErr.message };
    // Gone or already confirmed by someone else while this form was open.
    if (!converted) return { ok: false as const, error: "hold_not_found" };

    const row = converted as { id: string; reference_code: string };
    bookingId = row.id;
    reference = row.reference_code;

    // Addons/promotions are re-derived below; clear anything the hold carried.
    await supabase.from("booking_addons").delete().eq("booking_id", bookingId);
  } else {
    reference = await generateBookingCode();
    const { data: bookingRow, error: insertErr } = await supabase
      .from("bookings")
      .insert({
        ...fields,
        reference_code: reference,
        source: "external",
      } as never)
      .select("id, reference_code")
      .single();

    if (insertErr) {
      return { ok: false as const, error: insertErr.message };
    }
    bookingId = (bookingRow as { id: string }).id;
  }

  // 4. Booking addons
  if (input.booking.addonIds.length > 0) {
    const { data: addonsData } = await supabase
      .from("addons")
      .select("id, price")
      .in("id", input.booking.addonIds);
    if (addonsData) {
      await supabase.from("booking_addons").insert(
        (addonsData as Array<{ id: string; price: number }>).map((a) => ({
          booking_id: bookingId,
          addon_id: a.id,
          quantity: 1,
          unit_price: a.price,
        })) as never,
      );
    }
  }

  // 5. Initial payment if any
  if (paidAmount > 0) {
    await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      amount: paidAmount,
      method: "bank_transfer",
      notes: "บันทึกพร้อมสร้างการจอง",
    } as never);
  }

  // 5b. Promotion usage tracking
  if (input.booking.promotionId && input.booking.discountAmount > 0) {
    await supabase.from("promotion_usages").insert({
      promotion_id: input.booking.promotionId,
      booking_id: bookingId,
      customer_id: customerId,
      saving: input.booking.discountAmount,
    } as never);
    // best-effort increment of uses_count
    try {
      await supabase.rpc("increment_promotion_uses" as never, {
        p_promotion_id: input.booking.promotionId,
      } as never);
    } catch {
      // optional RPC
    }
  }

  // 6. Audit
  await supabase.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: input.booking.holdId ? "hold_confirmed" : "created",
    changes: { input },
  } as never);

  // 7. Customer aggregate refresh (cheap upsert)
  try {
    await supabase.rpc("touch_customer_aggregates" as never, {
      p_customer_id: customerId,
    } as never);
  } catch {
    // RPC may not exist yet — refresh in a follow-up migration.
  }

  // 8. Telegram
  const [{ data: room }, { data: customer }] = await Promise.all([
    supabase.from("rooms").select("name, capacity_max").eq("id", input.booking.roomId).single(),
    supabase.from("customers").select("display_name, phone, total_bookings, type").eq("id", customerId).single(),
  ]);
  const r = room as { name: string; capacity_max: number | null } | null;
  const c = customer as {
    display_name: string;
    phone: string | null;
    total_bookings: number;
    type: string;
  } | null;

  if (r && c) {
    const text = bookingCreatedTemplate({
      reference,
      customerName: c.display_name,
      customerPhone: c.phone ?? undefined,
      customerType:
        c.type === "company"
          ? "นิติบุคคล"
          : c.type === "government"
            ? "ข้าราชการ"
            : "บุคคลธรรมดา",
      roomName: r.name,
      roomCapacity: r.capacity_max ? `สูงสุด ${r.capacity_max} ท่าน` : undefined,
      startsAt: input.booking.startsAt,
      endsAt: input.booking.endsAt,
      attendees: input.booking.attendees,
      addons: [],
      discountAmount: input.booking.discountAmount,
      discountNote: input.booking.discountNote,
      totalAmount: input.booking.totalAmount,
      depositAmount: input.booking.depositAmount,
      paidAmount,
      paymentStatus: input.booking.paymentStatus,
      freeReason: input.booking.freeReason,
      notes: input.booking.notes,
      isReturningCustomer: c.total_bookings > 1,
      customerBookingCount: c.total_bookings,
    });
    void dispatchEvent("booking.created", text);

    if (input.booking.paymentStatus === "paid" && paidAmount > 0) {
      void dispatchEvent(
        "payment.paid",
        paymentRecordedTemplate({
          reference,
          customerName: c.display_name,
          roomName: r.name,
          amount: paidAmount,
          method: "โอนธนาคาร",
          totalAmount: input.booking.totalAmount,
          paidAmount,
          remainingAmount: 0,
        }),
      );
    } else if (input.booking.paymentStatus === "deposit" && paidAmount > 0) {
      void dispatchEvent(
        "payment.deposit",
        paymentRecordedTemplate({
          reference,
          customerName: c.display_name,
          roomName: r.name,
          amount: paidAmount,
          method: "โอนธนาคาร",
          totalAmount: input.booking.totalAmount,
          paidAmount,
          remainingAmount: input.booking.totalAmount - paidAmount,
        }),
      );
    } else if (input.booking.paymentStatus === "free") {
      void dispatchEvent(
        "payment.free",
        [
          "<b>บันทึกการจองฟรี</b>",
          "",
          `รหัส: <code>${reference}</code>`,
          `ผู้จอง: <b>${c.display_name}</b>`,
          `ห้อง: ${r.name}`,
          `มูลค่าปกติ: ${input.booking.totalAmount} บาท (ไม่ได้รับเงิน)`,
          `เหตุผล: ${input.booking.freeReason ?? "-"}`,
        ].join("\n"),
      );
    }
  }

  await recordAudit({
    action: "booking_created",
    targetType: "booking",
    targetId: bookingId,
    changes: {
      reference,
      roomId: input.booking.roomId,
      startsAt: input.booking.startsAt,
      endsAt: input.booking.endsAt,
      total: input.booking.totalAmount,
    },
  });

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/dashboard");

  return {
    ok: true as const,
    bookingId,
    reference,
    convertedFromHold: Boolean(input.booking.holdId),
  };
}

export async function cancelBooking(input: {
  bookingId: string;
  reason: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      `*, room:rooms(name), customer:customers(display_name)`,
    )
    .eq("id", input.bookingId)
    .single();
  if (fetchErr || !existing) {
    return { ok: false as const, error: "not_found" };
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      booking_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: input.reason,
    } as never)
    .eq("id", input.bookingId);
  if (updErr) {
    return { ok: false as const, error: updErr.message };
  }

  await supabase.from("booking_audit_log").insert({
    booking_id: input.bookingId,
    action: "cancelled",
    reason: input.reason,
  } as never);

  const row = existing as unknown as {
    reference_code: string;
    starts_at: string;
    ends_at: string;
    room: { name: string };
    customer: { display_name: string };
  };
  void dispatchEvent(
    "booking.cancelled",
    bookingCancelledTemplate({
      reference: row.reference_code,
      customerName: row.customer.display_name,
      roomName: row.room.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: input.reason,
    }),
  );

  await recordAudit({
    action: "booking_cancelled",
    targetType: "booking",
    targetId: input.bookingId,
    reason: input.reason,
  });

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  return { ok: true as const };
}

export async function recordPayment(input: {
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      `total_amount, paid_amount, reference_code,
       room:rooms(name), customer:customers(display_name)`,
    )
    .eq("id", input.bookingId)
    .single();
  if (fetchErr || !booking) {
    return { ok: false as const, error: "not_found" };
  }
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

  await Promise.all([
    supabase.from("booking_payments").insert({
      booking_id: input.bookingId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
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
      action: "paid",
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
      method: input.method,
      totalAmount: Number(row.total_amount),
      paidAmount: newPaid,
      remainingAmount: Math.max(0, Number(row.total_amount) - newPaid),
    }),
  );

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/finance");
  return { ok: true as const, paidAmount: newPaid, status: newStatus };
}
