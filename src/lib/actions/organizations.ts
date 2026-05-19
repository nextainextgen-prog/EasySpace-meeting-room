"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { recordAudit } from "./audit";
import { dispatchEvent } from "@/lib/server/notifications";

const OrgStatusEnum = z.enum([
  "active",
  "pending",
  "suspended",
  "expired",
  "archived",
]);

const UpsertOrgSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  short_name: z.string().nullable().optional(),
  brand_color: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  email_domains: z.array(z.string()).default([]),
  contact_phone: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  status: OrgStatusEnum.default("active"),
  plan_tier: z.enum(["free", "basic", "pro", "enterprise"]).default("basic"),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
});

export async function upsertOrganization(
  raw: z.infer<typeof UpsertOrgSchema>,
) {
  const parsed = UpsertOrgSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  const payload = {
    name: input.name,
    short_name: input.short_name ?? null,
    brand_color: input.brand_color ?? null,
    logo_url: input.logo_url ?? null,
    industry: input.industry ?? null,
    floor: input.floor ?? null,
    email_domains: input.email_domains,
    contact_phone: input.contact_phone ?? null,
    contact_email: input.contact_email ?? null,
    contract_start: input.contract_start ?? null,
    contract_end: input.contract_end ?? null,
    status: input.status,
    tags: input.tags,
    notes: input.notes ?? null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("organizations")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("organizations")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    input.id = (data as { id: string }).id;
  }

  // Save extended meta (plan_tier, contact_name, quota) in settings
  await supabase.from("settings").upsert(
    {
      key: `org.${input.id}.meta`,
      value: {
        plan_tier: input.plan_tier,
        contact_name: input.contact_name ?? null,
      } as never,
      category: "organizations",
    } as never,
    { onConflict: "key" },
  );

  await recordAudit({
    action: parsed.data.id ? "org_updated" : "org_created",
    targetType: "organization",
    targetId: input.id,
    changes: payload,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/orgs/${input.id}`);
  return { ok: true as const, id: input.id };
}

export async function setOrgStatus(
  id: string,
  status: "active" | "pending" | "suspended" | "expired" | "archived",
  reason?: string,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({ status } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "org_status_changed",
    targetType: "organization",
    targetId: id,
    changes: { status },
    reason,
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

/** Set per-org quota config (multi-dimensional) */
const QuotaSchema = z.object({
  orgId: z.string().uuid(),
  total_hours_month: z.number().nonnegative().default(0),
  per_member_hours: z.number().nonnegative().default(4),
  per_room: z.record(z.string(), z.number()).default({}),
  peak_pct: z.number().min(0).max(100).default(70),
  off_peak_pct: z.number().min(0).max(100).default(30),
  carry_over_max_hours: z.number().nonnegative().default(0),
  per_day_cap: z.number().nonnegative().default(0),
});

export async function setOrgQuota(raw: z.infer<typeof QuotaSchema>) {
  const parsed = QuotaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();
  await supabase.from("settings").upsert(
    {
      key: `org.${input.orgId}.quota`,
      value: {
        total_hours_month: input.total_hours_month,
        per_member_hours: input.per_member_hours,
        per_room: input.per_room,
        peak_pct: input.peak_pct,
        off_peak_pct: input.off_peak_pct,
        carry_over_max_hours: input.carry_over_max_hours,
        per_day_cap: input.per_day_cap,
      } as never,
      category: "organizations",
    } as never,
    { onConflict: "key" },
  );
  await recordAudit({
    action: "org_quota_updated",
    targetType: "organization",
    targetId: input.orgId,
    changes: input,
  });
  revalidatePath(`/admin/users/orgs/${input.orgId}`);
  return { ok: true as const };
}

/** Bulk import members via CSV (header: email, full_name, phone, tier) */
const BulkImportSchema = z.object({
  orgId: z.string().uuid(),
  csv: z.string().min(10),
});
export async function bulkImportMembers(
  raw: z.infer<typeof BulkImportSchema>,
) {
  const parsed = BulkImportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const supabase = createSupabaseAdminClient();
  const lines = parsed.data.csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2)
    return { ok: false as const, error: "no_data" };

  const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const cols: Record<string, number> = {};
  header.forEach((h, i) => (cols[h] = i));
  if (cols.email === undefined)
    return { ok: false as const, error: "missing_email_column" };

  type Row = {
    email: string;
    full_name: string;
    phone: string | null;
    tier: "manager" | "member" | "guest";
  };
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    const email = parts[cols.email]?.trim();
    if (!email) continue;
    rows.push({
      email,
      full_name:
        cols.full_name !== undefined
          ? (parts[cols.full_name] ?? email.split("@")[0])
          : email.split("@")[0],
      phone: cols.phone !== undefined ? (parts[cols.phone] ?? null) : null,
      tier:
        cols.tier !== undefined
          ? ((parts[cols.tier] ?? "member") as Row["tier"])
          : "member",
    });
  }

  let created = 0;
  let attached = 0;
  for (const r of rows) {
    const { data: existing } = await supabase
      .from("members")
      .select("id")
      .eq("email", r.email)
      .maybeSingle();
    let memberId = (existing as { id: string } | null)?.id;
    if (!memberId) {
      const { data, error } = await supabase
        .from("members")
        .insert({
          email: r.email,
          full_name: r.full_name,
          phone: r.phone,
          is_active: true,
        } as never)
        .select("id")
        .single();
      if (error) continue;
      memberId = (data as { id: string }).id;
      created++;
    }
    const { error: mErr } = await supabase
      .from("member_organizations")
      .upsert(
        {
          member_id: memberId,
          org_id: parsed.data.orgId,
          tier: r.tier,
          is_active: true,
        } as never,
        { onConflict: "member_id,org_id" },
      );
    if (!mErr) attached++;
  }

  await recordAudit({
    action: "org_members_bulk_import",
    targetType: "organization",
    targetId: parsed.data.orgId,
    changes: { rows: rows.length, created, attached },
  });

  revalidatePath(`/admin/users/orgs/${parsed.data.orgId}`);
  return { ok: true as const, total: rows.length, created, attached };
}

/** Broadcast a message to all members of an org (best-effort: Telegram). */
export async function broadcastToOrg(input: {
  orgId: string;
  message: string;
}) {
  if (!input.message?.trim())
    return { ok: false as const, error: "empty_message" };

  const supabase = createSupabaseAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", input.orgId)
    .maybeSingle();
  if (!org) return { ok: false as const, error: "not_found" };
  const row = org as { name: string };

  const { data: members } = await supabase
    .from("member_organizations")
    .select("member:members(email, full_name)")
    .eq("org_id", input.orgId)
    .eq("is_active", true);

  const list = ((members ?? []) as unknown as Array<{
    member: { email: string; full_name: string } | null;
  }>)
    .map((m) => m.member?.full_name ?? m.member?.email ?? "—")
    .filter(Boolean);

  const text = [
    `<b>Broadcast: ${row.name}</b>`,
    "",
    input.message.trim(),
    "",
    `<i>ส่งถึง ${list.length} สมาชิก</i>`,
  ].join("\n");
  void dispatchEvent("notification.system", text);

  await recordAudit({
    action: "org_broadcast",
    targetType: "organization",
    targetId: input.orgId,
    changes: { message_length: input.message.length, recipients: list.length },
  });
  return { ok: true as const, recipients: list.length };
}

/** Domain verification stub — validates format only. Real impl would query
 *  DNS TXT record. */
export async function verifyOrgDomain(orgId: string, domain: string) {
  const supabase = createSupabaseAdminClient();
  const re = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  if (!re.test(domain))
    return { ok: false as const, error: "invalid_format" };

  const { data: org } = await supabase
    .from("organizations")
    .select("email_domains")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false as const, error: "not_found" };
  const list = ((org as { email_domains: string[] }).email_domains ?? []) as
    string[];
  if (!list.includes(domain)) list.push(domain);

  await supabase
    .from("organizations")
    .update({ email_domains: list } as never)
    .eq("id", orgId);

  await recordAudit({
    action: "org_domain_added",
    targetType: "organization",
    targetId: orgId,
    changes: { domain },
  });
  return { ok: true as const, domains: list };
}
