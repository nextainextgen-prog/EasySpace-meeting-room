/**
 * Read-only booking feed for other people's tools — a building admin's own
 * bot, a Google Calendar subscription. Each key is issued from Settings, can
 * only read, can be limited to one company, and can be revoked on its own.
 *
 * Only a SHA-256 of the key is stored (app_secrets `feed:key:<hash>`); the
 * key itself is shown once, when it is issued.
 */

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { kvGet, kvList, kvSet } from "@/lib/tgbot/store";
import { addDays, bkkDate, fromBkk } from "@/lib/time/bkk";

export interface FeedKey {
  id: string;
  label: string;
  /** "all" = every room in the building, otherwise an organization id. */
  scope: string;
  scopeName: string;
  /** Show who booked and the meeting title; off = room and time only. */
  showNames: boolean;
  prefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const PREFIX = "feed:key:";
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function issueFeedKey(input: {
  label: string;
  scope: string;
  scopeName: string;
  showNames: boolean;
  createdBy: string;
}): Promise<{ token: string; key: FeedKey }> {
  const token = `esf_${crypto.randomBytes(24).toString("base64url")}`;
  const key: FeedKey = {
    id: crypto.randomBytes(6).toString("hex"),
    label: input.label,
    scope: input.scope,
    scopeName: input.scopeName,
    showNames: input.showNames,
    prefix: token.slice(0, 8),
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await kvSet(PREFIX + hash(token), key);
  return { token, key };
}

export async function listFeedKeys(): Promise<Array<FeedKey & { hash: string }>> {
  const rows = await kvList<FeedKey>(PREFIX);
  return rows
    .map((r) => ({ ...r.value, hash: r.key.slice(PREFIX.length) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokeFeedKey(id: string): Promise<FeedKey | null> {
  const found = (await listFeedKeys()).find((k) => k.id === id);
  if (!found || found.revokedAt) return null;
  const { hash: h, ...key } = found;
  const next = { ...key, revokedAt: new Date().toISOString() };
  await kvSet(PREFIX + h, next);
  return next;
}

/** The key behind a request, or null. Accepts Bearer, X-API-Key or ?key=. */
export async function feedKeyFrom(request: Request): Promise<FeedKey | null> {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const token =
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "") ||
    request.headers.get("x-api-key")?.trim() ||
    url.searchParams.get("key")?.trim() ||
    "";
  if (!token.startsWith("esf_") || token.length > 100) return null;
  const k = PREFIX + hash(token);
  const key = await kvGet<FeedKey>(k);
  if (!key || key.revokedAt) return null;
  // Note the last use, at most every 10 minutes.
  if (!key.lastUsedAt || Date.now() - Date.parse(key.lastUsedAt) > 10 * 60_000) {
    await kvSet(k, { ...key, lastUsedAt: new Date().toISOString() });
  }
  return key;
}

export interface FeedBooking {
  id: string;
  reference: string;
  room: string;
  roomColor: string | null;
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** internal = a company in the building, external = an outside customer. */
  source: string;
  company: string | null;
  title: string | null;
  bookedBy: string | null;
  updatedAt: string;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

export async function feedBookings(
  key: FeedKey,
  opts: { from: string; to: string; includeCancelled?: boolean },
): Promise<FeedBooking[]> {
  let q = createSupabaseAdminClient()
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, booking_status, source, internal_title, updated_at, org_id, room:rooms(name, color), organization:organizations(name), member:members(full_name), customer:customers(display_name, company_name)",
    )
    .gte("starts_at", fromBkk(opts.from, "00:00").toISOString())
    .lt("starts_at", fromBkk(addDays(opts.to, 1), "00:00").toISOString())
    .order("starts_at")
    .limit(2000);
  if (!opts.includeCancelled) q = q.neq("booking_status", "cancelled");
  if (key.scope !== "all") q = q.eq("org_id", key.scope);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    source: string;
    internal_title: string | null;
    updated_at: string;
    room: { name: string; color: string | null } | null;
    organization: { name: string } | null;
    member: { full_name: string } | null;
    customer: { display_name: string; company_name: string | null } | null;
  }>;
  return rows.map((r) => {
    const external = r.source === "external";
    return {
      id: r.id,
      reference: r.reference_code,
      room: r.room?.name ?? "",
      roomColor: r.room?.color ?? null,
      date: bkkDate(r.starts_at),
      start: time(r.starts_at),
      end: time(r.ends_at),
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.booking_status,
      source: r.source,
      company: external ? (key.showNames ? r.customer?.company_name || null : null) : r.organization?.name ?? null,
      title: key.showNames ? (external ? "ลูกค้าภายนอก" : r.internal_title) : null,
      bookedBy: key.showNames ? (external ? r.customer?.display_name ?? null : r.member?.full_name ?? null) : null,
      updatedAt: r.updated_at,
    };
  });
}

/** Date window from ?from=&to= (or ?date=), clamped to 200 days. */
export function feedWindow(url: URL, defaults: { back: number; ahead: number }) {
  const today = bkkDate(new Date());
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const date = ok(url.searchParams.get("date"));
  const from = ok(url.searchParams.get("from")) ?? date ?? addDays(today, -defaults.back);
  let to = ok(url.searchParams.get("to")) ?? date ?? addDays(today, defaults.ahead);
  if (to < from) to = from;
  if (to > addDays(from, 200)) to = addDays(from, 200);
  return { from, to };
}
