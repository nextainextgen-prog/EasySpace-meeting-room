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
  internalBookingCreatedTemplate,
  bookingCancelledTemplate,
} from "@/lib/templates/telegram";
import { generateBookingCode } from "@/lib/data/bookings";
import { getOrgUsage } from "@/lib/data/organizations";
import { sendEmail, meetingInviteEmail } from "@/lib/email";
import {
  createCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/integrations/google-calendar";

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

  // Ensure a profiles row exists for this auth user — members.profile_id has
  // a FK to profiles(id), so a Google sign-up that bypasses any auth-trigger
  // would otherwise blow up the members INSERT with "key not present in
  // profiles". Idempotent: do nothing if the row is already there.
  if (user?.id) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!existingProfile) {
      const { error: profErr } = await admin.from("profiles").insert({
        id: user.id,
        email: user.email ?? emailLc,
        full_name: input.fullName,
        role: "viewer",
      } as never);
      if (profErr && !/duplicate|already exists/i.test(profErr.message)) {
        console.error("[registerMember] profile insert failed", profErr);
        return { ok: false as const, error: `profile:${profErr.message}` };
      }
    }
  }

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
    const { error: updErr } = await admin
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
    if (updErr) {
      // Most common cause: profile_id unique-violation when a different auth
      // user already claims this member row. Drop the profile_id and retry —
      // the row stays usable by the email-based lookup at login time.
      const retry = await admin
        .from("members")
        .update({
          full_name: input.fullName,
          email: emailLc,
          phone: input.phone ?? null,
          position: input.position ?? null,
          is_active: true,
        } as never)
        .eq("id", memberId);
      if (retry.error) {
        console.error("[registerMember] update failed", retry.error);
        return { ok: false as const, error: `update:${retry.error.message}` };
      }
    }
  } else {
    const tryInsert = async (profileId: string | null) =>
      admin
        .from("members")
        .insert({
          profile_id: profileId,
          email: emailLc,
          full_name: input.fullName,
          phone: input.phone ?? null,
          position: input.position ?? null,
          is_active: true,
        } as never)
        .select("id")
        .single();

    let { data, error } = await tryInsert(profileIdToSet);
    // If profile_id collides (another member already owns this auth user),
    // insert without the link — admin can reconcile later.
    if (
      error &&
      profileIdToSet &&
      /profile_id|unique/i.test(error.message)
    ) {
      const retry = await tryInsert(null);
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      console.error("[registerMember] insert failed", error);
      return { ok: false as const, error: `insert:${error.message}` };
    }
    memberId = (data as unknown as { id: string }).id;
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
  const { error: moErr } = await admin
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
  if (moErr) {
    console.error("[registerMember] member_organizations upsert failed", moErr);
    return { ok: false as const, error: `link:${moErr.message}` };
  }

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
const RecurrenceRuleEnum = z.enum([
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekdays",
  "custom",
]);

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
  recurrence: z
    .object({
      rule: RecurrenceRuleEnum,
      count: z.number().int().min(1).max(52),
      startHour: z.number().int().min(0).max(23),
      startMinute: z.number().int().min(0).max(59),
      durationMin: z.number().int().min(30).max(24 * 60),
    })
    .optional(),
});

export type MemberBookingInput = z.infer<typeof MemberBookingSchema>;

