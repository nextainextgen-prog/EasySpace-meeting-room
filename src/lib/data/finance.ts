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

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
  ai_keywords: string[];
  vat_default: boolean;
  tax_deductible: boolean;
  is_active: boolean;
  display_order: number;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
  is_active: boolean;
  display_order: number;
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  return ((data ?? []) as unknown as ExpenseCategory[]) ?? [];
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  return ((data ?? []) as unknown as BankAccount[]) ?? [];
}

/** Income for the month split by room. */
export async function incomeByRoomMTD(): Promise<
  Array<{
    room_id: string;
    room_name: string;
    color: string;
    income: number;
    bookings: number;
    pct: number;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [{ data: bookingsData }, { data: roomsData }] = await Promise.all([
    supabase
      .from("bookings")
      .select("room_id, paid_amount")
      .gte("starts_at", start.toISOString()),
    supabase.from("rooms").select("id, name, color").order("display_order"),
  ]);

  const map = new Map<string, { income: number; count: number }>();
  for (const b of (bookingsData ?? []) as Array<{
    room_id: string;
    paid_amount: number;
  }>) {
    const e = map.get(b.room_id) ?? { income: 0, count: 0 };
    e.income += Number(b.paid_amount);
    e.count += 1;
    map.set(b.room_id, e);
  }

  const rooms = (roomsData ?? []) as Array<{
    id: string;
    name: string;
    color: string;
  }>;
  const total = rooms.reduce(
    (s, r) => s + (map.get(r.id)?.income ?? 0),
    0,
  );

  return rooms.map((r) => {
    const e = map.get(r.id) ?? { income: 0, count: 0 };
    return {
      room_id: r.id,
      room_name: r.name,
      color: r.color,
      income: e.income,
      bookings: e.count,
      pct: total > 0 ? Math.round((e.income / total) * 100) : 0,
    };
  });
}

/** Income for the month split by lead-source channel. */
export async function incomeBySourceMTD(): Promise<
  Array<{ source: string; income: number; bookings: number; pct: number }>
> {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("bookings")
    .select("source_channel, paid_amount")
    .gte("starts_at", start.toISOString());

  const labels: Record<string, string> = {
    line: "LINE",
    walk_in: "Walk-in",
    referral_bni: "BNI",
    facebook: "Facebook",
    google: "Google",
    email: "Email",
    other: "อื่นๆ",
  };

  const map = new Map<string, { income: number; count: number }>();
  for (const b of (data ?? []) as Array<{
    source_channel: string | null;
    paid_amount: number;
  }>) {
    const k = labels[b.source_channel ?? "other"] ?? "อื่นๆ";
    const e = map.get(k) ?? { income: 0, count: 0 };
    e.income += Number(b.paid_amount);
    e.count += 1;
    map.set(k, e);
  }
  const total = [...map.values()].reduce((s, x) => s + x.income, 0);
  return [...map.entries()]
    .map(([source, v]) => ({
      source,
      income: v.income,
      bookings: v.count,
      pct: total > 0 ? Math.round((v.income / total) * 100) : 0,
    }))
    .sort((a, b) => b.income - a.income);
}

/** Recent transactions: union of payments + expenses, last 30 entries. */
export async function recentTransactions(limit = 30): Promise<
  Array<{
    type: "income" | "expense";
    occurred_at: string;
    amount: number;
    label: string;
    sub: string;
    method?: string;
    reference?: string;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const [{ data: paymentsData }, { data: expensesData }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select(
        "id, paid_at, amount, method, reference, booking:bookings(reference_code, customer:customers(display_name), room:rooms(name))",
      )
      .order("paid_at", { ascending: false })
      .limit(limit),
    supabase
      .from("expenses")
      .select(
        "id, occurred_on, amount, description, vendor, category:expense_categories(name)",
      )
      .order("occurred_on", { ascending: false })
      .limit(limit),
  ]);

  const incomes = ((paymentsData ?? []) as unknown as Array<{
    paid_at: string;
    amount: number;
    method: string;
    reference: string | null;
    booking: {
      reference_code: string;
      customer: { display_name: string } | null;
      room: { name: string } | null;
    } | null;
  }>).map((p) => ({
    type: "income" as const,
    occurred_at: p.paid_at,
    amount: Number(p.amount),
    label:
      p.booking?.customer?.display_name ??
      p.booking?.reference_code ??
      "การชำระเงิน",
    sub: `${p.booking?.reference_code ?? "—"} · ${p.booking?.room?.name ?? "—"}`,
    method: p.method,
    reference: p.reference ?? undefined,
  }));

  const expenses = ((expensesData ?? []) as unknown as Array<{
    occurred_on: string;
    amount: number;
    description: string;
    vendor: string | null;
    category: { name: string } | null;
  }>).map((e) => ({
    type: "expense" as const,
    occurred_at: e.occurred_on,
    amount: Number(e.amount),
    label: e.description,
    sub: `${e.category?.name ?? "—"}${e.vendor ? ` · ${e.vendor}` : ""}`,
  }));

  return [...incomes, ...expenses]
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    )
    .slice(0, limit);
}

