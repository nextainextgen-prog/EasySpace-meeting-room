"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

/** Read a single settings KV row (jsonb value). */
export async function getSettingValue<T = unknown>(
  key: string,
): Promise<T | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data as { value?: T } | null)?.value ?? null;
}

/** Upsert a single settings KV row. */
export async function setSettingValue(
  key: string,
  value: unknown,
  category?: string,
) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  const { error } = await supabase.from("settings").upsert(
    {
      key,
      value: value as never,
      category: category ?? null,
      updated_by: me?.id ?? null,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings", "layout");
  return { ok: true as const };
}

/** Load many settings keys in parallel; missing keys return null. */
export async function getSettingValues(
  keys: string[],
): Promise<Record<string, unknown | null>> {
  if (keys.length === 0) return {};
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", keys);
  const out: Record<string, unknown | null> = {};
  for (const k of keys) out[k] = null;
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    out[row.key] = row.value;
  }
  return out;
}

/* ─── Rooms CRUD ───────────────────────────────────────────────────────── */
export async function upsertRoom(input: {
  id?: string;
  name: string;
  size?: "small" | "large" | "vip";
  capacity_min: number;
  capacity_max: number;
  hourly_rate: number;
  buffer_minutes?: number;
  amenities: string[];
  perks: string[];
  floor?: string;
  room_number?: string;
  color: string;
  thumbnail_url?: string | null;
  status: "active" | "maintenance" | "inactive";
  allow_internal: boolean;
  service_days: number[];
  display_order?: number;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name,
    size: input.size ?? "small",
    capacity_min: input.capacity_min,
    capacity_max: input.capacity_max,
    hourly_rate: input.hourly_rate,
    buffer_minutes: input.buffer_minutes ?? 15,
    amenities: input.amenities,
    perks: input.perks,
    floor: input.floor ?? null,
    room_number: input.room_number ?? null,
    color: input.color,
    thumbnail_url: input.thumbnail_url ?? null,
    status: input.status,
    allow_internal: input.allow_internal,
    service_days: input.service_days,
    display_order: input.display_order ?? 0,
  };
  if (input.id) {
    const { error } = await supabase
      .from("rooms")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("rooms").insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/rooms");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  return { ok: true as const };
}

export async function duplicateRoom(roomId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: src } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (!src) return { ok: false as const, error: "not_found" };
  const row = src as Record<string, unknown>;
  delete row.id;
  delete row.created_at;
  delete row.updated_at;
  row.name = `${(row.name as string) ?? "Room"} (Copy)`;
  row.status = "inactive";
  const { error } = await supabase.from("rooms").insert(row as never);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/rooms");
  return { ok: true as const };
}

export async function deleteRoom(roomId: string) {
  const supabase = createSupabaseAdminClient();
  // Soft-delete: set status=inactive (rooms reference by bookings — hard
  // delete would orphan history)
  const { error } = await supabase
    .from("rooms")
    .update({ status: "inactive" } as never)
    .eq("id", roomId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/rooms");
  return { ok: true as const };
}

/* ─── Room packages CRUD ───────────────────────────────────────────────── */
export async function upsertPackage(input: {
  id?: string;
  room_id: string;
  name: string;
  hours: number;
  price: number;
  max_hours?: number | null;
  notes?: string | null;
  is_active?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    room_id: input.room_id,
    name: input.name,
    hours: input.hours,
    price: input.price,
    max_hours: input.max_hours ?? null,
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { error } = await supabase
      .from("room_packages")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("room_packages")
      .insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/rooms");
  return { ok: true as const };
}

export async function deletePackage(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("room_packages")
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/rooms");
  return { ok: true as const };
}

/* ─── Addons CRUD ──────────────────────────────────────────────────────── */
export async function upsertAddon(input: {
  id?: string;
  name: string;
  price: number;
  unit: "per_use" | "per_hour" | "per_person";
  description?: string | null;
  icon?: string | null;
  stock_total?: number | null;
  applies_to_room_ids?: string[];
  is_active?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name,
    price: input.price,
    unit: input.unit,
    description: input.description ?? null,
    icon: input.icon ?? null,
    stock_total: input.stock_total ?? null,
    applies_to_room_ids: input.applies_to_room_ids ?? [],
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { error } = await supabase
      .from("addons")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("addons").insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/addons");
  revalidatePath("/admin/bookings");
  return { ok: true as const };
}

export async function deleteAddon(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("addons")
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/addons");
  return { ok: true as const };
}

/* ─── Holidays CRUD ────────────────────────────────────────────────────── */
export async function upsertHoliday(input: {
  id?: string;
  occurred_on: string;
  name: string;
  is_annual: boolean;
  policy: "block" | "premium" | "vip_only";
  premium_pct?: number;
  notes?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    occurred_on: input.occurred_on,
    name: input.name,
    is_annual: input.is_annual,
    policy: input.policy,
    premium_pct: input.premium_pct ?? 0,
    notes: input.notes ?? null,
  };
  if (input.id) {
    const { error } = await supabase
      .from("holidays")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("holidays")
      .insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/holidays");
  return { ok: true as const };
}

export async function deleteHoliday(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/holidays");
  return { ok: true as const };
}

/* ─── Expense category CRUD ───────────────────────────────────────────── */
export async function upsertExpenseCategory(input: {
  id?: string;
  name: string;
  icon?: string | null;
  ai_keywords: string[];
  vat_default: boolean;
  tax_deductible: boolean;
  is_active?: boolean;
  display_order?: number;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name,
    icon: input.icon ?? null,
    ai_keywords: input.ai_keywords,
    vat_default: input.vat_default,
    tax_deductible: input.tax_deductible,
    is_active: input.is_active ?? true,
    display_order: input.display_order ?? 0,
  };
  if (input.id) {
    const { error } = await supabase
      .from("expense_categories")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("expense_categories")
      .insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/expense-categories");
  revalidatePath("/admin/finance");
  return { ok: true as const };
}

export async function deleteExpenseCategory(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/expense-categories");
  return { ok: true as const };
}

/* ─── Bank accounts CRUD ──────────────────────────────────────────────── */
export async function upsertBankAccount(input: {
  id?: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default?: boolean;
  is_active?: boolean;
  display_order?: number;
}) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    bank_name: input.bank_name,
    account_number: input.account_number,
    account_name: input.account_name,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    display_order: input.display_order ?? 0,
  };
  if (input.is_default) {
    // unset previous defaults
    await supabase
      .from("bank_accounts")
      .update({ is_default: false } as never)
      .neq("id", input.id ?? "00000000-0000-0000-0000-000000000000");
  }
  if (input.id) {
    const { error } = await supabase
      .from("bank_accounts")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("bank_accounts")
      .insert(payload as never);
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/admin/settings/payment");
  revalidatePath("/admin/finance");
  return { ok: true as const };
}

export async function deleteBankAccount(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/payment");
  return { ok: true as const };
}