/** Expand a starting date into the recurrence series (yyyy-mm-dd strings). */
function expandRecurrenceDates(
  startsAt: string,
  rule: z.infer<typeof RecurrenceRuleEnum>,
  count: number,
): string[] {
  const start = new Date(startsAt);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dates: string[] = [];

  if (rule === "weekdays") {
    const d = new Date(start);
    while (dates.length < count) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) dates.push(fmt(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    if (rule === "daily") d.setDate(d.getDate() + i);
    else if (rule === "weekly") d.setDate(d.getDate() + i * 7);
    else if (rule === "monthly") d.setMonth(d.getMonth() + i);
    else if (rule === "yearly") d.setFullYear(d.getFullYear() + i);
    else if (rule === "custom") d.setDate(d.getDate() + i * 7);
    dates.push(fmt(d));
  }
  return dates;
}

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

  // Conflict check — same room overlap (for primary occurrence only).
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
      is_recurring: !!input.recurrence,
      recurrence_rule: input.recurrence?.rule ?? null,
      metadata: {
        attendee_emails: input.attendeeEmails,
        recurrence: input.recurrence ?? null,
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

  // ── Recurring expansion ─────────────────────────────────────────────
  // Generate sibling bookings for the same time-of-day across the series.
  // Each sibling is independent; conflicts are silently skipped so the
  // user gets "5/8 created, 3 skipped" feedback instead of all-or-nothing.
  let recurrenceCreated = 1;
  let recurrenceSkipped = 0;
  if (input.recurrence) {
    const dates = expandRecurrenceDates(
      input.startsAt,
      input.recurrence.rule,
      input.recurrence.count,
    );
    const occurrenceDurationMs =
      new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime();

    // skip the first one — it's the primary we already inserted
    const hh = String(input.recurrence.startHour).padStart(2, "0");
    const mm = String(input.recurrence.startMinute).padStart(2, "0");
    for (let i = 1; i < dates.length; i++) {
      const dateStr = dates[i];
      // Build the start in Bangkok TZ explicitly — using setHours() here
      // would apply server-local time (UTC on Vercel) and shift the date
      // back by one day for any morning slot.
      const occStart = new Date(`${dateStr}T${hh}:${mm}:00+07:00`);
      const occEnd = new Date(occStart.getTime() + occurrenceDurationMs);

      const { data: conflict } = await admin
        .from("bookings")
        .select("id")
        .eq("room_id", input.roomId)
        .in("booking_status", ["pending", "confirmed", "in_use"])
        .lt("starts_at", occEnd.toISOString())
        .gt("ends_at", occStart.toISOString())
        .limit(1);
      if (conflict && conflict.length > 0) {
        recurrenceSkipped += 1;
        continue;
      }

      const occRef = await generateBookingCode();
      const { error: occErr } = await admin.from("bookings").insert({
        reference_code: occRef,
        source: "internal",
        member_id: ctx.memberId,
        org_id: ctx.orgId,
        room_id: input.roomId,
        starts_at: occStart.toISOString(),
        ends_at: occEnd.toISOString(),
        attendees_count: input.attendees ?? null,
        base_amount: 0,
        addons_amount: 0,
        discount_amount: 0,
        total_amount: 0,
        deposit_amount: 0,
        paid_amount: 0,
        payment_status: "free",
        booking_status: "confirmed",
        free_reason: "Internal booking (recurring)",
        internal_title: input.title,
        internal_agenda: input.agenda ?? null,
        is_public: input.isPublic,
        notes: input.notes ?? null,
        is_recurring: true,
        recurrence_rule: input.recurrence.rule,
        metadata: {
          attendee_emails: input.attendeeEmails,
          recurrence_of: reference,
        },
      } as never);
      if (occErr) {
        recurrenceSkipped += 1;
        continue;
      }
      recurrenceCreated += 1;
    }
  }

  // Telegram + Email notify — internal/member booking gets the rich
  // internalBookingCreatedTemplate (with quota + position + department).
  const [
    { data: roomRow },
    { data: memberRow },
    { data: orgRow },
    { data: memberOrgRow },
    orgUsage,
  ] = await Promise.all([
    admin.from("rooms").select("name, capacity_max").eq("id", input.roomId).single(),
    admin
      .from("members")
      .select("full_name, email, position")
      .eq("id", ctx.memberId)
      .single(),
    admin.from("organizations").select("name").eq("id", ctx.orgId).single(),
    admin
      .from("member_organizations")
      .select("department:departments(name)")
      .eq("member_id", ctx.memberId)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    getOrgUsage(ctx.orgId),
  ]);
  const room = roomRow as { name: string; capacity_max: number | null } | null;
  const member = memberRow as {
    full_name: string;
    email: string;
    position: string | null;
  } | null;
  const org = orgRow as { name: string } | null;
  const department = (
    (memberOrgRow as { department: { name: string } | null } | null)?.department
      ?.name ?? null
  ) as string | null;

  if (room && member) {
    const bookingHours =
      (new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime()) /
      3_600_000;
    const text = internalBookingCreatedTemplate({
      reference,
      memberName: member.full_name,
      position: member.position ?? undefined,
      department: department ?? undefined,
      orgName: org?.name ?? "องค์กรภายใน",
      roomName: room.name,
      roomCapacity: room.capacity_max ? `สูงสุด ${room.capacity_max} ท่าน` : undefined,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendees: input.attendees,
      topic: input.title,
      bookingHours,
      quotaUsed: orgUsage.hoursThisMonth,
      quotaTotal: orgUsage.quotaHoursMonthly,
      quotaUnlimited: orgUsage.quotaUnlimited,
    });
    void dispatchEvent("booking.created", text);

    // Google Calendar — push the event to the shared calendar as a record.
    // Service accounts cannot invite attendees (Workspace + DWD required), so
    // the event is created without attendees and Resend handles all invites.
    const calendarAttendees = Array.from(
      new Set([
        member.email,
        ...input.attendeeEmails.filter(Boolean),
      ]),
    );
    const calendarDescription = [
      `Reference: ${reference}`,
      input.agenda ? `Agenda: ${input.agenda}` : null,
      input.notes ? `Notes: ${input.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    void (async () => {
      const calendarResult = await createCalendarEvent({
        summary: input.title,
        description: calendarDescription || undefined,
        start: input.startsAt,
        end: input.endsAt,
        attendees: calendarAttendees,
        location: room.name,
      });
      if (calendarResult.ok) {
        await admin
          .from("bookings")
          .update({ google_event_id: calendarResult.eventId } as never)
          .eq("id", bookingId);
      }
    })();

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

  return {
    ok: true as const,
    bookingId,
    reference,
    recurrenceCreated,
    recurrenceSkipped,
  };
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
      `reference_code, member_id, starts_at, ends_at, google_event_id,
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
    google_event_id: string | null;
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

  if (row.google_event_id) {
    void deleteCalendarEvent(row.google_event_id);
  }

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
