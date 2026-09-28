/**
 * Booking shapes shared by the Agent API routes. Kept out of the route files
 * because a Next route module may only export handlers and route config.
 */

import { jsonError } from "./core";
import {
  localDate,
  localTime,
  thaiLongDate,
  hoursBetween,
} from "./core";

export const BOOKING_SELECT = `id, reference_code, room_id, starts_at, ends_at, attendees_count,
  booking_status, payment_status, total_amount, paid_amount, source, internal_title,
  internal_agenda, notes, hold_expires_at, cancelled_reason, created_at,
  room:rooms(id, name, thumbnail_url, capacity_max),
  customer:customers(display_name, phone),
  member:members(id, full_name, email),
  org:organizations(name)`;

export interface BookingRow {
  id: string;
  reference_code: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  booking_status: string;
  payment_status: string;
  total_amount: number;
  paid_amount: number;
  source: "internal" | "external";
  internal_title: string | null;
  internal_agenda: string | null;
  notes: string | null;
  hold_expires_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  room: {
    id: string;
    name: string;
    thumbnail_url: string | null;
    capacity_max: number | null;
  } | null;
  customer: { display_name: string; phone: string | null } | null;
  member: { id: string; full_name: string; email: string } | null;
  org: { name: string } | null;
}

export function shapeBooking(row: BookingRow) {
  return {
    id: row.id,
    reference: row.reference_code,
    status: row.booking_status,
    paymentStatus: row.payment_status,
    kind: row.source,
    room: row.room
      ? {
          id: row.room.id,
          name: row.room.name,
          thumbnail_url: row.room.thumbnail_url,
          capacity_max: row.room.capacity_max,
        }
      : null,
    date: localDate(row.starts_at),
    dateLabel: thaiLongDate(row.starts_at),
    startTime: localTime(row.starts_at),
    endTime: localTime(row.ends_at),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    hours: hoursBetween(row.starts_at, row.ends_at),
    title: row.internal_title,
    agenda: row.internal_agenda,
    attendees: row.attendees_count,
    bookedBy:
      row.member?.full_name ??
      row.customer?.display_name ??
      row.org?.name ??
      null,
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    notes: row.notes,
    holdExpiresAt: row.hold_expires_at,
    cancelledReason: row.cancelled_reason,
    createdAt: row.created_at,
  };
}

/** Map the server actions' failure shapes onto HTTP + a Thai message. */
export function bookingFailure(result: {
  error?: string;
  conflicts?: Array<{ id: string; reference_code: string }>;
  issues?: unknown;
}) {
  if (result.error === "time_conflict") {
    return jsonError(
      "time_conflict",
      "ช่วงเวลานี้มีการจองอยู่แล้ว เลือกเวลาอื่นหรือห้องอื่น",
      409,
      { conflicts: result.conflicts ?? [] },
    );
  }
  if (result.error === "validation") {
    return jsonError("validation", "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง", 422, {
      issues: result.issues,
    });
  }
  return jsonError("create_failed", result.error ?? "สร้างการจองไม่สำเร็จ", 400);
}
