"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  bkkToday,
  getPublicRoomConfig,
  listPublicBusy,
} from "@/lib/data/public-rooms";
import { linkLineToBooking } from "@/lib/server/booking-line";
import {
  bookingIdByToken,
  cancelPublicBookingByToken,
  createPublicBooking,
  type PublicBookingResult,
} from "@/lib/server/public-booking";
import {
  normalisePhone,
  parseChannel,
  type PublicBusyBlock,
} from "@/lib/public-booking/shared";

/**
 * Entry points for the public `/rooms/*` pages. No session: everything a
 * stranger can reach is validated here and re-checked in the engine.
 */

const SubmitSchema = z.object({
  roomId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(30).max(14 * 60),
  name: z.string().trim().min(2, "กรุณากรอกชื่อ-นามสกุล").max(120),
  phone: z.string().trim().min(9, "กรุณากรอกเบอร์โทรศัพท์").max(20),
  email: z
    .string()
    .trim()
    .max(160)
    .email("รูปแบบอีเมลไม่ถูกต้อง")
    .optional()
    .or(z.literal("")),
  company: z.string().trim().max(160).optional(),
  attendees: z.number().int().min(1).max(500).optional(),
  note: z.string().trim().max(500).optional(),
  channel: z.string().optional(),
  /** LIFF access token — verified server-side, never trusted as-is. */
  lineAccessToken: z.string().max(2000).optional(),
  /** Honeypot — real people never see this field. */
  website: z.string().optional(),
});

export type SubmitPublicBookingInput = z.infer<typeof SubmitSchema>;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim() || null;
  return h.get("x-real-ip");
}

export async function submitPublicBooking(
  raw: SubmitPublicBookingInput,
): Promise<PublicBookingResult | { ok: false; error: "validation"; message: string; field?: string }> {
  const parsed = SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: "validation",
      message: issue?.message ?? "ข้อมูลไม่ครบถ้วน",
      field: issue?.path.join("."),
    };
  }
  const input = parsed.data;

  // Bots fill every field. Pretend it worked so they don't learn anything.
  if (input.website) {
    return { ok: false, error: "failed", message: "บันทึกการจองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  const phone = normalisePhone(input.phone);
  if (!phone) {
    return {
      ok: false,
      error: "validation",
      message: "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวอย่าง 081-234-5678)",
      field: "phone",
    };
  }

  const result = await createPublicBooking({
    roomId: input.roomId,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    name: input.name.replace(/\s+/g, " "),
    phone,
    email: input.email || null,
    company: input.company || null,
    attendees: input.attendees ?? null,
    note: input.note || null,
    channel: input.lineAccessToken ? "line" : parseChannel(input.channel),
    ip: await clientIp(),
    lineAccessToken: input.lineAccessToken || null,
  });

  if (result.ok) {
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/dashboard");
  }
  return result;
}

/** Fresh busy blocks for one room, for the whole bookable window. */
export async function refreshPublicBusy(roomId: string): Promise<PublicBusyBlock[]> {
  if (!z.string().uuid().safeParse(roomId).success) return [];
  const cfg = await getPublicRoomConfig();
  const map = await listPublicBusy({
    roomIds: [roomId],
    fromDate: bkkToday(),
    days: cfg.booking_days_ahead + 1,
    includeInternal: !cfg.allow_override_internal,
  });
  return map.get(roomId) ?? [];
}

export async function cancelPublicBooking(reference: string, token: string) {
  const ref = String(reference ?? "").slice(0, 32);
  const tok = String(token ?? "").slice(0, 64);
  const result = await cancelPublicBookingByToken(ref, tok);
  if (result.ok) {
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/bookings");
  }
  return result;
}

/** Tie a booking to the LINE account the customer opened it with (LIFF). */
export async function linkLineAccount(reference: string, token: string, accessToken: string) {
  const id = await bookingIdByToken(String(reference ?? "").slice(0, 32), String(token ?? "").slice(0, 64));
  if (!id) return { ok: false as const, message: "ไม่พบการจอง" };
  const r = await linkLineToBooking(id, String(accessToken ?? "").slice(0, 2000));
  return r.ok
    ? { ok: true as const, pushed: Boolean(r.pushed), message: r.message }
    : { ok: false as const, message: r.message ?? "เชื่อม LINE ไม่สำเร็จ" };
}
