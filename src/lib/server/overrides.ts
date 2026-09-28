/**
 * Queue overrides — what happens after a paying customer takes a slot a free
 * internal booking (Thunder etc.) held.
 *
 * Each displaced internal booking carries `metadata.displaced_by`:
 *   { reference, at, action: relocated|released, from_room_id,
 *     from_starts_at, from_ends_at, original_status, to_room_id?,
 *     restored_at?, resolution? }
 * so the whole case is reconstructed from bookings alone — no extra table.
 *
 * A case is OPEN until someone decides: moved to another slot, member asked
 * to rebook, acknowledged, or the customer booking cancelled and the slot
 * handed back. Automatic restores (customer never paid) close it too.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { createInAppNotification, dispatchEvent } from "@/lib/server/notifications";
import { restoreDisplacedFor } from "@/lib/server/public-booking";
import { sendBookingLine } from "@/lib/server/booking-line";
import { escapeHtml } from "@/lib/integrations/telegram";
import { publicBaseUrl } from "@/lib/data/public-rooms";
import { addDays, bkkDate, bkkDateLabel, bkkTime, fromBkk } from "@/lib/time/bkk";
import { PUBLIC_CLOSE_TIME, PUBLIC_OPEN_TIME, minutesToTime } from "@/lib/public-booking/shared";
import { timeToMinutes } from "@/lib/time/bkk";

const ACTIVE = ["pending", "confirmed", "in_use"];

export type OverrideResolution = "moved" | "member_rebook" | "acknowledged" | "customer_cancelled" | "auto_restored";

export interface DisplacedMarker {
  reference: string;
  at: string;
  action: "relocated" | "released";
  from_room_id: string;
  from_starts_at?: string;
  from_ends_at?: string;
  original_status: string;
  to_room_id?: string;
  restored_at?: string;
  resolution?: { kind: OverrideResolution; at: string; by: string | null; note?: string | null; to?: { room_id: string; starts_at: string; ends_at: string } };
}

export interface OverrideCase {
  id: string; // internal booking id
  state: "open" | "resolved";
  outcome: "relocated" | "released" | "restored" | OverrideResolution;
  marker: DisplacedMarker;
  internal: {
    id: string;
    reference: string;
    status: string;
    title: string | null;
    attendees: number | null;
    roomId: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
    originalRoomName: string;
    originalStartsAt: string;
    originalEndsAt: string;
    memberName: string | null;
    memberPhone: string | null;
    memberEmail: string | null;
    orgName: string | null;
  };
  customer: {
    id: string;
    reference: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    paidAmount: number;
    holdExpiresAt: string | null;
    name: string;
    company: string | null;
    phone: string | null;
    roomName: string;
    startsAt: string;
    endsAt: string;
    channel: string | null;
  } | null;
}

interface InternalRow {
  id: string;
  reference_code: string;
  booking_status: string;
  internal_title: string | null;
  attendees_count: number | null;
  room_id: string;
  starts_at: string;
  ends_at: string;
  metadata: { displaced_by?: DisplacedMarker } & Record<string, unknown>;
  room: { name: string } | null;
  member: { full_name: string; phone: string | null; email: string | null; profile_id: string | null } | null;
  org: { name: string; short_name: string | null } | null;
}

export async function listOverrides(): Promise<OverrideCase[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      `id, reference_code, booking_status, internal_title, attendees_count, room_id, starts_at, ends_at, metadata,
       room:rooms(name), member:members(full_name, phone, email, profile_id), org:organizations(name, short_name)`,
    )
    .eq("source", "internal")
    .not("metadata->displaced_by", "is", null)
    .order("starts_at", { ascending: true })
    .limit(300);
  const rows = (data ?? []) as unknown as InternalRow[];
  if (rows.length === 0) return [];

  const refs = [...new Set(rows.map((r) => r.metadata.displaced_by!.reference))];
  const { data: custData } = await admin
    .from("bookings")
    .select(
      `id, reference_code, booking_status, payment_status, total_amount, paid_amount, hold_expires_at,
       starts_at, ends_at, source_channel, metadata, room:rooms(name),
       customer:customers(display_name, company_name, phone)`,
    )
    .in("reference_code", refs);
  const byRef = new Map(
    ((custData ?? []) as unknown as Array<{
      id: string;
      reference_code: string;
      booking_status: string;
      payment_status: string;
      total_amount: number;
      paid_amount: number;
      hold_expires_at: string | null;
      starts_at: string;
      ends_at: string;
      source_channel: string | null;
      metadata: { public?: { company?: string | null } } | null;
      room: { name: string } | null;
      customer: { display_name: string; company_name: string | null; phone: string | null } | null;
    }>).map((c) => [c.reference_code, c]),
  );

  const { data: roomsData } = await admin.from("rooms").select("id, name");
  const roomName = new Map(((roomsData ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));

  return rows.map((r) => {
    const m = r.metadata.displaced_by!;
    const c = byRef.get(m.reference) ?? null;
    const outcome: OverrideCase["outcome"] = m.resolution
      ? m.resolution.kind
      : m.restored_at
        ? "restored"
        : m.action;
    const state: OverrideCase["state"] = m.resolution || m.restored_at ? "resolved" : "open";
    return {
      id: r.id,
      state,
      outcome,
      marker: m,
      internal: {
        id: r.id,
        reference: r.reference_code,
        status: r.booking_status,
        title: r.internal_title,
        attendees: r.attendees_count,
        roomId: r.room_id,
        roomName: r.room?.name ?? "-",
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        originalRoomName: roomName.get(m.from_room_id) ?? "-",
        originalStartsAt: m.from_starts_at ?? r.starts_at,
        originalEndsAt: m.from_ends_at ?? r.ends_at,
        memberName: r.member?.full_name ?? null,
        memberPhone: r.member?.phone ?? null,
        memberEmail: r.member?.email ?? null,
        orgName: r.org?.short_name ?? r.org?.name ?? null,
      },
      customer: c
        ? {
            id: c.id,
            reference: c.reference_code,
            status: c.booking_status,
            paymentStatus: c.payment_status,
            totalAmount: Number(c.total_amount),
            paidAmount: Number(c.paid_amount),
            holdExpiresAt: c.hold_expires_at,
            name: c.customer?.display_name ?? "-",
            company: c.metadata?.public?.company || c.customer?.company_name || null,
            phone: c.customer?.phone ?? null,
            roomName: c.room?.name ?? "-",
            startsAt: c.starts_at,
            endsAt: c.ends_at,
            channel: c.source_channel,
          }
        : null,
    };
  });
}

/** Open cases, for the sidebar badge — one head-count query. */
export async function countOpenOverrides(): Promise<number> {
  try {
    const admin = createSupabaseAdminClient();
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("source", "internal")
      .not("metadata->displaced_by", "is", null)
      .is("metadata->displaced_by->resolution", null)
      .is("metadata->displaced_by->restored_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── Suggestions ──────────────────────────────────────────────────────────

export interface SlotSuggestion {
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  label: string;
  kind: "same_time_other_room" | "same_room_nearby" | "other_room_nearby" | "next_day";
}

/** Free slots that fit the displaced meeting: same length, room big enough. */
export async function suggestSlots(internalId: string, limit = 6): Promise<SlotSuggestion[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, room_id, starts_at, ends_at, attendees_count, metadata")
    .eq("id", internalId)
    .maybeSingle();
  const b = data as unknown as {
    id: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    attendees_count: number | null;
    metadata: { displaced_by?: DisplacedMarker } | null;
  } | null;
  if (!b) return [];
  const m = b.metadata?.displaced_by;
  const wantStart = m?.from_starts_at ?? b.starts_at;
  const wantEnd = m?.from_ends_at ?? b.ends_at;
  const originRoom = m?.from_room_id ?? b.room_id;
  const minutes = Math.round((new Date(wantEnd).getTime() - new Date(wantStart).getTime()) / 60_000);

  const { data: roomsData } = await admin
    .from("rooms")
    .select("id, name, capacity_max, allow_internal, status, display_order")
    .eq("status", "active")
    .order("display_order");
  const rooms = ((roomsData ?? []) as Array<{ id: string; name: string; capacity_max: number | null; allow_internal: boolean }>).filter(
    (r) => r.allow_internal !== false && (!b.attendees_count || !r.capacity_max || r.capacity_max >= b.attendees_count),
  );
  if (rooms.length === 0) return [];

  const day = bkkDate(wantStart);
  const days = [day, addDays(day, 1)];
  const from = fromBkk(days[0], "00:00").toISOString();
  const to = fromBkk(addDays(days[1], 1), "00:00").toISOString();
  const { data: busyData } = await admin
    .from("bookings")
    .select("id, room_id, starts_at, ends_at")
    .in("room_id", rooms.map((r) => r.id))
    .in("booking_status", ACTIVE)
    .lt("starts_at", to)
    .gt("ends_at", from);
  const busy = ((busyData ?? []) as Array<{ id: string; room_id: string; starts_at: string; ends_at: string }>).filter(
    (x) => x.id !== b.id,
  );
  const free = (roomId: string, s: number, e: number) =>
    !busy.some((x) => x.room_id === roomId && new Date(x.starts_at).getTime() < e && new Date(x.ends_at).getTime() > s);

  const now = Date.now();
  const target = new Date(wantStart).getTime();
  const out: Array<SlotSuggestion & { score: number }> = [];
  const push = (room: { id: string; name: string }, date: string, time: string, kind: SlotSuggestion["kind"], score: number) => {
    const s = fromBkk(date, time).getTime();
    const e = s + minutes * 60_000;
    if (s < now || !free(room.id, s, e)) return;
    const startsAt = new Date(s).toISOString();
    if (out.some((o) => o.roomId === room.id && o.startsAt === startsAt)) return;
    out.push({
      roomId: room.id,
      roomName: room.name,
      startsAt,
      endsAt: new Date(e).toISOString(),
      kind,
      score,
      label: `${room.name} · ${date === day ? "วันเดิม" : bkkDateLabel(startsAt)} ${bkkTime(startsAt)}–${bkkTime(new Date(e).toISOString())}`,
    });
  };

  const open = timeToMinutes(PUBLIC_OPEN_TIME);
  const close = timeToMinutes(PUBLIC_CLOSE_TIME);
  const origTime = bkkTime(wantStart);

  // 1. Same time, another room — the least disruptive fix.
  for (const r of rooms) if (r.id !== originRoom) push(r, day, origTime, "same_time_other_room", 0);

  // 2. Same day, nearest free window — original room first.
  for (const r of rooms) {
    for (let t = open; t + minutes <= close; t += 30) {
      const time = minutesToTime(t);
      const dist = Math.abs(fromBkk(day, time).getTime() - target) / 60_000;
      if (dist === 0) continue;
      push(r, day, time, r.id === originRoom ? "same_room_nearby" : "other_room_nearby", dist + (r.id === originRoom ? 0 : 45));
    }
  }

  // 3. Next day, same time, original room.
  const origin = rooms.find((r) => r.id === originRoom);
  if (origin) push(origin, days[1], origTime, "next_day", 24 * 60);

  return out
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);
}

// ─── Actions ──────────────────────────────────────────────────────────────

async function loadInternal(id: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      `id, reference_code, booking_status, room_id, starts_at, ends_at, internal_title, metadata,
       room:rooms(name), member:members(full_name, profile_id), org:organizations(name, short_name)`,
    )
    .eq("id", id)
    .maybeSingle();
  return data as unknown as (InternalRow & { member: { full_name: string; profile_id: string | null } | null }) | null;
}

async function markResolved(row: InternalRow, resolution: NonNullable<DisplacedMarker["resolution"]>, patch: Record<string, unknown> = {}) {
  const admin = createSupabaseAdminClient();
  const metadata = {
    ...row.metadata,
    displaced_by: { ...row.metadata.displaced_by!, resolution },
  };
  const { error } = await admin
    .from("bookings")
    .update({ ...patch, metadata } as never)
    .eq("id", row.id);
  if (error) throw error;
}

function who(row: InternalRow) {
  return [row.org?.short_name ?? row.org?.name, row.member?.full_name].filter(Boolean).join(" · ") || "ผู้ใช้ภายใน";
}

export async function moveDisplaced(opts: {
  internalId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const row = await loadInternal(opts.internalId);
  if (!row?.metadata?.displaced_by) return { ok: false, message: "ไม่พบรายการ" };
  const admin = createSupabaseAdminClient();

  const { data: clash } = await admin
    .from("bookings")
    .select("id")
    .eq("room_id", opts.roomId)
    .in("booking_status", ACTIVE)
    .lt("starts_at", opts.endsAt)
    .gt("ends_at", opts.startsAt)
    .neq("id", row.id)
    .limit(1);
  if ((clash ?? []).length > 0) return { ok: false, message: "ช่วงเวลานี้เพิ่งถูกจองไป กรุณาเลือกช่วงอื่น" };

  const m = row.metadata.displaced_by;
  const status = ACTIVE.includes(row.booking_status)
    ? row.booking_status
    : ACTIVE.includes(m.original_status)
      ? m.original_status
      : "confirmed";
  await markResolved(
    row,
    {
      kind: "moved",
      at: new Date().toISOString(),
      by: opts.actorName,
      to: { room_id: opts.roomId, starts_at: opts.startsAt, ends_at: opts.endsAt },
    },
    {
      room_id: opts.roomId,
      starts_at: opts.startsAt,
      ends_at: opts.endsAt,
      booking_status: status,
      cancelled_at: null,
      cancelled_reason: null,
    },
  );

  const { data: room } = await admin.from("rooms").select("name").eq("id", opts.roomId).maybeSingle();
  const roomName = (room as { name: string } | null)?.name ?? "-";
  const when = `${bkkDateLabel(opts.startsAt)} ${bkkTime(opts.startsAt)}–${bkkTime(opts.endsAt)} น.`;
  await admin.from("booking_audit_log").insert({
    booking_id: row.id,
    action: "override_moved",
    actor_id: opts.actorId,
    actor_name: opts.actorName,
    changes: { room_id: opts.roomId, starts_at: opts.startsAt, ends_at: opts.endsAt },
    reason: `จัดการคิวทับจาก ${m.reference}`,
  } as never);

  await Promise.allSettled([
    row.member?.profile_id
      ? createInAppNotification({
          level: "success",
          category: "system",
          title: "ได้ห้องประชุมใหม่แล้ว",
          body: `${row.internal_title ? `"${row.internal_title}" ` : ""}ย้ายไป ${roomName} ${when} (แทนช่วงที่ลูกค้าภายนอกใช้)`,
          link: `/app/booking/${row.id}`,
          relatedId: row.id,
          recipientId: row.member.profile_id,
        })
      : Promise.resolve(),
    dispatchEvent(
      "booking.override",
      [
        "✅ <b>จัดการคิวทับแล้ว — ย้ายคิวภายใน</b>",
        `<code>${escapeHtml(row.reference_code)}</code> ${escapeHtml(who(row))}`,
        `→ ${escapeHtml(roomName)} ${when}`,
        `โดย ${escapeHtml(opts.actorName)}`,
      ].join("\n"),
    ),
  ]);
  return { ok: true };
}

export async function resolveWithoutMove(opts: {
  internalId: string;
  kind: "member_rebook" | "acknowledged";
  note: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const row = await loadInternal(opts.internalId);
  if (!row?.metadata?.displaced_by) return { ok: false, message: "ไม่พบรายการ" };
  await markResolved(row, { kind: opts.kind, at: new Date().toISOString(), by: opts.actorName, note: opts.note || null });
  if (opts.kind === "member_rebook" && row.member?.profile_id) {
    await createInAppNotification({
      level: "warning",
      category: "system",
      title: "กรุณาเลือกเวลาประชุมใหม่",
      body: `${row.internal_title ? `"${row.internal_title}" ` : ""}ช่วงเดิมถูกใช้โดยลูกค้าภายนอก${opts.note ? ` · ${opts.note}` : ""}`,
      link: "/app/booking/new",
      relatedId: row.id,
      recipientId: row.member.profile_id,
    });
  }
  return { ok: true };
}

/**
 * Rare: the customer booking should not stand (no-show risk, duplicate,
 * spam). Cancel it and hand every displaced internal slot straight back.
 */
export async function cancelCustomerAndRestore(opts: {
  internalId: string;
  reason: string;
  actorName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const row = await loadInternal(opts.internalId);
  const ref = row?.metadata?.displaced_by?.reference;
  if (!row || !ref) return { ok: false, message: "ไม่พบรายการ" };
  const admin = createSupabaseAdminClient();
  const { data: cust } = await admin
    .from("bookings")
    .select("id, booking_status, paid_amount")
    .eq("reference_code", ref)
    .maybeSingle();
  const c = cust as { id: string; booking_status: string; paid_amount: number } | null;
  if (!c) return { ok: false, message: "ไม่พบการจองของลูกค้า" };
  if (Number(c.paid_amount) > 0) {
    return { ok: false, message: "ลูกค้าชำระเงินแล้ว — ยกเลิกผ่านหน้าปฏิทินพร้อมจัดการคืนเงิน" };
  }
  if (ACTIVE.includes(c.booking_status)) {
    await admin
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: `แอดมินยกเลิกเพื่อคืนคิวภายใน: ${opts.reason}`,
        hold_expires_at: null,
      } as never)
      .eq("id", c.id);
    await admin.from("booking_audit_log").insert({
      booking_id: c.id,
      action: "cancelled",
      actor_name: opts.actorName,
      reason: `คืนคิวภายใน: ${opts.reason}`,
    } as never);
    void sendBookingLine(c.id, "cancelled");
  }
  await restoreDisplacedFor(c.id);
  // Relocated meetings keep their new room; still mark every case closed.
  const fresh = await loadInternal(opts.internalId);
  if (fresh?.metadata?.displaced_by && !fresh.metadata.displaced_by.resolution) {
    await markResolved(fresh, { kind: "customer_cancelled", at: new Date().toISOString(), by: opts.actorName, note: opts.reason });
  }
  return { ok: true };
}

/**
 * The customer behind an override just paid: nothing will auto-restore now,
 * so tell the team which internal meetings still need a home.
 */
export async function notifyOverrideFinal(customerBookingId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("reference_code, customer:customers(display_name, company_name), metadata")
    .eq("id", customerBookingId)
    .maybeSingle();
  const c = data as unknown as {
    reference_code: string;
    customer: { display_name: string; company_name: string | null } | null;
    metadata: { public?: { company?: string | null; displaced?: Array<{ id: string }> } } | null;
  } | null;
  const ids = (c?.metadata?.public?.displaced ?? []).map((d) => d.id);
  if (!c || ids.length === 0) return;

  const { data: rows } = await admin
    .from("bookings")
    .select("id, reference_code, metadata, member:members(full_name), org:organizations(name, short_name)")
    .in("id", ids);
  const open = ((rows ?? []) as unknown as InternalRow[]).filter((r) => {
    const m = r.metadata?.displaced_by;
    return m && m.reference === c.reference_code && !m.resolution && !m.restored_at;
  });
  if (open.length === 0) return;

  const name = c.metadata?.public?.company || c.customer?.company_name || c.customer?.display_name || "-";
  const adminUrl = `${publicBaseUrl()}/admin/overrides?focus=${open[0].id}`;
  const { overrideConfirmedTemplate } = await import("@/lib/templates/telegram");
  await Promise.allSettled([
    dispatchEvent(
      "booking.override",
      overrideConfirmedTemplate({
        reference: c.reference_code,
        customerName: name,
        open: open.map((r) => ({ reference: r.reference_code, who: who(r), action: r.metadata.displaced_by!.action })),
        adminUrl,
      }),
    ),
    createInAppNotification({
      level: "danger",
      category: "system",
      title: `ลูกค้า ${c.reference_code} ชำระแล้ว — จัดการคิวภายในที่ถูกทับ ${open.length} รายการ`,
      body: open.map((r) => `${r.reference_code} ${who(r)}`).join(" · "),
      link: `/admin/overrides?focus=${open[0].id}`,
      relatedId: customerBookingId,
    }),
  ]);
}
