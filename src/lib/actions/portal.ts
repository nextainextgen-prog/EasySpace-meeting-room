"use server";

/**
 * Server actions behind the one-page member portal. Each one resolves the
 * member from the signed-in session — never from anything the browser sends —
 * then hands off to the shared member-ops layer the Telegram bot uses too.
 */

import { getCurrentMember } from "@/lib/data/members";
import {
  bookForMember,
  cancelForMember,
  ctxFromMemberContext,
  endNowForMember,
  extendForMember,
  moveForMember,
  renameForMember,
  type BookResult,
  type OpResult,
} from "@/lib/server/member-ops";
import { loadPortalData, type PortalData } from "@/lib/server/portal-data";

async function me() {
  const c = await getCurrentMember();
  return c ? ctxFromMemberContext(c) : null;
}

const SIGNED_OUT: OpResult = { ok: false, message: "เซสชันหมดอายุ เข้าสู่ระบบใหม่อีกครั้ง" };

export async function portalRefresh(): Promise<PortalData | null> {
  const ctx = await me();
  return ctx ? loadPortalData(ctx) : null;
}

export async function portalBook(input: {
  roomId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  attendees?: number;
  repeatWeeks?: number;
}): Promise<BookResult> {
  const ctx = await me();
  if (!ctx) return { ok: false, code: "auth", message: SIGNED_OUT.message };
  return bookForMember(ctx, { ...input, channel: "portal" });
}

export async function portalCancel(bookingId: string, reason: string): Promise<OpResult> {
  const ctx = await me();
  return ctx ? cancelForMember(ctx, bookingId, reason) : SIGNED_OUT;
}

export async function portalMove(
  bookingId: string,
  to: { date: string; start: string; end: string; roomId?: string },
): Promise<OpResult> {
  const ctx = await me();
  return ctx ? moveForMember(ctx, bookingId, to) : SIGNED_OUT;
}

export async function portalExtend(bookingId: string, minutes: number): Promise<OpResult> {
  const ctx = await me();
  if (!ctx) return SIGNED_OUT;
  if (![15, 30, 60].includes(minutes)) return { ok: false, message: "ต่อได้ 15, 30 หรือ 60 นาที" };
  return extendForMember(ctx, bookingId, minutes);
}

export async function portalEndNow(bookingId: string): Promise<OpResult> {
  const ctx = await me();
  return ctx ? endNowForMember(ctx, bookingId) : SIGNED_OUT;
}

export async function portalRename(bookingId: string, title: string): Promise<OpResult> {
  const ctx = await me();
  return ctx ? renameForMember(ctx, bookingId, title) : SIGNED_OUT;
}
