"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  emailMatchesAllowedDomains,
  getInviteByCode,
  incrementInviteUsage,
} from "@/lib/data/invites";
import { dispatchEvent } from "@/lib/server/notifications";
import { escapeHtml } from "@/lib/integrations/telegram";
import {
  bookingCreatedTemplate,
  bookingCancelledTemplate,
} from "@/lib/templates/telegram";
import { generateBookingCode } from "@/lib/data/bookings";

// ─── Register member through invite link ───────────────────────────────────
const RegisterSchema = z.object({
  inviteCode: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  position: z.string().optional(),
});

export type RegisterMemberInput = z.infer<typeof RegisterSchema>;

export async function registerMember(raw: RegisterMemberInput) {
  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  }
  const input = parsed.data;

  const invite = await getInviteByCode(input.inviteCode);
  if (!invite) {
    return { ok: false as const, error: "invite_invalid" };
  }
  if (!emailMatchesAllowedDomains(input.email, invite.organization.email_domains)) {
    return {
      ok: false as const,
      error: "domain_not_allowed",
      allowedDomains: invite.organization.email_domains,
    };
  }

  const admin = createSupabaseAdminClient();
  const user = await getCurrentUser();

  // Find or create member by email
  const { data: existing } = await admin
    .from("members")
    .select("id, profile_id")
    .eq("email", input.email.toLowerCase())
    .maybeSingle();

  let memberId: string;
  if (existing) {
    memberId = (existing as { id: string }).id;
    await admin
      .from("members")
      .update({
        full_name: input.fullName,
        phone: input.phone ?? null,
        position: input.position ?? null,
        profile_id: user?.id ?? (existing as { profile_id: string | null }).profile_id ?? null,
        is_active: true,
      } as never)
      .eq("id", memberId);
  } else {
    const { data, error } = await admin
      .from("members")
      .insert({
        profile_id: user?.id ?? null,
        email: input.email.toLowerCase(),
        full_name: input.fullName,
        phone: input.phone ?? null,
        position: input.position ?? null,
        is_active: true,
      } as never)
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    memberId = (data as { id: string }).id;
  }

  // Link to org (upsert idempotent)
  await admin
    .from("member_organizations")
    .upsert(
      {
        member_id: memberId,
        org_id: invite.organization.id,
        tier: "member",
        is_active: true,
        joined_at: new Date().toISOString(),
      } as never,
      { onConflict: "member_id,org_id" },
    );

  await incrementInviteUsage(invite.id);

  void dispatchEvent(
    "internal.member_joined",
    [
      "<b>สมาชิกใหม่ในองค์กร</b>",
      "",
      `องค์กร: <b>${escapeHtml(invite.organization.name)}</b>`,
      `ชื่อ: <b>${escapeHtml(input.fullName)}</b>`,
      `Email: ${escapeHtml(input.email)}`,
      input.position ? `ตำแหน่ง: ${escapeHtml(input.position)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  revalidatePath("/admin/users");
  return { ok: true as const, memberId, orgId: invite.organization.id };
}

// ─── Member creates own booking ────────────────────────────────────────────
const MemberBookingSchema = z.object({
  roomId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  attendees: z.number().int().positive().optional(),
  title: z.string().min(1, "ใส่หัวข้อประชุม"),
  agenda: z.string().optional(),
  isPublic: z.boolean().default(true),
  notes: z.string().optional(),
});

export type MemberBookingInput = z.infer<typeof MemberBookingSchema>;

export async function createMemberBooking(
  raw: MemberBookingInput,
  ctx: { memberId: string; orgId: string },
) {
  const parsed = MemberBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  }
  const input = parsed.data;
  const admin = createSupabaseAdminClient();

  // Conflict check — same room overlap
  const { data: conflicts } = await admin
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

  const reference = await generateBookingCode();
  const { data: row, error } = await admin
    .from("bookings")
    .insert({
      reference_code: reference,
      source: "internal",
      member_id: ctx.memberId,
      org_id: ctx.orgId,
      room_id: input.roomId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      attendees_count: input.attendees ?? null,
      base_amount: 0,
      addons_amount: 0,
      discount_amount: 0,
      total_amount: 0,
      deposit_amount: 0,
      paid_amount: 0,
      payment_status: "free",
      booking_status: "confirmed",
      free_reason: "Internal booking",
      internal_title: input.title,
      internal_agenda: input.agenda ?? null,
      is_public: input.isPublic,
      notes: input.notes ?? null,
    } as never)
    .select("id, reference_code")
    .single();

  if (error) return { ok: false as const, error: error.message };

  const bookingId = (row as { id: string }).id;

  await admin.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "created",
    changes: { source: "member_portal", input },
  } as never);

  // Telegram notify (booking.created topic 2)
  const [{ data: roomRow }, { data: memberRow }, { data: orgRow }] = await Promise.all([
    admin.from("rooms").select("name, capacity_max").eq("id", input.roomId).single(),
    admin.from("members").select("full_name").eq("id", ctx.memberId).single(),
    admin.from("organizations").select("name").eq("id", ctx.orgId).single(),
  ]);
  const room = roomRow as { name: string; capacity_max: number | null } | null;
  const member = memberRow as { full_name: string } | null;
  const org = orgRow as { name: string } | null;

  if (room && member) {
    const text = bookingCreatedTemplate({
      reference,
      customerName: `${member.full_name} · ${org?.name ?? ""}`,
      roomName: room.name,
      roomCapacity: room.capacity_max ? `สูงสุด ${room.capacity_max} ท่าน` : undefined,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendees: input.attendees,
      totalAmount: 0,
      paymentStatus: "free",
      freeReason: "ผู้ใช้ภายใน",
      notes: input.notes ?? `หัวข้อ: ${input.title}`,
      isReturningCustomer: false,
    });
    void dispatchEvent("booking.created", text);
  }

  revalidatePath("/app");
  revalidatePath("/app/calendar");
  revalidatePath("/app/my-bookings");
  revalidatePath("/admin/calendar");

  return { ok: true as const, bookingId, reference };
}

export async function cancelMemberBooking(input: {
  bookingId: string;
  memberId: string;
  reason: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("bookings")
    .select(
      `reference_code, member_id, starts_at, ends_at,
       room:rooms(name), member:members(full_name)`,
    )
    .eq("id", input.bookingId)
    .single();
  if (!existing) return { ok: false as const, error: "not_found" };
  const row = existing as unknown as {
    reference_code: string;
    member_id: string | null;
    starts_at: string;
    ends_at: string;
    room: { name: string };
    member: { full_name: string };
  };
  if (row.member_id !== input.memberId) {
    return { ok: false as const, error: "not_owner" };
  }

  await admin
    .from("bookings")
    .update({
      booking_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: input.reason,
    } as never)
    .eq("id", input.bookingId);

  await admin.from("booking_audit_log").insert({
    booking_id: input.bookingId,
    action: "cancelled",
    reason: input.reason,
    changes: { source: "member_portal" },
  } as never);

  void dispatchEvent(
    "booking.cancelled",
    bookingCancelledTemplate({
      reference: row.reference_code,
      customerName: row.member.full_name,
      roomName: row.room.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: input.reason,
    }),
  );

  revalidatePath("/app/my-bookings");
  revalidatePath("/app/calendar");
  revalidatePath("/admin/calendar");
  return { ok: true as const };
}
