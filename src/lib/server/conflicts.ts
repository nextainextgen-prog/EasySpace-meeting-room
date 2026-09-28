import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

/**
 * The one place that answers "is this room free?".
 *
 * The overlap predicate used to be copy-pasted across nine call sites, which
 * meant any new rule (buffers, priority tiers, who is allowed to see whose
 * name) would have been enforced in some of them and quietly skipped in the
 * rest. Everything that needs to know about a busy slot goes through here.
 */

/** Statuses that actually hold a room. */
export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "in_use"] as const;

/**
 * Who owns the slot we collided with, most protected first. The order matters:
 * an external booking that has money attached is never negotiable, while a
 * near-miss against the room's turnaround buffer is only advisory.
 */
export type ConflictTier =
  | "external_paid"
  | "external_hold"
  | "external_unpaid"
  | "internal_other_org"
  | "internal_same_org"
  | "internal_self"
  | "buffer_touch";

const TIER_RANK: Record<ConflictTier, number> = {
  external_paid: 0,
  external_hold: 1,
  external_unpaid: 2,
  internal_other_org: 3,
  internal_same_org: 4,
  internal_self: 5,
  buffer_touch: 6,
};

export interface ConflictHit {
  id: string;
  referenceCode: string;
  startsAt: string;
  endsAt: string;
  tier: ConflictTier;
  /** false = advisory only, i.e. buffer proximity rather than a real overlap. */
  blocking: boolean;
  /** Display string already masked for `viewer` — safe to render as-is. */
  label: string;
  /** Minutes of clear air between the two bookings; 0 when they overlap. */
  gapMinutes: number;
}

export interface SlotRequest {
  /** Caller's own identifier for the slot, echoed back as the result key. */
  key: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}

export type ConflictViewer =
  | { kind: "admin" }
  | { kind: "member"; memberId: string; orgId: string | null };

export interface FindConflictsInput {
  slots: SlotRequest[];
  /** Bookings to ignore — the row being moved, plus its siblings moving with it. */
  excludeBookingIds?: string[];
  /**
   * Turnaround time the room wants between bookings. A neighbour closer than
   * this is reported as `buffer_touch` rather than ignored.
   */
  bufferMinutes?: number;
  /** Which neighbours the buffer applies to. */
  bufferScope?: "off" | "external_only" | "all";
  /** Controls how much of the neighbouring booking the caller may see. */
  viewer: ConflictViewer;
}

interface CandidateRow {
  id: string;
  reference_code: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  source: "external" | "internal";
  payment_status: "unpaid" | "deposit" | "paid" | "free";
  booking_status: string;
  hold_expires_at: string | null;
  org_id: string | null;
  member_id: string | null;
  internal_title: string | null;
  is_public: boolean;
  customer: { display_name: string } | null;
  member: { full_name: string } | null;
}

function classify(row: CandidateRow, viewer: ConflictViewer): ConflictTier {
  if (row.source === "external") {
    if (row.payment_status === "paid" || row.payment_status === "deposit") {
      return "external_paid";
    }
    if (row.hold_expires_at && new Date(row.hold_expires_at) > new Date()) {
      return "external_hold";
    }
    return "external_unpaid";
  }
  if (viewer.kind === "member") {
    if (row.member_id === viewer.memberId) return "internal_self";
    if (row.org_id && row.org_id === viewer.orgId) return "internal_same_org";
    return "internal_other_org";
  }
  return "internal_same_org";
}

/**
 * What the caller is allowed to read off the neighbouring booking.
 *
 * Members never see an external customer's name — the member calendar already
 * shows those as an anonymous block, and a conflict report must not become the
 * back door that leaks it.
 */
function labelFor(row: CandidateRow, tier: ConflictTier, viewer: ConflictViewer): string {
  if (viewer.kind === "admin") {
    const who = row.customer?.display_name ?? row.member?.full_name ?? null;
    const what = row.internal_title ?? null;
    return [row.reference_code, who, what].filter(Boolean).join(" · ");
  }
  if (row.source === "external") return "ลูกค้าภายนอก";
  if (tier === "internal_self") {
    return row.internal_title
      ? `การจองของคุณ — ${row.internal_title}`
      : "การจองอื่นของคุณ";
  }
  if (tier === "internal_same_org") {
    const who = row.member?.full_name ?? "เพื่อนร่วมองค์กร";
    return row.is_public && row.internal_title ? `${who} — ${row.internal_title}` : who;
  }
  return "องค์กรอื่น";
}

