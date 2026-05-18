"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import {
  upsertCustomerForBooking,
  generateBookingCode,
} from "@/lib/data";
import { dispatchEvent } from "@/lib/server/notifications";
import {
  bookingCreatedTemplate,
  paymentRecordedTemplate,
  bookingCancelledTemplate,
} from "@/lib/templates/telegram";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

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
    totalAmount: z.number().nonnegative(),
    depositAmount: z.number().nonnegative().default(0),
    paymentStatus: z.enum(["unpaid", "deposit", "paid", "free"]),
    freeReason: z.string().optional(),
    notes: z.string().optional(),
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

  const supabase = createSupabaseAdminClient();

  // 1. Find or create customer (Phase 1 = trigram only, AI verification later)
  const customerId = await upsertCustomerForBooking({
    name: input.customer.name,
    phone: input.customer.phone || undefined,
    email: input.customer.email || undefined,
    type: input.customer.type,
    source: input.customer.source,
  });

  // 2. Conflict check — overlapping bookings on the same room
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id, reference_code")
    .eq("room_id", input.booking.roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .lt("starts_at", input.booking.endsAt)
    .gt("ends_at", input.booking.startsAt);

  if (conflicts && conflicts.length > 0) {
    return {
      ok: false as const,
      error: "time_conflict",
      conflicts: conflicts as Array<{ id: string; reference_code: string }>,
    };
  }

  // 3. Insert booking
  const reference = await generateBookingCode();
  const paidAmount =
    input.booking.paymentStatus === "paid"
      ? input.booking.totalAmount
      : input.booking.paymentStatus === "deposit"
        ? input.booking.depositAmount
        : 0;

  const { data: bookingRow, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      reference_code: reference,
      source: "external",
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
      total_amount: input.booking.totalAmount,
      deposit_amount: input.booking.depositAmount,
      paid_amount: paidAmount,
      payment_status: input.booking.paymentStatus as PaymentStatus,
      booking_status: "confirmed",
      free_reason: input.booking.freeReason ?? null,
      source_channel: input.customer.source,
      source_detail: input.customer.sourceDetail ?? null,
      notes: input.booking.notes ?? null,
    } as never)
    .select("id, reference_code")
    .single();

  if (insertErr) {
    return { ok: false as const, error: insertErr.message };
  }

  const bookingId = (bookingRow as { id: string }).id;

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

  // 6. Audit
  await supabase.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "created",
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

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/dashboard");

  return {
    ok: true as const,
    bookingId,
    reference,
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
