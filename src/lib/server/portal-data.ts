/**
 * One payload for the one-page member portal: who you are, how much of the
 * month is used, what you have booked, what is free, and what to book next.
 */

import { addDays, bkkDate } from "@/lib/time/bkk";
import { getTelegramLink } from "@/lib/tgbot/store";
import {
  describeBlockFor,
  getOpenHours,
  listBlocks,
  listMemberRooms,
  listOwnBookings,
  suggestForMember,
  usageFor,
  type MemberCtx,
  type MemberUsage,
  type OpenHours,
  type OwnBooking,
  type PortalRoom,
  type RoomSuggestion,
} from "./member-ops";

export const PORTAL_DAYS = 14;

export interface PortalBlock {
  id: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  mine: boolean;
  label: string;
}

export interface PortalData {
  serverNow: string;
  today: string;
  me: { name: string; email: string; position: string | null; orgName: string; tier: string };
  usage: MemberUsage;
  hours: OpenHours;
  rooms: PortalRoom[];
  blocks: PortalBlock[];
  upcoming: OwnBooking[];
  past: OwnBooking[];
  cancelled: OwnBooking[];
  suggestions: RoomSuggestion[];
  telegram: { linked: boolean; botUsername: string };
}

export async function loadPortalData(ctx: MemberCtx): Promise<PortalData> {
  const today = bkkDate(new Date());
  const until = addDays(today, PORTAL_DAYS - 1);
  const [rooms, blocks, hours, usage, mine, link] = await Promise.all([
    listMemberRooms(),
    listBlocks(today, until),
    getOpenHours(),
    usageFor(ctx),
    listOwnBookings(ctx, { fromDate: addDays(today, -30), toDate: addDays(today, 90), includeCancelled: true }),
    getTelegramLink({ memberId: ctx.memberId }),
  ]);
  const suggestions = await suggestForMember(ctx, rooms, blocks, { hours });

  const now = Date.now();
  const active = mine.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  return {
    serverNow: new Date().toISOString(),
    today,
    me: {
      name: ctx.fullName,
      email: ctx.email,
      position: ctx.position,
      orgName: ctx.orgName,
      tier: ctx.tier,
    },
    usage,
    hours,
    rooms,
    blocks: blocks.map((b) => ({
      id: b.id,
      roomId: b.roomId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      ...describeBlockFor(ctx, b),
    })),
    upcoming: active.filter((b) => Date.parse(b.endsAt) > now),
    past: active.filter((b) => Date.parse(b.endsAt) <= now).reverse().slice(0, 20),
    cancelled: mine
      .filter((b) => b.status === "cancelled" && Date.parse(b.startsAt) > now - 14 * 86_400_000)
      .reverse()
      .slice(0, 10),
    suggestions,
    telegram: {
      linked: !!link,
      botUsername: process.env.TGBOT_USERNAME ?? "EasySpaceBookingBot",
    },
  };
}
