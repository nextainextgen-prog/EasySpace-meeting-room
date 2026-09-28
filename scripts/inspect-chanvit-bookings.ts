/**
 * Inspect the recurring MASTER ROOM series booked by Chanvit Soponsuk.
 *
 * Read-only. Prints the series grouped by room + weekday + time so we can
 * confirm exactly which rows a room move would touch.
 *
 *   npx tsx --env-file=.env.local scripts/inspect-chanvit-bookings.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BKK_TZ = "Asia/Bangkok";

function bkk(iso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BKK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = fmt.formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    weekday: g("weekday"),
    time: `${g("hour")}:${g("minute")}`,
  };
}

async function main() {
  // Find the person across customers + members (name spelling may vary).
  const like = "%hanvit%";
  const [cRes, mRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, display_name, company_name, contact_name")
      .or(`display_name.ilike.${like},contact_name.ilike.${like},company_name.ilike.${like}`),
    supabase.from("members").select("id, full_name, email").ilike("full_name", like),
  ]);
  if (cRes.error) console.error("customers query error:", cRes.error.message);
  if (mRes.error) console.error("members query error:", mRes.error.message);
  const customers = cRes.data;
  const members = mRes.data;
  console.log("customers:", customers);
  console.log("members:", members);

  const customerIds = (customers ?? []).map((c) => c.id as string);
  const memberIds = (members ?? []).map((m) => m.id as string);
  if (customerIds.length === 0 && memberIds.length === 0) {
    console.log("no matching person found");
    return;
  }

  const filters: string[] = [];
  if (customerIds.length) filters.push(`customer_id.in.(${customerIds.join(",")})`);
  if (memberIds.length) filters.push(`member_id.in.(${memberIds.join(",")})`);

  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, org_id, room_id, room:rooms(id, name), starts_at, ends_at, booking_status, payment_status, base_amount, total_amount, is_recurring, recurrence_rule, metadata, internal_title, customer_id, member_id",
    )
    .or(filters.join(","))
    .order("starts_at");
  if (error) throw error;

  console.log(`\ntotal bookings: ${rows?.length ?? 0}`);

  const byRoom = new Map<string, typeof rows>();
  for (const r of rows ?? []) {
    const name = (r.room as { name?: string } | null)?.name ?? "—";
    if (!byRoom.has(name)) byRoom.set(name, [] as never);
    (byRoom.get(name) as unknown as unknown[]).push(r);
  }

  for (const [room, list] of byRoom) {
    console.log(`\n═══ ${room} — ${list?.length} bookings ═══`);
    const shape = new Map<string, number>();
    for (const r of list ?? []) {
      const s = bkk(r.starts_at as string);
      const e = bkk(r.ends_at as string);
      const key = `${s.weekday} ${s.time}-${e.time} [${r.booking_status}]`;
      shape.set(key, (shape.get(key) ?? 0) + 1);
    }
    console.log("  pattern:", Object.fromEntries(shape));
    const first = list?.[0];
    const last = list?.[list.length - 1];
    console.log(`  range: ${bkk(first!.starts_at as string).date} → ${bkk(last!.starts_at as string).date}`);
    console.log(`  sample row:`, JSON.stringify(first, null, 2));
  }

  // All rooms in the same org, so we know the move target.
  const orgIds = [...new Set((rows ?? []).map((r) => r.org_id as string).filter(Boolean))];
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, name, capacity, is_active, org_id")
    .order("name");
  console.log("\nrooms:", rooms);
  console.log("org ids on these bookings:", orgIds);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
