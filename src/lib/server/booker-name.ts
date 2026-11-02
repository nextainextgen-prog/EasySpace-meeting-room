import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

type Row = {
  member_id?: string | null;
  customer?: { display_name: string } | null;
};

/**
 * Who booked each row, for notices. Internal (member) bookings have no
 * customer, so reading `customer.display_name` straight off them throws — the
 * name comes from `members` instead. Order matches `rows`.
 */
export async function bookerNames(rows: Row[]): Promise<string[]> {
  const memberIds = [
    ...new Set(
      rows
        .filter((r) => !r.customer && r.member_id)
        .map((r) => r.member_id as string),
    ),
  ];
  const names = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data } = await createSupabaseAdminClient()
      .from("members")
      .select("id, full_name, email")
      .in("id", memberIds);
    for (const m of (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>) {
      names.set(m.id, m.full_name || m.email || "สมาชิก");
    }
  }
  return rows.map(
    (r) =>
      r.customer?.display_name ??
      (r.member_id ? names.get(r.member_id) ?? "สมาชิก" : "-"),
  );
}
