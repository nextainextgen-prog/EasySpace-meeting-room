"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { dispatchEvent } from "@/lib/server/notifications";
import {
  listExpenseCategories,
  recentTransactions,
  outstandingAging,
  taxSummaryMTD,
  cashflowForecast7d,
  burnRateAndRunway,
  incomeByRoomMTD,
  incomeBySourceMTD,
  recentFreeBookings,
  listBankAccounts,
} from "@/lib/data/finance";

const CreateExpenseSchema = z.object({
  occurredOn: z.string(),
  categoryId: z.string().uuid().nullable(),
  description: z.string().min(1),
  amount: z.number().positive(),
  vendor: z.string().optional(),
  vatAmount: z.number().nonnegative().default(0),
  withholdingAmount: z.number().nonnegative().default(0),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().optional(),
  notes: z.string().optional(),
});

export async function createExpense(raw: z.infer<typeof CreateExpenseSchema>) {
  const parsed = CreateExpenseSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      occurred_on: input.occurredOn,
      category_id: input.categoryId,
      description: input.description,
      amount: input.amount,
      vendor: input.vendor ?? null,
      vat_amount: input.vatAmount,
      withholding_amount: input.withholdingAmount,
      is_recurring: input.isRecurring,
      recurrence_rule: input.recurrenceRule ?? null,
      recorded_by: me?.id ?? null,
      notes: input.notes ?? null,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/finance");
  return { ok: true as const, expenseId: (data as { id: string }).id };
}

/** Cheap "AI" categorizer — keyword match against expense_categories.ai_keywords. */
export async function suggestExpenseCategory(text: string): Promise<{
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
}> {
  if (!text.trim())
    return { categoryId: null, categoryName: null, confidence: 0 };
  const cats = await listExpenseCategories();
  const lower = text.toLowerCase();
  let best: { id: string; name: string; score: number } | null = null;
  for (const c of cats) {
    let score = 0;
    for (const k of c.ai_keywords ?? []) {
      if (k && lower.includes(String(k).toLowerCase())) score += 1;
    }
    if (best === null || score > best.score)
      best = { id: c.id, name: c.name, score };
  }
  if (!best || best.score === 0)
    return { categoryId: null, categoryName: null, confidence: 0 };
  return {
    categoryId: best.id,
    categoryName: best.name,
    confidence: Math.min(1, best.score / 3),
  };
}

/** Send a reminder for an outstanding booking — Telegram blast + audit. */
export async function sendOutstandingReminder(bookingId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, total_amount, paid_amount, customer:customers(display_name, phone, email), room:rooms(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { ok: false as const, error: "not_found" };
  const row = booking as unknown as {
    reference_code: string;
    total_amount: number;
    paid_amount: number;
    customer: {
      display_name: string;
      phone: string | null;
      email: string | null;
    };
    room: { name: string };
  };
  const remaining = Math.max(
    0,
    Number(row.total_amount) - Number(row.paid_amount),
  );

  const text = [
    "<b>แจ้งเตือนยอดค้างชำระ</b>",
    "",
    `รหัส: <code>${row.reference_code}</code>`,
    `ลูกค้า: <b>${row.customer.display_name}</b>`,
    `ห้อง: ${row.room.name}`,
    `ยอดค้าง: ${remaining.toLocaleString()} บาท`,
    row.customer.phone ? `เบอร์: ${row.customer.phone}` : null,
    row.customer.email ? `Email: ${row.customer.email}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await dispatchEvent("outstanding.alert", text);

  const me = await getCurrentProfile();
  await supabase.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "reminder_sent",
    actor_id: me?.id ?? null,
    actor_name: me?.full_name ?? me?.email ?? null,
    changes: { channel: "telegram", remaining },
  } as never);

  return { ok: true as const };
}

/** Mark a booking as bad debt — sets payment_status=free w/ reason. */
export async function markBookingBadDebt(bookingId: string, reason: string) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  const { error } = await supabase
    .from("bookings")
    .update({
      free_reason: `[BAD DEBT] ${reason}`,
      metadata: { bad_debt: true, bad_debt_at: new Date().toISOString() } as never,
    } as never)
    .eq("id", bookingId);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "bad_debt_marked",
    actor_id: me?.id ?? null,
    actor_name: me?.full_name ?? me?.email ?? null,
    reason,
  } as never);

  revalidatePath("/admin/finance");
  return { ok: true as const };
}

/** Reconciliation: parse a bank-statement CSV string and try to match
 *  each line to an unpaid booking by amount + reference code. */
export async function reconcileStatementCSV(input: { csv: string }) {
  if (!input.csv?.trim())
    return { ok: false as const, error: "empty" };
  const lines = input.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2)
    return { ok: false as const, error: "no_data" };

  // Expected columns: date, description, amount (THB)
  // We accept any of: 0=date, 1=desc, 2=amount; or last col = amount.
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(",").map((p) => p.trim().replace(/"/g, ""));
    const amount = Number(parts[parts.length - 1].replace(/[^0-9.\-]/g, ""));
    return {
      raw: line,
      date: parts[0],
      description: parts.slice(1, -1).join(", "),
      amount: isFinite(amount) ? amount : 0,
    };
  });

  const supabase = createSupabaseAdminClient();
  const { data: candidates } = await supabase
    .from("bookings")
    .select("id, reference_code, total_amount, paid_amount, payment_status")
    .in("payment_status", ["unpaid", "deposit"])
    .limit(500);

  const cands = (candidates ?? []) as Array<{
    id: string;
    reference_code: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
  }>;

  const results = rows.map((r) => {
    const remainingMatch = cands.find(
      (c) =>
        Math.abs(Number(c.total_amount) - Number(c.paid_amount) - r.amount) <
        1,
    );
    const codeMatch = cands.find((c) =>
      r.description.includes(c.reference_code),
    );
    const match = codeMatch ?? remainingMatch;
    return {
      ...r,
      matched: match
        ? { id: match.id, reference_code: match.reference_code }
        : null,
      confidence: codeMatch ? 0.95 : remainingMatch ? 0.7 : 0,
    };
  });

  const summary = {
    rows: results.length,
    matched: results.filter((r) => r.matched).length,
    unmatched: results.filter((r) => !r.matched).length,
    total: results.reduce((s, r) => s + r.amount, 0),
  };
  return { ok: true as const, summary, results };
}

/** Set cash-on-hand (used by burn-rate / runway calc). */
export async function setCashOnHand(amount: number) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  await supabase.from("settings").upsert(
    {
      key: "finance.cash_on_hand",
      value: { amount } as never,
      category: "finance",
      updated_by: me?.id ?? null,
    } as never,
    { onConflict: "key" },
  );
  revalidatePath("/admin/finance");
  return { ok: true as const };
}

/** Used by client tab to refresh sections without a full page reload. */
export async function loadFinanceSnapshot() {
  const [
    transactions,
    aging,
    tax,
    forecast,
    burn,
    byRoom,
    bySource,
    free,
    banks,
  ] = await Promise.all([
    recentTransactions(30),
    outstandingAging(),
    taxSummaryMTD(),
    cashflowForecast7d(),
    burnRateAndRunway(),
    incomeByRoomMTD(),
    incomeBySourceMTD(),
    recentFreeBookings(20),
    listBankAccounts(),
  ]);
  return { transactions, aging, tax, forecast, burn, byRoom, bySource, free, banks };
}
