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
import { sendEmail, meetingInviteEmail } from "@/lib/email";

// ─── Register member through invite link ───────────────────────────────────
const RegisterSchema = z.object({
  inviteCode: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
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
  const emailLc = input.email.toLowerCase();

  // 1. If signed in, prefer the member already tied to this profile — there
  //    is a UNIQUE (profile_id) constraint, so we must reuse that row rather
  //    than insert a fresh one keyed on email.
  // 2. Otherwise look up by email.
  type ExistingMember = {
    id: string;
    profile_id: string | null;
    email: string;
  };
  let existing: ExistingMember | null = null;

  if (user?.id) {
    const { data } = await admin
      .from("members")
      .select("id, profile_id, email")
      .eq("profile_id", user.id)
      .maybeSingle();
    existing = (data as ExistingMember | null) ?? null;
  }
  if (!existing) {
    const { data } = await admin
      .from("members")
      .select("id, profile_id, email")
      .eq("email", emailLc)
      .maybeSingle();
    existing = (data as ExistingMember | null) ?? null;
  }

  // Only attach this auth user as the profile owner if no other member row
  // already claims it — prevents the duplicate-key crash.
  let profileIdToSet: string | null =
    existing?.profile_id ?? user?.id ?? null;
  if (user?.id && existing && existing.profile_id && existing.profile_id !== user.id) {
    // Different account already claims this member row — leave profile_id alone.
    profileIdToSet = existing.profile_id;
  } else if (user?.id && !existing) {
    // Inserting fresh; double-check that no other row uses this profile_id.
    const { data: claimed } = await admin
      .from("members")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (claimed) profileIdToSet = null;
  }

  let memberId: string;
  if (existing) {
    memberId = existing.id;
    await admin
      .from("members")
      .update({
        full_name: input.fullName,
        email: emailLc,
        phone: input.phone ?? null,
        position: input.position ?? null,
        profile_id: profileIdToSet,
        is_active: true,
      } as never)
      .eq("id", memberId);
  } else {
    const { data, error } = await admin
      .from("members")
      .insert({
        profile_id: profileIdToSet,
        email: emailLc,
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

  // Upsert department by name (per-org). Empty/missing → no department.
  let departmentId: string | null = null;
  if (input.department?.trim()) {
    const depName = input.department.trim();
    const { data: existingDept } = await admin
      .from("departments")
      .select("id")
      .eq("org_id", invite.organization.id)
      .ilike("name", depName)
      .maybeSingle();
    if (existingDept) {
      departmentId = (existingDept as { id: string }).id;
    } else {
      const { data: newDept } = await admin
        .from("departments")
        .insert({
          org_id: invite.organization.id,
          name: depName,
        } as never)
        .select("id")
        .single();
      departmentId = (newDept as { id: string } | null)?.id ?? null;
    }
  }

  // Link to org (upsert idempotent)
  await admin
    .from("member_organizations")
    .upsert(
      {
        member_id: memberId,
        org_id: invite.organization.id,
        department_id: departmentId,
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
  attendeeEmails: z.array(z.string().email()).default([]),
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
      metadata: {
        attendee_emails: input.attendeeEmails,
      },
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

  // Telegram + Email notify
  const [{ data: roomRow }, { data: memberRow }, { data: orgRow }] = await Promise.all([
    admin.from("rooms").select("name, capacity_max").eq("id", input.roomId).single(),
    admin
      .from("members")
      .select("full_name, email")
      .eq("id", ctx.memberId)
      .single(),
    admin.from("organizations").select("name").eq("id", ctx.orgId).single(),
  ]);
  const room = roomRow as { name: string; capacity_max: number | null } | null;
  const member = memberRow as { full_name: string; email: string } | null;
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

    // Email — organizer (confirmation) + each attendee (invitation). Fire and
    // forget; never block the booking response on the mail provider.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://easy-space-meeting-room-yjqk.vercel.app";
    const emailParams = {
      title: input.title,
      organizerName: member.full_name,
      organizerEmail: member.email,
      orgName: org?.name ?? null,
      roomName: room.name,
      roomCapacity: room.capacity_max,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendees: input.attendees ?? null,
      agenda: input.agenda ?? null,
      notes: input.notes ?? null,
      attendeeEmails: input.attendeeEmails,
      reference,
      appUrl,
      bookingId,
    };

    void (async () => {
      try {
        const organizerMsg = meetingInviteEmail(emailParams, "organizer");
        await sendEmail({
          to: member.email,
          subject: organizerMsg.subject,
          html: organizerMsg.html,
          text: organizerMsg.text,
          replyTo: member.email,
        });
      } catch (e) {
        console.error("[email] organizer notify failed:", e);
      }
    })();

    for (const attendee of input.attendeeEmails) {
      // Skip if the attendee email is the organizer themselves.
      if (attendee.toLowerCase() === member.email.toLowerCase()) continue;
      void (async () => {
        try {
          const inviteMsg = meetingInviteEmail(emailParams, "attendee");
          await sendEmail({
            to: attendee,
            subject: inviteMsg.subject,
            html: inviteMsg.html,
            text: inviteMsg.text,
            replyTo: member.email,
          });
        } catch (e) {
          console.error(`[email] attendee notify failed (${attendee}):`, e);
        }
      })();
    }
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