/** Outstanding aging buckets — 0-7 / 8-14 / 15-30 / >30 days */
export async function outstandingAging() {
  const list = await listOutstanding(500);
  const buckets = [
    { id: "current", label: "ภายในกำหนด", min: -Infinity, max: 0 },
    { id: "0-7", label: "เกิน 0-7 วัน", min: 1, max: 7 },
    { id: "8-14", label: "8-14 วัน", min: 8, max: 14 },
    { id: "15-30", label: "15-30 วัน", min: 15, max: 30 },
    { id: ">30", label: "> 30 วัน", min: 31, max: Infinity },
  ];
  return buckets.map((b) => {
    const items = list.filter(
      (o) => o.days_overdue >= b.min && o.days_overdue <= b.max,
    );
    return {
      id: b.id,
      label: b.label,
      count: items.length,
      amount: items.reduce((s, o) => s + o.outstanding_amount, 0),
      items: items.slice(0, 5),
    };
  });
}

/** Free bookings — last 30 days, for the Free Bookings sub-section */
export async function recentFreeBookings(limit = 20) {
  const supabase = createSupabaseAdminClient();
  const thirty = new Date();
  thirty.setDate(thirty.getDate() - 30);
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, total_amount, free_reason, customer:customers(display_name), room:rooms(name)",
    )
    .eq("payment_status", "free")
    .gte("starts_at", thirty.toISOString())
    .order("starts_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    total_amount: number;
    free_reason: string | null;
    customer: { display_name: string } | null;
    room: { name: string } | null;
  }>).map((b) => ({
    id: b.id,
    reference_code: b.reference_code,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    notional_amount: Number(b.total_amount),
    reason: b.free_reason ?? "—",
    customer_name: b.customer?.display_name ?? "—",
    room_name: b.room?.name ?? "—",
  }));
}

/** VAT/tax summary for the month */
export async function taxSummaryMTD() {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [{ data: paymentsData }, { data: expensesData }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select("amount")
      .gte("paid_at", start.toISOString()),
    supabase
      .from("expenses")
      .select("amount, vat_amount, withholding_amount")
      .gte("occurred_on", start.toISOString().slice(0, 10)),
  ]);

  const income = (
    (paymentsData ?? []) as Array<{ amount: number }>
  ).reduce((s, p) => s + Number(p.amount), 0);

  // Output VAT — bookings include VAT; ex-VAT base = income / 1.07
  const outputVat = +(income - income / 1.07).toFixed(2);
  const inputVat = (
    (expensesData ?? []) as Array<{ vat_amount: number }>
  ).reduce((s, e) => s + Number(e.vat_amount ?? 0), 0);
  const withholding = (
    (expensesData ?? []) as Array<{ withholding_amount: number }>
  ).reduce((s, e) => s + Number(e.withholding_amount ?? 0), 0);

  return {
    income,
    output_vat: outputVat,
    input_vat: +inputVat.toFixed(2),
    vat_payable: +(outputVat - inputVat).toFixed(2),
    withholding: +withholding.toFixed(2),
  };
}

/** Cash flow forecast — naive 7-day forward based on confirmed bookings due. */
export async function cashflowForecast7d() {
  const supabase = createSupabaseAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seven = new Date(today);
  seven.setDate(seven.getDate() + 7);

  const { data } = await supabase
    .from("bookings")
    .select("starts_at, total_amount, paid_amount, payment_status")
    .in("booking_status", ["confirmed", "pending", "in_use"])
    .gte("starts_at", today.toISOString())
    .lte("starts_at", seven.toISOString());

  const rows = (data ?? []) as Array<{
    starts_at: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
  }>;

  const days: Array<{
    key: string;
    label: string;
    expectedIn: number;
    bookings: number;
  }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: d.toLocaleDateString("th-TH", {
        weekday: "short",
        day: "numeric",
      }),
      expectedIn: 0,
      bookings: 0,
    });
  }
  for (const r of rows) {
    const k = new Date(r.starts_at).toISOString().slice(0, 10);
    const day = days.find((d) => d.key === k);
    if (day) {
      const due = Math.max(
        0,
        Number(r.total_amount) - Number(r.paid_amount),
      );
      day.expectedIn += due;
      day.bookings += 1;
    }
  }
  return days;
}

/** Burn rate (avg expense / day, last 30 days) and runway (days). */
export async function burnRateAndRunway() {
  const supabase = createSupabaseAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ data: expensesData }, { data: paymentsData }] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount")
      .gte("occurred_on", since.toISOString().slice(0, 10)),
    supabase
      .from("booking_payments")
      .select("amount, paid_at")
      .gte("paid_at", since.toISOString()),
  ]);

  const expenseTotal = (
    (expensesData ?? []) as Array<{ amount: number }>
  ).reduce((s, e) => s + Number(e.amount), 0);
  const incomeTotal = (
    (paymentsData ?? []) as Array<{ amount: number }>
  ).reduce((s, p) => s + Number(p.amount), 0);

  const burnPerDay = expenseTotal / 30;
  const netPerDay = (incomeTotal - expenseTotal) / 30;

  // Best-effort: cash on hand stored in settings under key "finance.cash_on_hand"
  let cashOnHand = 0;
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "finance.cash_on_hand")
      .maybeSingle();
    cashOnHand = Number(
      (data as { value?: { amount?: number } } | null)?.value?.amount ?? 0,
    );
  } catch {
    // ignore
  }

  const runwayDays =
    netPerDay >= 0
      ? Infinity
      : cashOnHand > 0
        ? Math.floor(cashOnHand / Math.abs(netPerDay))
        : 0;

  return {
    burnPerDay: +burnPerDay.toFixed(0),
    incomePerDay: +(incomeTotal / 30).toFixed(0),
    netPerDay: +netPerDay.toFixed(0),
    cashOnHand,
    runwayDays,
  };
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
