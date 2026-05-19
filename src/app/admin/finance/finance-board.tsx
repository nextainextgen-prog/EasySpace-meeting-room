"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Receipt,
  Sparkles,
  PiggyBank,
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  LineChart,
  AlertTriangle,
  FileCheck,
  Calculator,
  Settings as SettingsIcon,
  Plus,
  Send,
  Upload,
  CalendarClock,
  Banknote,
  Building2,
  X,
  Bell,
  Hand,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/cn";
import { formatBaht, formatCompactBaht, formatDate } from "@/lib/format";
import {
  createExpense,
  suggestExpenseCategory,
  sendOutstandingReminder,
  markBookingBadDebt,
  reconcileStatementCSV,
  setCashOnHand,
} from "@/lib/actions/finance";

type Tab =
  | "overview"
  | "income"
  | "expenses"
  | "cashflow"
  | "outstanding"
  | "reconciliation"
  | "tax"
  | "settings";

type Data = {
  today: {
    income: number;
    expense: number;
    net: number;
    margin: number;
    byMethod: Array<{ method: string; amount: number }>;
  };
  month: { income: number; expense: number; net: number; receiptCount: number };
  outstanding: Array<{
    id: string;
    reference_code: string;
    customer_name: string;
    starts_at: string;
    total_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    due_at: string;
    days_overdue: number;
  }>;
  trend: Array<{ key: string; month: string; income: number; expense: number }>;
  expenses: Array<{
    id: string;
    occurred_on: string;
    category_id: string | null;
    description: string;
    amount: number;
    vendor: string | null;
    vat_amount: number;
    withholding_amount: number;
    is_recurring: boolean;
    notes: string | null;
  }>;
  categories: Array<{
    id: string;
    name: string;
    icon: string | null;
    vat_default: boolean;
    tax_deductible: boolean;
  }>;
  banks: Array<{
    id: string;
    bank_name: string;
    account_number: string;
    account_name: string;
    is_default: boolean;
  }>;
  transactions: Array<{
    type: "income" | "expense";
    occurred_at: string;
    amount: number;
    label: string;
    sub: string;
    method?: string;
    reference?: string;
  }>;
  aging: Array<{
    id: string;
    label: string;
    count: number;
    amount: number;
    items: Array<{
      id: string;
      reference_code: string;
      customer_name: string;
      outstanding_amount: number;
      days_overdue: number;
    }>;
  }>;
  tax: {
    income: number;
    output_vat: number;
    input_vat: number;
    vat_payable: number;
    withholding: number;
  };
  forecast: Array<{
    key: string;
    label: string;
    expectedIn: number;
    bookings: number;
  }>;
  burn: {
    burnPerDay: number;
    incomePerDay: number;
    netPerDay: number;
    cashOnHand: number;
    runwayDays: number;
  };
  byRoom: Array<{
    room_id: string;
    room_name: string;
    color: string;
    income: number;
    bookings: number;
    pct: number;
  }>;
  bySource: Array<{
    source: string;
    income: number;
    bookings: number;
    pct: number;
  }>;
  freeBookings: Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    notional_amount: number;
    reason: string;
    customer_name: string;
    room_name: string;
  }>;
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Wallet }> = [
  { id: "overview", label: "ภาพรวม", icon: LayoutDashboard },
  { id: "income", label: "รายรับ", icon: ArrowDownToLine },
  { id: "expenses", label: "รายจ่าย", icon: ArrowUpFromLine },
  { id: "cashflow", label: "Cash Flow", icon: LineChart },
  { id: "outstanding", label: "ค้างชำระ", icon: AlertTriangle },
  { id: "reconciliation", label: "กระทบยอด", icon: FileCheck },
  { id: "tax", label: "ภาษี & รายงาน", icon: Calculator },
  { id: "settings", label: "ตั้งค่า", icon: SettingsIcon },
];

