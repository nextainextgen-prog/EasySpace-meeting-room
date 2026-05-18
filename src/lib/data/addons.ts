import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface Addon {
  id: string;
  name: string;
  price: number;
  unit: "per_use" | "per_hour" | "per_person";
  description: string | null;
  icon: string | null;
  stock_total: number | null;
  applies_to_room_ids: string[];
  is_active: boolean;
}

export async function listAddons(): Promise<Addon[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("addons")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Addon[];
}
