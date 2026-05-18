import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { PaymentMethod } from "@/lib/types";

export interface Expense {
  id: string;
  occurred_on: string;
  category_id: string | null;
  description: string;
  amount: number;
  vendor: string | null;
  vat_amount: number;
  withholding_amount: number;
  receipt_url: string | null;
  is_recurring: boolean;
  notes: string | null;
  created_at: string;
}

export interface OutstandingRow {
  id: string;
  reference_code: string;
  customer_name: string;
  starts_at: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  due_at: string;
  days_overdue: number;
}

export async function listExpenses(opts: { limit?: number; from?: string } = {}) {
  const supabase = createSupabaseAdminClient();
  let q = supabase
    .from("expenses")
    .select("*")
    .order("occurred_on", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.from) q = q.gte("occurred_on", opts.from);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Expense[];
}

export async function listOutstanding(limit = 10): Promise<OutstandingRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, total_amount, paid_amount, payment_status, customer:customers(display_name)",
    )
    .in("payment_status", ["unpaid", "deposit"])
    .in("booking_status", ["confirmed", "in_use", "completed"])
    .order("starts_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    total_amount: number;
    paid_amount: number;
    customer: { display_name: string } | null;
  }>;

  const now = new Date();
  const dueDays = 3; // settings.booking.policy.payment_due_days default
  return rows
    .map((r) => {
      const dueAt = new Date(r.starts_at);
      dueAt.setDate(dueAt.getDate() + dueDays);
      const outstanding = Number(r.total_amount) - Number(r.paid_amount);
      const daysOverdue = Math.max(
        0,
        Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000),
      );
      return {
        id: r.id,
        reference_code: r.reference_code,
        customer_name: r.customer?.display_name ?? "—",
        starts_at: r.starts_at,
        total_amount: Number(r.total_amount),
        paid_amount: Number(r.paid_amount),
        outstanding_amount: outstanding,
        due_at: dueAt.toISOString(),
        days_overdue: daysOverdue,
      };
    })
    .filter((r) => r.outstanding_amount > 0)
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .slice(0, limit);
}

export async function cashflowMonthly(months = 12) {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [{ data: paymentsData }, { data: expensesData }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select("amount, paid_at")
      .gte("paid_at", start.toISOString()),
    supabase
      .from("expenses")
      .select("amount, occurred_on")
      .gte("occurred_on", start.toISOString().slice(0, 10)),
  ]);

  const payments = (paymentsData ?? []) as Array<{
    amount: number;
    paid_at: string;
  }>;
  const expenses = (expensesData ?? []) as Array<{
    amount: number;
    occurred_on: string;
  }>;

  const monthsArr: Array<{
    key: string;
    month: string;
    income: number;
    expense: number;
  }> = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthsArr.push({
      key,
      month: d.toLocaleDateString("th-TH", { month: "short" }),
      income: 0,
      expense: 0,
    });
  }
  function bucket(date: Date) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return monthsArr.find((m) => m.key === key);
  }
  for (const p of payments) {
    const b = bucket(new Date(p.paid_at));
    if (b) b.income += Number(p.amount);
  }
  for (const e of expenses) {
    const b = bucket(new Date(e.occurred_on));
    if (b) b.expense += Number(e.amount);
  }
  return monthsArr;
}

export async function todayFinanceTotals() {
  const supabase = createSupabaseAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [{ data: paymentsData }, { data: expensesData }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select("amount, method")
      .gte("paid_at", today.toISOString())
      .lt("paid_at", tomorrow.toISOString()),
    supabase
      .from("expenses")
      .select("amount")
      .eq("occurred_on", today.toISOString().slice(0, 10)),
  ]);

  const payments = (paymentsData ?? []) as Array<{
    amount: number;
    method: PaymentMethod;
  }>;
  const expenses = (expensesData ?? []) as Array<{ amount: number }>;

  const income = payments.reduce((s, p) => s + Number(p.amount), 0);
  const expense = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const methodLabels: Record<PaymentMethod, string> = {
    cash: "เงินสด",
    bank_transfer: "โอนธนาคาร",
    promptpay: "PromptPay",
    qr: "QR Code",
    credit_card: "บัตรเครดิต",
  };

  const byMethodMap = new Map<string, number>();
  for (const p of payments) {
    const label = methodLabels[p.method] ?? p.method;
    byMethodMap.set(label, (byMethodMap.get(label) ?? 0) + Number(p.amount));
  }

  return {
    income,
    expense,
    net: income - expense,
    margin: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
    byMethod: Array.from(byMethodMap.entries())
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function monthFinanceTotals() {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [{ data: paymentsData }, { data: expensesData }, { data: bookingsData }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select("amount")
      .gte("paid_at", start.toISOString()),
    supabase
      .from("expenses")
      .select("amount")
      .gte("occurred_on", start.toISOString().slice(0, 10)),
    supabase
      .from("bookings")
      .select("id, paid_amount", { count: "exact" })
      .gte("starts_at", start.toISOString()),
  ]);

  const income = (
    (paymentsData ?? []) as Array<{ amount: number }>
  ).reduce((s, p) => s + Number(p.amount), 0);
  const expense = (
    (expensesData ?? []) as Array<{ amount: number }>
  ).reduce((s, e) => s + Number(e.amount), 0);
  const receiptCount = bookingsData?.length ?? 0;

  return { income, expense, net: income - expense, receiptCount };
}
