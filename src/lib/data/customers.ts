import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { CustomerType, LeadSource } from "@/lib/types";

export interface Customer {
  id: string;
  display_name: string;
  type: CustomerType;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  company_name: string | null;
  billing_address: string | null;
  contact_name: string | null;
  line_id: string | null;
  source: LeadSource | null;
  source_detail: string | null;
  tags: string[];
  notes: string | null;
  first_booked_at: string | null;
  last_booked_at: string | null;
  total_bookings: number;
  total_spent: number;
  no_show_count: number;
  cancellation_count: number;
  rfm_score: string | null;
  churn_risk: "low" | "medium" | "high" | null;
  blacklisted_at: string | null;
  blacklist_reason: string | null;
  birthday: string | null;
  company_anniversary: string | null;
  owner_id: string | null;
  health_score: number | null;
  vat_type: "vat" | "non_vat" | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerWithOwner extends Customer {
  owner?: { id: string; full_name: string | null; email: string } | null;
}

export async function listCustomers(opts: { limit?: number; offset?: number } = {}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*, owner:profiles!customers_owner_id_fkey(id, full_name, email)")
    .is("archived_at", null)
    .order("last_booked_at", { ascending: false, nullsFirst: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);
  if (error) {
    // Fall back to plain select if the FK/owner join isn't ready yet
    const { data: rows } = await supabase
      .from("customers")
      .select("*")
      .order("last_booked_at", { ascending: false, nullsFirst: false })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);
    return (rows ?? []) as unknown as CustomerWithOwner[];
  }
  return (data ?? []) as unknown as CustomerWithOwner[];
}

export async function getCustomerById(id: string): Promise<CustomerWithOwner | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*, owner:profiles!customers_owner_id_fkey(id, full_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const { data: row } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (row ?? null) as unknown as CustomerWithOwner | null;
  }
  return (data ?? null) as unknown as CustomerWithOwner | null;
}

/**
 * Fuzzy customer lookup using pg_trgm + exact phone/email match.
 * Returns up to 5 candidates ordered by composite confidence.
 */
export async function findCustomerCandidates(input: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<Array<Customer & { similarity: number }>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("find_customer_candidates" as never, {
    p_name: input.name,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
  } as never);
  if (error) {
    // RPC not yet created — fall back to trigram filter
    const { data: fallback } = await supabase
      .from("customers")
      .select("*")
      .or(
        [
          input.phone ? `phone.eq.${input.phone}` : null,
          input.email ? `email.eq.${input.email}` : null,
          `display_name.ilike.%${input.name}%`,
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(5);
    return ((fallback ?? []) as unknown as Customer[]).map((c) => ({
      ...c,
      similarity: 0.5,
    }));
  }
  return (data ?? []) as unknown as Array<Customer & { similarity: number }>;
}

export async function upsertCustomerForBooking(input: {
  name: string;
  phone?: string;
  email?: string;
  type?: CustomerType;
  source?: LeadSource;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const candidates = await findCustomerCandidates(input);
  const best = candidates[0];

  if (best && best.similarity > 0.85) {
    return best.id;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      display_name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      type: input.type ?? "individual",
      source: input.source ?? "other",
      tags: ["New"],
    } as never)
    .select("id")
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}
