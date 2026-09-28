import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface BankForPayment {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
}

/** Active receiving accounts, default first — as customers will see them. */
export async function listPaymentBanks(): Promise<BankForPayment[]> {
  // Local UI review only: a stand-in account without touching the live table.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_PAYMENT_BANK) {
    try {
      return JSON.parse(process.env.DEV_PAYMENT_BANK) as BankForPayment[];
    } catch {
      // fall through to the real table
    }
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bank_accounts")
    .select("id, bank_name, account_number, account_name, is_default")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("display_order");
  return (data ?? []) as BankForPayment[];
}
