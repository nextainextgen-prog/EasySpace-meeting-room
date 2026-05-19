"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

const customerInput = z.object({
  display_name: z.string().trim().min(1, "กรุณากรอกชื่อ"),
  type: z.enum(["individual", "company", "government"]).default("individual"),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  line_id: z.string().trim().optional().nullable(),
  contact_name: z.string().trim().optional().nullable(),
  company_name: z.string().trim().optional().nullable(),
  tax_id: z.string().trim().optional().nullable(),
  vat_type: z.enum(["vat", "non_vat"]).optional().nullable(),
  billing_address: z.string().trim().optional().nullable(),
  source: z
    .enum(["line", "walk_in", "referral_bni", "facebook", "google", "email", "other"])
    .optional()
    .nullable(),
  source_detail: z.string().trim().optional().nullable(),
  birthday: z.string().optional().nullable(),
  company_anniversary: z.string().optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

export type CustomerInput = z.infer<typeof customerInput>;

function clean<T extends Record<string, unknown>>(obj: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function createCustomer(input: CustomerInput) {
  const parsed = customerInput.parse(input);
  const profile = await getCurrentProfile();
  const supabase = createSupabaseAdminClient();

  const payload = clean({
    ...parsed,
    tags: parsed.tags ?? [],
  });

  const { data, error } = await supabase
    .from("customers")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = (data as { id: string }).id;
  await logActivity(id, "customer_created", { actor: profile?.full_name ?? profile?.email });

  revalidatePath("/admin/customers");
  return { ok: true, id };
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const parsed = customerInput.partial().parse(input);
  const supabase = createSupabaseAdminClient();
  const payload = clean(parsed);

  const { error } = await supabase
    .from("customers")
    .update(payload as never)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(id, "customer_updated", { changed: Object.keys(payload) });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function addCustomerTag(customerId: string, tag: string) {
  const clean = tag.trim();
  if (!clean) return { ok: false };
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("customers")
    .select("tags")
    .eq("id", customerId)
    .maybeSingle();
  const tags = ((row as { tags: string[] } | null)?.tags ?? []).slice();
  if (!tags.includes(clean)) tags.push(clean);
  const { error } = await supabase
    .from("customers")
    .update({ tags } as never)
    .eq("id", customerId);
  if (error) throw new Error(error.message);
  await logActivity(customerId, "tag_added", { tag: clean });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function removeCustomerTag(customerId: string, tag: string) {
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("customers")
    .select("tags")
    .eq("id", customerId)
    .maybeSingle();
  const tags = ((row as { tags: string[] } | null)?.tags ?? []).filter(
    (t) => t !== tag,
  );
  const { error } = await supabase
    .from("customers")
    .update({ tags } as never)
    .eq("id", customerId);
  if (error) throw new Error(error.message);
  await logActivity(customerId, "tag_removed", { tag });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function toggleBlacklist(customerId: string, reason?: string) {
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("customers")
    .select("blacklisted_at")
    .eq("id", customerId)
    .maybeSingle();
  const isBlocked = !!(row as { blacklisted_at: string | null } | null)?.blacklisted_at;
  const payload = isBlocked
    ? { blacklisted_at: null, blacklist_reason: null }
    : { blacklisted_at: new Date().toISOString(), blacklist_reason: reason ?? null };
  const { error } = await supabase
    .from("customers")
    .update(payload as never)
    .eq("id", customerId);
  if (error) throw new Error(error.message);

  await logActivity(customerId, isBlocked ? "unblacklisted" : "blacklisted", { reason });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true, blacklisted: !isBlocked };
}

export async function addCustomerNote(customerId: string, body: string) {
  const text = body.trim();
  if (!text) return { ok: false };
  const profile = await getCurrentProfile();
  await logActivity(customerId, "note_added", {
    text,
    author: profile?.full_name ?? profile?.email,
  });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}

export async function archiveCustomer(customerId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", customerId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function mergeCustomers(opts: { keepId: string; mergeId: string }) {
  const supabase = createSupabaseAdminClient();
  // Re-parent bookings + activities + promo usages to the kept record
  await supabase
    .from("bookings")
    .update({ customer_id: opts.keepId } as never)
    .eq("customer_id", opts.mergeId);
  await supabase
    .from("customer_activities")
    .update({ customer_id: opts.keepId } as never)
    .eq("customer_id", opts.mergeId);
  await supabase
    .from("promotion_usages")
    .update({ customer_id: opts.keepId } as never)
    .eq("customer_id", opts.mergeId);
  // Soft-archive the merged record
  await supabase
    .from("customers")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", opts.mergeId);

  await logActivity(opts.keepId, "customer_merged", { mergedId: opts.mergeId });
  revalidatePath("/admin/customers");
  return { ok: true };
}

async function logActivity(
  customerId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const profile = await getCurrentProfile();
  const supabase = createSupabaseAdminClient();
  await supabase.from("customer_activities").insert({
    customer_id: customerId,
    activity_type: type,
    payload,
    actor_type: "admin",
    actor_id: profile?.id ?? null,
    source: "web",
  } as never);
}
