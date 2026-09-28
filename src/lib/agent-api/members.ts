/**
 * Identity resolution for the Agent API.
 *
 * The Telegram bot knows a chat/user id, not a member row. Rather than adding
 * a column (migrations here are applied by hand), the mapping lives in the
 * settings KV under `agent.telegram_links`: { "<telegramUserId>": "<memberId>" }.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getOrgUsage, type OrgUsage } from "@/lib/data/organizations";

const LINKS_KEY = "agent.telegram_links";

export interface AgentMember {
  memberId: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  orgId: string;
  orgName: string;
  tier: string;
}

async function readLinks(): Promise<Record<string, string>> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", LINKS_KEY)
    .maybeSingle();
  const value = (data as { value?: Record<string, string> } | null)?.value;
  return value && typeof value === "object" ? value : {};
}

export async function linkTelegramUser(
  telegramUserId: string,
  memberId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const links = await readLinks();
  links[String(telegramUserId)] = memberId;
  await admin.from("settings").upsert(
    {
      key: LINKS_KEY,
      value: links as never,
      category: "integration",
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
}

export async function unlinkTelegramUser(telegramUserId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const links = await readLinks();
  delete links[String(telegramUserId)];
  await admin.from("settings").upsert(
    {
      key: LINKS_KEY,
      value: links as never,
      category: "integration",
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
}

interface MemberRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  is_active: boolean;
}

async function loadMember(
  by: "id" | "email" | "phone",
  value: string,
): Promise<MemberRow | null> {
  const admin = createSupabaseAdminClient();
  const query = admin
    .from("members")
    .select("id, full_name, email, phone, position, is_active")
    .eq("is_active", true);
  const { data } =
    by === "email"
      ? await query.ilike("email", value).limit(1).maybeSingle()
      : by === "phone"
        ? await query.eq("phone", value).limit(1).maybeSingle()
        : await query.eq("id", value).maybeSingle();
  return (data as MemberRow | null) ?? null;
}

/**
 * Resolve whoever the agent is acting for. Accepts a member id, an email, a
 * phone, or a linked Telegram user id — first match wins.
 */
export async function resolveAgentMember(input: {
  memberId?: string;
  email?: string;
  phone?: string;
  telegramUserId?: string | number;
}): Promise<AgentMember | null> {
  let row: MemberRow | null = null;

  if (input.memberId) row = await loadMember("id", input.memberId);
  if (!row && input.email) row = await loadMember("email", input.email.trim());
  if (!row && input.phone) row = await loadMember("phone", input.phone.trim());
  if (!row && input.telegramUserId !== undefined) {
    const links = await readLinks();
    const mapped = links[String(input.telegramUserId)];
    if (mapped) row = await loadMember("id", mapped);
  }
  if (!row) return null;

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("member_organizations")
    .select("org_id, tier, organization:organizations(name)")
    .eq("member_id", row.id)
    .eq("is_active", true)
    .order("joined_at")
    .limit(1)
    .maybeSingle();

  const orgLink = link as unknown as {
    org_id: string;
    tier: string;
    organization: { name: string } | null;
  } | null;
  if (!orgLink) return null;

  return {
    memberId: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    position: row.position,
    orgId: orgLink.org_id,
    orgName: orgLink.organization?.name ?? "องค์กรภายใน",
    tier: orgLink.tier,
  };
}

export async function memberUsage(orgId: string): Promise<OrgUsage> {
  return getOrgUsage(orgId);
}