/** Minutes of clear air between two ranges; 0 when they overlap. */
function gapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aStart < bEnd && aEnd > bStart) return 0;
  const gap = bStart >= aEnd ? bStart - aEnd : aStart - bEnd;
  return Math.round(gap / 60_000);
}

/**
 * Resolve every slot in one pass — one query per distinct room, not one per
 * slot. Rescheduling a 52-week series would otherwise fire 52 round-trips.
 */
export async function findConflicts(
  input: FindConflictsInput,
): Promise<Map<string, ConflictHit[]>> {
  const result = new Map<string, ConflictHit[]>();
  for (const s of input.slots) result.set(s.key, []);
  if (input.slots.length === 0) return result;

  const bufferScope = input.bufferScope ?? "external_only";
  const buffer = bufferScope === "off" ? 0 : Math.max(0, input.bufferMinutes ?? 0);
  const bufferMs = buffer * 60_000;
  const exclude = new Set(input.excludeBookingIds ?? []);

  const admin = createSupabaseAdminClient();
  const byRoom = new Map<string, SlotRequest[]>();
  for (const s of input.slots) {
    const list = byRoom.get(s.roomId) ?? [];
    list.push(s);
    byRoom.set(s.roomId, list);
  }

  for (const [roomId, slots] of byRoom) {
    const windowStart = Math.min(...slots.map((s) => new Date(s.startsAt).getTime())) - bufferMs;
    const windowEnd = Math.max(...slots.map((s) => new Date(s.endsAt).getTime())) + bufferMs;

    const { data, error } = await admin
      .from("bookings")
      .select(
        `id, reference_code, room_id, starts_at, ends_at, source, payment_status,
         booking_status, hold_expires_at, org_id, member_id, internal_title, is_public,
         customer:customers(display_name), member:members(full_name)`,
      )
      .eq("room_id", roomId)
      .in("booking_status", ACTIVE_BOOKING_STATUSES as unknown as string[])
      .lt("starts_at", new Date(windowEnd).toISOString())
      .gt("ends_at", new Date(windowStart).toISOString());
    if (error) throw error;

    const candidates = ((data ?? []) as unknown as CandidateRow[]).filter(
      (r) => !exclude.has(r.id),
    );

    for (const slot of slots) {
      const s = new Date(slot.startsAt).getTime();
      const e = new Date(slot.endsAt).getTime();
      const hits: ConflictHit[] = [];

      for (const row of candidates) {
        const rs = new Date(row.starts_at).getTime();
        const re = new Date(row.ends_at).getTime();
        const overlaps = rs < e && re > s;
        const gap = gapMinutes(s, e, rs, re);
        if (!overlaps && (buffer === 0 || gap >= buffer)) continue;

        const realTier = classify(row, input.viewer);
        const bufferApplies =
          bufferScope === "all" ||
          (bufferScope === "external_only" && row.source === "external");
        if (!overlaps && !bufferApplies) continue;

        const tier: ConflictTier = overlaps ? realTier : "buffer_touch";
        hits.push({
          id: row.id,
          referenceCode: row.reference_code,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          tier,
          // Any real overlap blocks, including one the caller owns: a room
          // cannot hold two meetings at once, and whose name is on the other
          // one does not change that. Occurrences that move together are kept
          // out of the way by `excludeBookingIds`, not by this flag.
          blocking: overlaps,
          label: labelFor(row, realTier, input.viewer),
          gapMinutes: gap,
        });
      }

      hits.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
      result.set(slot.key, hits);
    }
  }

  return result;
}

/** True when at least one hit would actually stop the booking. */
export function isBlocked(hits: ConflictHit[] | undefined): boolean {
  return (hits ?? []).some((h) => h.blocking);
}

/** The strongest reason a slot is unavailable, for one-line messaging. */
export function primaryBlocker(hits: ConflictHit[] | undefined): ConflictHit | null {
  return (hits ?? []).find((h) => h.blocking) ?? null;
}
