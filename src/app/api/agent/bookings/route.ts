import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { createMemberBooking } from "@/lib/actions/members";
import { createBooking } from "@/lib/actions/bookings";
import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  resolveRoom,
  resolveWindow,
  listBusyBlocks,
  listAgentPackages,
  quoteBooking,
  renderBookingText,
  localTime,
  localDate,
  thaiLongDate,
  hoursBetween,
  today,
  TZ_OFFSET,
} from "@/lib/agent-api/core";
import { resolveAgentMember, memberUsage } from "@/lib/agent-api/members";
import {
  BOOKING_SELECT,
  shapeBooking,
  bookingFailure,
  type BookingRow,
} from "@/lib/agent-api/bookings";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/bookings
 *   ?date=YYYY-MM-DD | ?from=&to=   window (defaults to today)
 *   ?room=prime                     one room
 *   ?memberEmail= | ?memberId= | ?telegramUserId=   only this person's bookings
 *   ?status=confirmed|pending|cancelled|all
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const admin = createSupabaseAdminClient();

    const date = url.searchParams.get("date");
    const from = url.searchParams.get("from") ?? date ?? today();
    const to = url.searchParams.get("to") ?? date ?? from;

    let query = admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .gte("starts_at", new Date(`${from}T00:00:00${TZ_OFFSET}`).toISOString())
      .lte("starts_at", new Date(`${to}T23:59:59${TZ_OFFSET}`).toISOString())
      .order("starts_at");

    const status = url.searchParams.get("status") ?? "active";
    if (status === "active") {
      query = query.in("booking_status", ["pending", "confirmed", "in_use"]);
    } else if (status !== "all") {
      query = query.eq("booking_status", status);
    }

    const roomRef = url.searchParams.get("room");
    if (roomRef) {
      const room = await resolveRoom(roomRef);
      if (!room) return jsonError("room_not_found", `ไม่พบห้อง "${roomRef}"`, 404);
      query = query.eq("room_id", room.id);
    }

    const memberId = url.searchParams.get("memberId");
    const memberEmail = url.searchParams.get("memberEmail");
    const telegramUserId = url.searchParams.get("telegramUserId");
    if (memberId || memberEmail || telegramUserId) {
      const member = await resolveAgentMember({
        memberId: memberId ?? undefined,
        email: memberEmail ?? undefined,
        telegramUserId: telegramUserId ?? undefined,
      });
      if (!member) return jsonError("member_not_found", "ไม่พบสมาชิกที่ระบุ", 404);
      query = query.eq("member_id", member.memberId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const bookings = ((data ?? []) as unknown as BookingRow[]).map(shapeBooking);

    return jsonOk({
      ok: true,
      from,
      to,
      count: bookings.length,
      bookings,
      text:
        bookings.length === 0
          ? "ไม่มีการจองในช่วงที่ค้นหา"
          : bookings
              .map(
                (b) =>
                  `${b.startTime}–${b.endTime} · ${b.room?.name ?? "-"} · ${b.title ?? b.bookedBy ?? "-"} (${b.reference})`,
              )
              .join("\n"),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}

interface CreateBody {
  mode?: "member" | "customer";
  room?: string;
  roomId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  agenda?: string;
  attendees?: number;
  attendeeEmails?: string[];
  notes?: string;
  isPublic?: boolean;
  // member mode identity
  memberId?: string;
  memberEmail?: string;
  memberPhone?: string;
  telegramUserId?: string | number;
  // customer mode
  customer?: {
    name: string;
    phone?: string;
    email?: string;
    type?: "individual" | "company" | "government";
    source?:
      | "line"
      | "walk_in"
      | "referral_bni"
      | "facebook"
      | "google"
      | "email"
      | "other";
  };
  asHold?: boolean;
  paymentStatus?: "unpaid" | "deposit" | "paid" | "free";
  depositAmount?: number;
  totalAmount?: number;
  discountAmount?: number;
  freeReason?: string;
  /** ตรวจสอบอย่างเดียว ไม่บันทึกลงระบบ — ใช้ตอนให้ผู้ใช้ยืนยันก่อน */
  dryRun?: boolean;
}

/**
 * POST /api/agent/bookings — the "ลงระบบให้เลย" step.
 *
 * mode "member" (default): an internal booking for a member of an org. Free,
 * confirmed immediately, pushed to Telegram/Google Calendar/email exactly as
 * the member portal does.
 *
 * mode "customer": a paying booking for an outside customer. Amounts are
 * quoted automatically unless supplied; `asHold: true` files it as ติดจอง.
 */
export async function POST(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as CreateBody;
    const mode = body.mode ?? "member";

    const roomRef = body.roomId ?? body.room;
    if (!roomRef) return jsonError("room_required", "ต้องระบุห้อง (room)");
    const room = await resolveRoom(roomRef);
    if (!room) return jsonError("room_not_found", `ไม่พบห้อง "${roomRef}"`, 404);

    const win = resolveWindow(body);
    if (!win.ok) return jsonError("bad_window", win.message);
    if (new Date(win.startsAt).getTime() < Date.now() - 60_000) {
      return jsonError("past_time", "จองย้อนหลังไม่ได้");
    }
    if (
      body.attendees &&
      room.capacity_max &&
      body.attendees > room.capacity_max
    ) {
      return jsonError(
        "over_capacity",
        `${room.name} รองรับได้สูงสุด ${room.capacity_max} ท่าน (ขอมา ${body.attendees} ท่าน)`,
      );
    }

    if (body.dryRun) {
      const busy = await listBusyBlocks(localDate(win.startsAt), [room.id]);
      const clash = busy.find(
        (b) =>
          new Date(b.startsAt).getTime() < new Date(win.endsAt).getTime() &&
          new Date(b.endsAt).getTime() > new Date(win.startsAt).getTime(),
      );
      const packages = await listAgentPackages();
      const quote = quoteBooking(room, packages, win.startsAt, win.endsAt);
      return jsonOk({
        ok: true,
        dryRun: true,
        available: !clash,
        conflict: clash ?? null,
        room: { id: room.id, name: room.name, thumbnail_url: room.thumbnail_url },
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        date: localDate(win.startsAt),
        dateLabel: thaiLongDate(win.startsAt),
        startTime: localTime(win.startsAt),
        endTime: localTime(win.endsAt),
        hours: quote.hours,
        quote: mode === "customer" ? quote : null,
        text: clash
          ? `${room.name} ไม่ว่างช่วงนี้ (ชนกับ ${clash.title} ${clash.startTime}–${clash.endTime})`
          : `${room.name} · ${thaiLongDate(win.startsAt)} ${localTime(win.startsAt)}–${localTime(win.endsAt)} น. ว่าง พร้อมลงระบบ`,
      });
    }

    if (mode === "member") {
      const member = await resolveAgentMember({
        memberId: body.memberId,
        email: body.memberEmail,
        phone: body.memberPhone,
        telegramUserId: body.telegramUserId,
      });
      if (!member) {
        return jsonError(
          "member_not_found",
          "ไม่พบสมาชิก — ส่ง memberEmail หรือผูก telegramUserId ก่อน",
          404,
        );
      }
      if (!body.title?.trim()) {
        return jsonError("title_required", "ต้องระบุหัวข้อประชุม (title)");
      }

      const result = await createMemberBooking(
        {
          roomId: room.id,
          startsAt: win.startsAt,
          endsAt: win.endsAt,
          attendees: body.attendees,
          title: body.title.trim(),
          agenda: body.agenda,
          isPublic: body.isPublic ?? true,
          notes: body.notes,
          attendeeEmails: body.attendeeEmails ?? [],
        },
        { memberId: member.memberId, orgId: member.orgId },
      );

      if (!result.ok) return bookingFailure(result);

      const usage = await memberUsage(member.orgId);
      const text = renderBookingText({
        reference: result.reference,
        roomName: room.name,
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        title: body.title,
        attendees: body.attendees,
        bookedBy: `${member.fullName} · ${member.orgName}`,
        status: "confirmed",
      });

      return jsonOk({
        ok: true,
        bookingId: result.bookingId,
        reference: result.reference,
        mode: "member",
        room: { id: room.id, name: room.name, thumbnail_url: room.thumbnail_url },
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        date: localDate(win.startsAt),
        dateLabel: thaiLongDate(win.startsAt),
        startTime: localTime(win.startsAt),
        endTime: localTime(win.endsAt),
        hours: hoursBetween(win.startsAt, win.endsAt),
        title: body.title,
        member: {
          id: member.memberId,
          name: member.fullName,
          email: member.email,
          org: member.orgName,
        },
        quota: {
          usedHours: usage.hoursThisMonth,
          quotaHours: usage.quotaHoursMonthly,
          unlimited: usage.quotaUnlimited,
        },
        text,
      });
    }

    // ─── customer (paying) booking ──────────────────────────────────────
    if (!body.customer?.name?.trim()) {
      return jsonError("customer_required", "ต้องระบุ customer.name");
    }
    const packages = await listAgentPackages();
    const quote = quoteBooking(room, packages, win.startsAt, win.endsAt);
    const discount = body.discountAmount ?? 0;
    const total =
      body.totalAmount ?? Math.max(0, quote.baseAmount - discount);
    const paymentStatus = body.paymentStatus ?? "unpaid";

    const result = await createBooking({
      customer: {
        name: body.customer.name.trim(),
        phone: body.customer.phone,
        email: body.customer.email,
        type: body.customer.type ?? "individual",
        source: body.customer.source ?? "line",
        sourceDetail: "AI agent (Telegram)",
      },
      booking: {
        roomId: room.id,
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        attendees: body.attendees,
        packageId: quote.packageId ?? undefined,
        addonIds: [],
        baseAmount: quote.baseAmount,
        addonsAmount: 0,
        discountAmount: discount,
        totalAmount: total,
        depositAmount: body.depositAmount ?? 0,
        paymentStatus,
        asHold: body.asHold ?? false,
        freeReason: body.freeReason,
        notes: [body.title, body.notes].filter(Boolean).join(" · ") || undefined,
      },
    });

    if (!result.ok) return bookingFailure(result);

    return jsonOk({
      ok: true,
      bookingId: result.bookingId,
      reference: result.reference,
      mode: "customer",
      room: { id: room.id, name: room.name, thumbnail_url: room.thumbnail_url },
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      date: localDate(win.startsAt),
      dateLabel: thaiLongDate(win.startsAt),
      startTime: localTime(win.startsAt),
      endTime: localTime(win.endsAt),
      hours: quote.hours,
      quote,
      totalAmount: total,
      status: body.asHold ? "pending" : "confirmed",
      text: renderBookingText({
        reference: result.reference,
        roomName: room.name,
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        title: body.title,
        attendees: body.attendees,
        bookedBy: body.customer.name,
        totalAmount: total,
        status: body.asHold ? "pending" : "confirmed",
      }),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