export function FinanceBoard({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <>
      <div className="surface-card !p-1.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-medium transition",
                  tab === t.id
                    ? "bg-primary-50 text-primary-700"
                    : "text-ink-2 hover:bg-surface-subtle hover:text-ink-1",
                )}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "income" && <IncomeTab data={data} />}
      {tab === "expenses" && <ExpensesTab data={data} notify={notify} />}
      {tab === "cashflow" && <CashFlowTab data={data} />}
      {tab === "outstanding" && (
        <OutstandingTab data={data} notify={notify} />
      )}
      {tab === "reconciliation" && (
        <ReconciliationTab notify={notify} />
      )}
      {tab === "tax" && <TaxTab data={data} />}
      {tab === "settings" && <SettingsTab data={data} notify={notify} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-pill bg-ink-1 text-white text-xs shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

/* ──────────── Overview ──────────── */
function OverviewTab({ data }: { data: Data }) {
  const { today, month, outstanding, trend, byRoom, bySource } = data;
  const max = Math.max(1, ...trend.map((m) => m.income));
  const outstandingTotal = outstanding.reduce(
    (s, o) => s + o.outstanding_amount,
    0,
  );
  const monthTargetTHB = 200_000;
  const targetPct = Math.round((month.income / monthTargetTHB) * 100);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <HeroCard
            eyebrow="รายรับวันนี้"
            value={formatBaht(today.income)}
            trailing={
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp size={14} />
                ค่าใช้จ่ายวันนี้ {formatBaht(today.expense)} · กำไรสุทธิ{" "}
                {formatBaht(today.net)}
              </span>
            }
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard
            label="รายรับเดือนนี้"
            value={formatCompactBaht(month.income)}
            hint={`${targetPct}% ของเป้า ${formatCompactBaht(monthTargetTHB)}`}
            icon={Wallet}
            iconTone="success"
          />
          <KpiCard
            label="กำไรสุทธิเดือนนี้"
            value={formatCompactBaht(month.net)}
            icon={PiggyBank}
          />
          <KpiCard
            label="ค้างชำระ"
            value={formatBaht(outstandingTotal)}
            hint={`${outstanding.length} ราย`}
            icon={AlertCircle}
            iconTone="danger"
          />
          <KpiCard
            label="รายจ่ายเดือนนี้"
            value={formatCompactBaht(month.expense)}
            icon={TrendingDown}
            iconTone="warning"
          />
          <KpiCard
            label="กำไร %"
            value={`${today.margin}%`}
            hint="วันนี้"
            icon={Sparkles}
          />
          <KpiCard
            label="ใบเสร็จเดือนนี้"
            value={`${month.receiptCount} ใบ`}
            icon={Receipt}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cash Flow — 12 เดือนล่าสุด</CardTitle>
            <CardSubtitle>รายรับ vs รายจ่าย</CardSubtitle>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary-600" />
              Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-line" />
              Expense
            </span>
          </div>
        </CardHeader>
        <div className="grid grid-cols-12 gap-3 h-48 items-end">
          {trend.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5 h-40">
                <div
                  className="flex-1 rounded-t bg-gradient-to-t from-primary-700 to-primary-400"
                  style={{ height: `${(m.income / max) * 100}%` }}
                  title={`Income ${formatBaht(m.income)}`}
                />
                <div
                  className="flex-1 rounded-t bg-line"
                  style={{ height: `${(m.expense / max) * 100}%` }}
                  title={`Expense ${formatBaht(m.expense)}`}
                />
              </div>
              <span className="text-[10px] text-ink-3">{m.month}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>รายรับแยกตามห้อง (เดือนนี้)</CardTitle>
              <CardSubtitle>
                {byRoom.length} ห้อง · ใช้ paid_amount จาก booking
              </CardSubtitle>
            </div>
          </CardHeader>
          {byRoom.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-6">
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <ul className="space-y-3">
              {byRoom.map((r) => (
                <li key={r.room_id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-pill"
                      style={{ background: r.color }}
                    />
                    <span className="text-sm font-medium flex-1 tracking-tight">
                      {r.room_name}
                    </span>
                    <span className="text-xs text-ink-3 tabular-nums">
                      {r.bookings} จอง
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatBaht(r.income)}
                    </span>
                    <span className="text-xs text-ink-3 tabular-nums w-10 text-right">
                      {r.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${r.pct}%`,
                        background: r.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>รายรับแยกตามที่มาลูกค้า (เดือนนี้)</CardTitle>
              <CardSubtitle>
                {bySource.length} ช่องทาง
              </CardSubtitle>
            </div>
          </CardHeader>
          {bySource.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-6">
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <ul className="space-y-3">
              {bySource.map((s) => (
                <li key={s.source}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ink-2">{s.source}</span>
                    <span className="font-semibold tabular-nums">
                      {formatBaht(s.income)} · {s.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full bg-primary-gradient"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RecentTransactionsTable data={data} />
    </div>
  );
}

function RecentTransactionsTable({ data }: { data: Data }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent Transactions</CardTitle>
          <CardSubtitle>
            {data.transactions.length} รายการล่าสุด · รายรับ + รายจ่าย
          </CardSubtitle>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
              <th className="text-left py-2 px-2 w-32">วันที่</th>
              <th className="text-left py-2 px-2">รายการ</th>
              <th className="text-left py-2 px-2">หมวด / ห้อง</th>
              <th className="text-right py-2 px-2">ยอด</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-ink-3 text-xs">
                  ยังไม่มีรายการ
                </td>
              </tr>
            ) : (
              data.transactions.map((t, i) => (
                <tr
                  key={i}
                  className="border-t border-line-soft hover:bg-primary-50/20"
                >
                  <td className="py-2 px-2 text-xs tabular-nums text-ink-3">
                    {new Date(t.occurred_at).toLocaleDateString("th-TH", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-2">
                    <div className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          t.type === "income" ? "bg-emerald-500" : "bg-red-500",
                        )}
                      />
                      <span className="font-medium tracking-tight">
                        {t.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-xs text-ink-3">{t.sub}</td>
                  <td className="py-2 px-2 text-right">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        t.type === "income" ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {t.type === "income" ? "+" : "-"}
                      {formatBaht(t.amount)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ──────────── Income ──────────── */
function IncomeTab({ data }: { data: Data }) {
  const { byRoom, bySource, today, freeBookings } = data;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Today by Payment Method</CardTitle>
          <span className="text-xs text-ink-3">
            {formatBaht(today.income)} · {today.byMethod.length} ช่องทาง
          </span>
        </CardHeader>
        {today.byMethod.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">
            วันนี้ยังไม่มียอดเข้า
          </p>
        ) : (
          <ul className="space-y-3">
            {today.byMethod.map((m) => {
              const pct = (m.amount / today.income) * 100;
              return (
                <li key={m.method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ink-2">{m.method}</span>
                    <span className="font-semibold tabular-nums">
                      {formatBaht(m.amount)}
                    </span>
                  </div>
                  <div className="h-2 rounded-pill bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full bg-primary-gradient"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>รายรับแยกตามห้อง (เดือนนี้)</CardTitle>
          </CardHeader>
          <ul className="space-y-3">
            {byRoom.map((r) => (
              <li
                key={r.room_id}
                className="flex items-center gap-3 px-3 py-2 rounded-input bg-surface-subtle/40"
              >
                <span
                  className="w-1.5 h-9 rounded-full"
                  style={{ background: r.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm tracking-tight">
                    {r.room_name}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {r.bookings} จอง · {r.pct}%
                  </p>
                </div>
                <p className="font-bold tabular-nums">
                  {formatBaht(r.income)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายรับแยกตามที่มา</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {bySource.map((s) => (
              <li
                key={s.source}
                className="flex items-center gap-3 px-3 py-2 rounded-input bg-surface-subtle/40"
              >
                <span className="flex-1 text-sm">{s.source}</span>
                <span className="text-[11px] text-ink-3 tabular-nums">
                  {s.bookings} จอง
                </span>
                <span className="font-bold tabular-nums w-28 text-right">
                  {formatBaht(s.income)}
                </span>
                <span className="text-[11px] text-ink-3 tabular-nums w-10 text-right">
                  {s.pct}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Free Bookings (30 วันล่าสุด)</CardTitle>
            <CardSubtitle>
              ไม่ถูกบวกเข้ายอดรายรับ — ใช้สำหรับ Demo / VIP / Internal
            </CardSubtitle>
          </div>
          <Badge tone="muted">{freeBookings.length} รายการ</Badge>
        </CardHeader>
        {freeBookings.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">ไม่มี free booking</p>
        ) : (
          <ul className="space-y-2">
            {freeBookings.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 px-3 py-2 rounded-input border border-line-soft bg-surface-subtle/30"
              >
                <span className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center text-slate-500 text-[10px] font-bold">
                  FREE
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm tracking-tight truncate">
                    {f.customer_name} · {f.room_name}
                  </p>
                  <p className="text-[11px] text-ink-3 tabular-nums">
                    <code className="font-mono">{f.reference_code}</code> ·{" "}
                    {new Date(f.starts_at).toLocaleString("th-TH", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-ink-3 line-through tabular-nums">
                    {formatBaht(f.notional_amount)}
                  </p>
                  <Badge tone="muted" className="!text-[10px] mt-0.5">
                    {f.reason}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ──────────── Expenses ──────────── */
function ExpensesTab({
  data,
  notify,
}: {
  data: Data;
  notify: (m: string) => void;
}) {
  const { expenses, categories } = data;
  const [formOpen, setFormOpen] = useState(false);

  const totalMonth = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-ink-3 uppercase tracking-[0.06em]">
            รวมรายจ่าย ({expenses.length} รายการ)
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatBaht(totalMonth)}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={14} />}
          onClick={() => setFormOpen(true)}
        >
          บันทึกรายจ่าย
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>10 หมวดรายจ่าย</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {categories.map((c) => {
            const sum = expenses
              .filter((e) => e.category_id === c.id)
              .reduce((s, e) => s + Number(e.amount), 0);
            return (
              <div
                key={c.id}
                className="rounded-input border border-line bg-surface-subtle/40 px-3 py-2.5"
              >
                <p className="text-[11px] text-ink-3 truncate">{c.name}</p>
                <p className="text-sm font-bold tabular-nums">
                  {sum > 0 ? formatBaht(sum) : "—"}
                </p>
                {c.vat_default && (
                  <Badge tone="muted" className="!text-[9px] mt-1">
                    VAT
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>รายการล่าสุด</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <th className="text-left py-2 px-2">วันที่</th>
                <th className="text-left py-2 px-2">รายการ</th>
                <th className="text-left py-2 px-2">หมวด</th>
                <th className="text-left py-2 px-2">ผู้รับ</th>
                <th className="text-right py-2 px-2">VAT</th>
                <th className="text-right py-2 px-2">หัก ณ จ่าย</th>
                <th className="text-right py-2 px-2">ยอด</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-3 text-xs">
                    ยังไม่มีรายจ่าย
                  </td>
                </tr>
              )}
              {expenses.map((e) => {
                const cat = categories.find((c) => c.id === e.category_id);
                return (
                  <tr
                    key={e.id}
                    className="border-t border-line-soft hover:bg-primary-50/20"
                  >
                    <td className="py-2 px-2 text-xs tabular-nums text-ink-3">
                      {e.occurred_on}
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-medium">{e.description}</span>
                      {e.is_recurring && (
                        <Badge tone="info" className="!text-[9px] ml-1.5">
                          recur
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs">{cat?.name ?? "—"}</td>
                    <td className="py-2 px-2 text-xs">{e.vendor ?? "—"}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums">
                      {Number(e.vat_amount) > 0
                        ? formatBaht(Number(e.vat_amount))
                        : "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums">
                      {Number(e.withholding_amount) > 0
                        ? formatBaht(Number(e.withholding_amount))
                        : "—"}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold tabular-nums">
                      {formatBaht(Number(e.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {formOpen && (
        <ExpenseFormModal
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            notify("บันทึกรายจ่ายเรียบร้อย — refresh เพื่อดูข้อมูลใหม่");
          }}
        />
      )}
    </div>
  );
}

function ExpenseFormModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: Data["categories"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [occurredOn, setOccurredOn] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [vatAmount, setVatAmount] = useState(0);
  const [withholdingAmount, setWithholdingAmount] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [aiSuggested, setAiSuggested] = useState<{
    id: string;
    name: string;
    confidence: number;
  } | null>(null);

  // AI categorize after typing
  useEffect(() => {
    if (!description.trim() || categoryId) {
      setAiSuggested(null);
      return;
    }
    const handle = setTimeout(async () => {
      const r = await suggestExpenseCategory(
        `${description} ${vendor}`,
      );
      if (r.categoryId) {
        setAiSuggested({
          id: r.categoryId,
          name: r.categoryName!,
          confidence: r.confidence,
        });
      } else setAiSuggested(null);
    }, 350);
    return () => clearTimeout(handle);
  }, [description, vendor, categoryId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!description || amount <= 0) {
      setErr("กรอกรายละเอียดและจำนวน");
      return;
    }
    startTransition(async () => {
      const r = await createExpense({
        occurredOn,
        categoryId: categoryId || null,
        description,
        amount,
        vendor: vendor || undefined,
        vatAmount,
        withholdingAmount,
        isRecurring,
        notes: notes || undefined,
      });
      if (r.ok) onSaved();
      else setErr(`บันทึกไม่สำเร็จ: ${r.error}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden"
      >
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight">บันทึกรายจ่ายใหม่</p>
            <p className="text-xs text-ink-3 mt-0.5">
              AI จะแนะนำหมวดอัตโนมัติเมื่อพิมพ์รายละเอียด
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>วันที่</Label>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <div>
              <Label>ยอด (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div>
            <Label>รายละเอียด *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ค่าไฟเดือนพฤษภาคม..."
              required
            />
          </div>

          <div>
            <Label>ผู้รับ / Vendor</Label>
            <Input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="MEA / TOT / ..."
            />
          </div>

          <div>
            <Label>หมวด</Label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— เลือกหมวด —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {aiSuggested && !categoryId && (
              <button
                type="button"
                onClick={() => setCategoryId(aiSuggested.id)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-700 hover:underline"
              >
                <Sparkles size={11} />
                AI แนะนำ: <b>{aiSuggested.name}</b>{" "}
                ({(aiSuggested.confidence * 100).toFixed(0)}%)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>VAT (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={vatAmount || ""}
                onChange={(e) => setVatAmount(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>หัก ณ ที่จ่าย (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={withholdingAmount || ""}
                onChange={(e) =>
                  setWithholdingAmount(Number(e.target.value) || 0)
                }
                placeholder="0"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 accent-primary-600"
            />
            เป็นรายจ่ายประจำ (recurring)
          </label>

          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="shrink-0 px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            ปิด
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending}
          >
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ──────────── Cash Flow ──────────── */
function CashFlowTab({ data }: { data: Data }) {
  const { trend, forecast, burn } = data;
  const max = Math.max(1, ...trend.map((m) => m.income));
  const maxForecast = Math.max(1, ...forecast.map((d) => d.expectedIn));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow — 12 เดือน</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-12 gap-3 h-48 items-end">
          {trend.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5 h-40">
                <div
                  className="flex-1 rounded-t bg-gradient-to-t from-primary-700 to-primary-400"
                  style={{ height: `${(m.income / max) * 100}%` }}
                  title={`Income ${formatBaht(m.income)}`}
                />
                <div
                  className="flex-1 rounded-t bg-line"
                  style={{ height: `${(m.expense / max) * 100}%` }}
                  title={`Expense ${formatBaht(m.expense)}`}
                />
              </div>
              <span className="text-[10px] text-ink-3">{m.month}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cash Flow Forecast (7 วัน)</CardTitle>
              <CardSubtitle>
                คำนวณจากการจองที่ยืนยันแล้ว · AI Light
              </CardSubtitle>
            </div>
            <IconTile icon={CalendarClock} tone="info" size="sm" />
          </CardHeader>
          <div className="space-y-2">
            {forecast.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-xs text-ink-2 w-20 shrink-0 tabular-nums">
                  {d.label}
                </span>
                <div className="flex-1 h-3 rounded-pill bg-surface-subtle overflow-hidden">
                  <div
                    className="h-full bg-primary-gradient"
                    style={{
                      width: `${(d.expectedIn / maxForecast) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums font-medium w-28 text-right">
                  {formatBaht(d.expectedIn)}
                </span>
                <span className="text-[10px] text-ink-3 tabular-nums w-12 text-right">
                  {d.bookings} จอง
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Burn Rate & Runway</CardTitle>
          </CardHeader>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-ink-2">รายรับ / วัน (30 วัน)</span>
              <span className="font-semibold tabular-nums">
                {formatBaht(burn.incomePerDay)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-2">Burn / วัน</span>
              <span className="font-semibold tabular-nums">
                {formatBaht(burn.burnPerDay)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-2">Net / วัน</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  burn.netPerDay >= 0 ? "text-emerald-700" : "text-red-700",
                )}
              >
                {formatBaht(burn.netPerDay)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-2">เงินสดคงเหลือ</span>
              <span className="font-semibold tabular-nums">
                {formatBaht(burn.cashOnHand)}
              </span>
            </li>
            <li className="flex justify-between border-t border-line-soft pt-3">
              <span className="text-ink-2">Runway</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  burn.runwayDays === Infinity
                    ? "text-emerald-700"
                    : burn.runwayDays < 30
                      ? "text-red-700"
                      : "text-amber-700",
                )}
              >
                {burn.runwayDays === Infinity
                  ? "∞ (กำไรเป็นบวก)"
                  : `${burn.runwayDays} วัน`}
              </span>
            </li>
          </ul>
          <p className="text-[11px] text-ink-3 mt-3">
            เซต cash-on-hand ได้ในแท็บ "ตั้งค่า"
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ──────────── Outstanding ──────────── */
function OutstandingTab({
  data,
  notify,
}: {
  data: Data;
  notify: (m: string) => void;
}) {
  const { aging, outstanding } = data;
  const [sending, setSending] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [markReason, setMarkReason] = useState("");

  async function remind(id: string) {
    setSending(id);
    const r = await sendOutstandingReminder(id);
    setSending(null);
    notify(r.ok ? "ส่งแจ้งเตือนเรียบร้อย" : `ส่งไม่สำเร็จ: ${r.error}`);
  }

  async function doMark(id: string) {
    if (!markReason.trim()) return;
    const r = await markBookingBadDebt(id, markReason);
    if (r.ok) {
      notify("ทำเครื่องหมายเป็นหนี้สูญแล้ว");
      setMarking(null);
      setMarkReason("");
    } else notify(`ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-5 gap-3">
        {aging.map((b) => (
          <Card key={b.id} className="!p-3">
            <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
              {b.label}
            </p>
            <p
              className={cn(
                "text-xl font-bold tabular-nums mt-1",
                b.id === ">30"
                  ? "text-red-700"
                  : b.id === "15-30"
                    ? "text-amber-700"
                    : b.id === "current"
                      ? "text-emerald-700"
                      : "text-ink-1",
              )}
            >
              {b.count}
            </p>
            <p className="text-[11px] text-ink-3 tabular-nums">
              {formatBaht(b.amount)}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>รายการค้างชำระ ({outstanding.length})</CardTitle>
        </CardHeader>
        {outstanding.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-8">
            ไม่มีรายการค้างชำระ
          </p>
        ) : (
          <ul className="space-y-2">
            {outstanding.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 p-3 rounded-input border border-line-soft"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm tracking-tight truncate">
                    {o.customer_name}
                  </p>
                  <p className="text-[11px] text-ink-3 tabular-nums">
                    <code className="font-mono">{o.reference_code}</code> ·
                    กำหนด {formatDate(o.due_at)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums">
                    {formatBaht(o.outstanding_amount)}
                  </p>
                  <Badge
                    tone={o.days_overdue > 0 ? "danger" : "warning"}
                    className="mt-1 !text-[10px]"
                  >
                    {o.days_overdue > 0
                      ? `เกิน ${o.days_overdue} วัน`
                      : "ภายในกำหนด"}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => remind(o.id)}
                    disabled={sending === o.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-line bg-white text-[11px] hover:bg-primary-50"
                  >
                    <Bell size={11} />
                    {sending === o.id ? "ส่ง..." : "แจ้งเตือน"}
                  </button>
                  <button
                    onClick={() => setMarking(o.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-line bg-white text-[11px] hover:bg-red-50 text-red-700"
                  >
                    <Hand size={11} />
                    หนี้สูญ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {marking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md surface-card max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <p className="font-bold tracking-tight">ทำเครื่องหมายเป็นหนี้สูญ</p>
            <p className="text-xs text-ink-3 mt-0.5 mb-4">
              ระบบจะตั้งเป็น free + เก็บเหตุผลไว้ใน audit log
            </p>
            <Label>เหตุผล *</Label>
            <Textarea
              rows={3}
              value={markReason}
              onChange={(e) => setMarkReason(e.target.value)}
              placeholder="ติดต่อไม่ได้ / ลูกค้าปฏิเสธ..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMarking(null);
                  setMarkReason("");
                }}
              >
                ปิด
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => doMark(marking)}
                disabled={!markReason.trim()}
              >
                ยืนยัน
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────── Reconciliation ──────────── */
function ReconciliationTab({ notify }: { notify: (m: string) => void }) {
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof reconcileStatementCSV>
  > | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  function run() {
    startTransition(async () => {
      const r = await reconcileStatementCSV({ csv });
      setResult(r);
      if (r.ok)
        notify(
          `แมตช์ ${(r.summary as { matched: number }).matched}/${(r.summary as { rows: number }).rows} รายการ`,
        );
      else notify(`ไม่สำเร็จ: ${r.error}`);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>กระทบยอด (Bank Statement)</CardTitle>
            <CardSubtitle>
              อัปโหลด CSV → AI พยายามจับคู่กับ booking ค้างชำระอัตโนมัติ
            </CardSubtitle>
          </div>
          <IconTile icon={FileCheck} tone="info" size="sm" />
        </CardHeader>

        <div className="rounded-input border border-dashed border-line p-6 text-center">
          <Upload
            size={22}
            className="text-ink-3 mx-auto mb-2"
            strokeWidth={1.5}
          />
          <p className="text-xs text-ink-2 mb-3">
            อัปโหลดไฟล์ CSV (date, description, amount)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={onFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            เลือกไฟล์
          </Button>
        </div>

        {csv && (
          <div className="mt-4">
            <Label>หรือวาง CSV ตรงนี้</Label>
            <Textarea
              rows={6}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="!text-[11px] font-mono"
            />
            <div className="flex justify-end mt-3">
              <Button
                variant="primary"
                size="sm"
                onClick={run}
                disabled={pending}
                iconLeft={<Sparkles size={13} />}
              >
                {pending ? "กำลังจับคู่..." : "AI จับคู่"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {result?.ok && (
        <Card>
          <CardHeader>
            <CardTitle>ผลการจับคู่</CardTitle>
            <span className="text-xs text-ink-3 tabular-nums">
              แมตช์ {(result.summary as { matched: number }).matched}/
              {(result.summary as { rows: number }).rows} · รวม{" "}
              {formatBaht((result.summary as { total: number }).total)}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="text-left py-2 px-2">วันที่</th>
                  <th className="text-left py-2 px-2">รายละเอียด</th>
                  <th className="text-right py-2 px-2">ยอด</th>
                  <th className="text-left py-2 px-2">แมตช์</th>
                </tr>
              </thead>
              <tbody>
                {(
                  result.results as Array<{
                    date: string;
                    description: string;
                    amount: number;
                    matched: { reference_code: string } | null;
                    confidence: number;
                  }>
                ).map((r, i) => (
                  <tr
                    key={i}
                    className="border-t border-line-soft hover:bg-primary-50/20"
                  >
                    <td className="py-2 px-2 text-xs tabular-nums text-ink-3">
                      {r.date}
                    </td>
                    <td className="py-2 px-2 text-xs">{r.description}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatBaht(r.amount)}
                    </td>
                    <td className="py-2 px-2">
                      {r.matched ? (
                        <Badge tone="success" className="!text-[10px]">
                          {r.matched.reference_code} ·{" "}
                          {(r.confidence * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        <Badge tone="muted" className="!text-[10px]">
                          ไม่พบ
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ──────────── Tax & Reports ──────────── */
function TaxTab({ data }: { data: Data }) {
  const { tax, transactions } = data;

  function exportFlowAccount() {
    // Header compatible with FlowAccount/PEAK basic import
    const header = [
      "วันที่",
      "ประเภท",
      "เลขที่อ้างอิง",
      "ลูกค้า/ผู้รับ",
      "หมวด",
      "ยอด",
      "VAT",
      "วิธีชำระ",
    ];
    const lines = [header.join(",")];
    for (const t of transactions) {
      lines.push(
        [
          new Date(t.occurred_at).toISOString().slice(0, 10),
          t.type === "income" ? "รายรับ" : "รายจ่าย",
          `"${t.reference ?? ""}"`,
          `"${t.label}"`,
          `"${t.sub}"`,
          t.amount.toFixed(2),
          "0.00",
          `"${t.method ?? ""}"`,
        ].join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowaccount-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="!p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
            ยอดขายเดือนนี้
          </p>
          <p className="font-bold tabular-nums mt-1">
            {formatBaht(tax.income)}
          </p>
        </Card>
        <Card className="!p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
            VAT ขาย 7%
          </p>
          <p className="font-bold tabular-nums mt-1 text-emerald-700">
            {formatBaht(tax.output_vat)}
          </p>
        </Card>
        <Card className="!p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
            VAT ซื้อ
          </p>
          <p className="font-bold tabular-nums mt-1 text-amber-700">
            {formatBaht(tax.input_vat)}
          </p>
        </Card>
        <Card className="!p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
            VAT ต้องนำส่ง
          </p>
          <p
            className={cn(
              "font-bold tabular-nums mt-1",
              tax.vat_payable > 0 ? "text-red-700" : "text-emerald-700",
            )}
          >
            {formatBaht(tax.vat_payable)}
          </p>
        </Card>
        <Card className="!p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
            หัก ณ ที่จ่าย
          </p>
          <p className="font-bold tabular-nums mt-1">
            {formatBaht(tax.withholding)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>รายงานภาษี</CardTitle>
            <CardSubtitle>
              ภ.พ.30 · ใบกำกับภาษี · e-Tax · เตรียมข้อมูลส่งบัญชี
            </CardSubtitle>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-input border border-line p-4">
            <p className="font-semibold text-sm tracking-tight">
              ภ.พ.30 (เดือนนี้)
            </p>
            <p className="text-[11px] text-ink-3 mt-1">
              ยอดที่ต้องชำระ ={" "}
              <b className="text-ink-1">{formatBaht(tax.vat_payable)}</b>
            </p>
            <p className="text-[11px] text-ink-3 mt-2">
              กำหนดยื่นภายในวันที่ 15 ของเดือนถัดไป
            </p>
          </div>
          <div className="rounded-input border border-line p-4">
            <p className="font-semibold text-sm tracking-tight">
              ใบกำกับภาษีออก
            </p>
            <p className="text-[11px] text-ink-3 mt-1">
              ระบบสร้างใบกำกับอัตโนมัติเมื่อบันทึก booking — ดูเอกสารใน tab "ไฟล์"
              ของ booking
            </p>
          </div>
          <div className="rounded-input border border-line p-4">
            <p className="font-semibold text-sm tracking-tight">e-Tax</p>
            <p className="text-[11px] text-ink-3 mt-1">
              ส่งออกข้อมูลเป็น XML ตามมาตรฐาน RD (เตรียมไว้สำหรับการ submit)
            </p>
            <p className="text-[10px] text-ink-3 mt-2">
              เร็ว ๆ นี้ — ตอนนี้ใช้ Export CSV ไปก่อน
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Export ไปโปรแกรมบัญชี</CardTitle>
            <CardSubtitle>
              FlowAccount / PEAK / Express / QuickBooks · CSV รูปแบบมาตรฐาน
            </CardSubtitle>
          </div>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Receipt size={13} />}
            onClick={exportFlowAccount}
          >
            FlowAccount CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Receipt size={13} />}
            onClick={exportFlowAccount}
          >
            PEAK CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Receipt size={13} />}
            onClick={exportFlowAccount}
          >
            Express CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Receipt size={13} />}
            onClick={exportFlowAccount}
          >
            QuickBooks CSV
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ──────────── Settings ──────────── */
function SettingsTab({
  data,
  notify,
}: {
  data: Data;
  notify: (m: string) => void;
}) {
  const { banks, burn } = data;
  const [cash, setCash] = useState(burn.cashOnHand);
  const [pending, startTransition] = useTransition();

  function saveCash() {
    startTransition(async () => {
      const r = await setCashOnHand(cash);
      notify(r.ok ? "บันทึก cash-on-hand แล้ว" : "ไม่สำเร็จ");
    });
  }

  const events = [
    { id: "payment.paid", label: "บันทึกยอดเข้า (จ่ายครบ)", icon: Banknote },
    { id: "payment.deposit", label: "บันทึกมัดจำ", icon: Banknote },
    { id: "payment.refund", label: "คืนเงิน", icon: ArrowUpFromLine },
    { id: "payment.free", label: "Booking ฟรี (notional)", icon: Sparkles },
    {
      id: "outstanding.alert",
      label: "แจ้งเตือนยอดค้าง / ใบแจ้งหนี้",
      icon: AlertTriangle,
    },
    {
      id: "finance.daily_brief",
      label: "AI Daily Brief (19:00 ทุกวัน)",
      icon: Sparkles,
    },
    {
      id: "finance.weekly_summary",
      label: "สรุปประจำสัปดาห์",
      icon: LineChart,
    },
    {
      id: "internal.no_show",
      label: "No-show / หนี้สูญ",
      icon: AlertCircle,
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>เงินสดคงเหลือ (Cash on hand)</CardTitle>
          <CardSubtitle>
            ใช้คำนวณ Burn rate & Runway — เก็บใน settings.finance.cash_on_hand
          </CardSubtitle>
        </CardHeader>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>จำนวน (บาท)</Label>
            <Input
              type="number"
              min={0}
              value={cash || ""}
              onChange={(e) => setCash(Number(e.target.value) || 0)}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={saveCash}
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>บัญชีธนาคาร ({banks.length})</CardTitle>
          <span className="text-xs text-ink-3">
            แก้ที่ /admin/settings (ภายหลัง)
          </span>
        </CardHeader>
        {banks.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">
            ยังไม่มีบัญชี
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {banks.map((b) => (
              <li
                key={b.id}
                className="rounded-input border border-line p-3 flex items-start gap-3"
              >
                <span className="w-9 h-9 rounded-input bg-primary-50 text-primary-700 grid place-items-center shrink-0">
                  <Building2 size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold tracking-tight text-sm">
                    {b.bank_name}{" "}
                    {b.is_default && (
                      <Badge tone="primary" className="!text-[9px] ml-1">
                        default
                      </Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-3 font-mono tabular-nums">
                    {b.account_number}
                  </p>
                  <p className="text-[11px] text-ink-3">{b.account_name}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Telegram "ยอดเข้าไม่พัก" — 8 Event Templates</CardTitle>
            <CardSubtitle>
              แก้ template ที่ /admin/settings/notifications (ใช้
              templates/telegram.ts)
            </CardSubtitle>
          </div>
          <IconTile icon={Send} tone="primary" size="sm" />
        </CardHeader>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {events.map((e) => {
            const Icon = e.icon;
            return (
              <li
                key={e.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-input bg-surface-subtle/40 border border-line-soft"
              >
                <Icon size={14} className="text-primary-600" />
                <code className="font-mono text-[11px] text-ink-3">
                  {e.id}
                </code>
                <span className="text-sm flex-1 tracking-tight">
                  {e.label}
                </span>
                <Badge tone="success" className="!text-[10px]">
                  on
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

