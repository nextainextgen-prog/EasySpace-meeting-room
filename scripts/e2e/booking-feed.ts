/**
 * Read-only booking feed: issue → JSON and iCal with the key → wrong key and
 * revoked key refused → company scope and "room and time only" respected.
 * Real database; keys created here are deleted at the end.
 *
 *   npm run test:feed
 */

import { createClient } from "@supabase/supabase-js";
import { GET as jsonFeed } from "@/app/api/feed/bookings/route";
import { GET as icsFeed } from "@/app/api/feed/calendar/route";
import { issueFeedKey, listFeedKeys, revokeFeedKey } from "@/lib/server/booking-feed";
import { addDays, bkkDate } from "@/lib/time/bkk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra: unknown = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${JSON.stringify(extra).slice(0, 300)}`));
const made: string[] = [];
const B = "http://localhost";

type Feed = { ok: boolean; count: number; bookings: Array<{ company: string | null; bookedBy: string | null; title: string | null; status: string }> };

(async () => {
  const from = addDays(bkkDate(new Date()), -30);
  const to = addDays(bkkDate(new Date()), 30);
  const all = await issueFeedKey({ label: "E2E ทุกห้อง", scope: "all", scopeName: "ทุกห้องในตึก", showNames: true, createdBy: "e2e" });
  made.push(all.key.id);

  console.log("json");
  const r = await jsonFeed(new Request(`${B}/api/feed/bookings?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${all.token}` } }));
  const body = (await r.json()) as Feed;
  ok("200 with bookings", r.status === 200 && body.ok && body.count > 0, { status: r.status, count: body.count });
  ok("no cancelled by default", body.bookings.every((b) => b.status !== "cancelled"));
  ok("no phone or e-mail anywhere", !/@|\+66|0\d{8,9}/.test(JSON.stringify(body.bookings.map((b) => [b.company, b.bookedBy]))));
  ok("X-API-Key works too", (await jsonFeed(new Request(`${B}/api/feed/bookings`, { headers: { "x-api-key": all.token } }))).status === 200);
  ok("wrong key refused", (await jsonFeed(new Request(`${B}/api/feed/bookings`, { headers: { authorization: "Bearer esf_nope" } }))).status === 401);
  ok("no key refused", (await jsonFeed(new Request(`${B}/api/feed/bookings`))).status === 401);

  console.log("ical");
  const ics = await icsFeed(new Request(`${B}/api/feed/calendar?key=${all.token}`));
  const cal = await ics.text();
  ok("text/calendar", ics.status === 200 && (ics.headers.get("content-type") ?? "").startsWith("text/calendar"));
  ok("well formed", cal.startsWith("BEGIN:VCALENDAR\r\n") && cal.trimEnd().endsWith("END:VCALENDAR") && (cal.match(/BEGIN:VEVENT/g) ?? []).length === (cal.match(/END:VEVENT/g) ?? []).length);
  ok("has events", (cal.match(/BEGIN:VEVENT/g) ?? []).length > 0);
  ok("lines within 75 octets", cal.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));

  console.log("scope and privacy");
  const { data: org } = await sb.from("bookings").select("org_id, organization:organizations(name)").not("org_id", "is", null).gte("starts_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(1).single();
  const o = org as unknown as { org_id: string; organization: { name: string } };
  const one = await issueFeedKey({ label: "E2E บริษัทเดียว", scope: o.org_id, scopeName: o.organization.name, showNames: false, createdBy: "e2e" });
  made.push(one.key.id);
  const sc = (await (await jsonFeed(new Request(`${B}/api/feed/bookings?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${one.token}` } }))).json()) as Feed;
  ok("only that company", sc.count > 0 && sc.count <= body.count && sc.bookings.every((b) => b.company === o.organization.name || b.company === null), sc.bookings.slice(0, 2));
  ok("room and time only: no names, no titles", sc.bookings.every((b) => b.bookedBy === null && b.title === null));

  console.log("revoke");
  await revokeFeedKey(all.key.id);
  ok("revoked key refused", (await jsonFeed(new Request(`${B}/api/feed/bookings`, { headers: { authorization: `Bearer ${all.token}` } }))).status === 401);
  ok("listed as revoked", !!(await listFeedKeys()).find((k) => k.id === all.key.id)?.revokedAt);
})()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(async () => {
    for (const k of await listFeedKeys()) if (made.includes(k.id)) await sb.from("app_secrets").delete().eq("key", `feed:key:${k.hash}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
