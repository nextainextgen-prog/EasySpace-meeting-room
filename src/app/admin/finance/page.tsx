import { Download } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  todayFinanceTotals,
  monthFinanceTotals,
  listOutstanding,
  cashflowMonthly,
  listExpenses,
  listExpenseCategories,
  listBankAccounts,
  recentTransactions,
  outstandingAging,
  taxSummaryMTD,
  cashflowForecast7d,
  burnRateAndRunway,
  incomeByRoomMTD,
  incomeBySourceMTD,
  recentFreeBookings,
} from "@/lib/data";
import { FinanceBoard } from "./finance-board";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [
    today,
    month,
    outstanding,
    trend,
    expenses,
    categories,
    banks,
    transactions,
    aging,
    tax,
    forecast,
    burn,
    byRoom,
    bySource,
    freeBookings,
  ] = await Promise.all([
    todayFinanceTotals(),
    monthFinanceTotals(),
    listOutstanding(50),
    cashflowMonthly(12),
    listExpenses({ limit: 50 }),
    listExpenseCategories(),
    listBankAccounts(),
    recentTransactions(30),
    outstandingAging(),
    taxSummaryMTD(),
    cashflowForecast7d(),
    burnRateAndRunway(),
    incomeByRoomMTD(),
    incomeBySourceMTD(),
    recentFreeBookings(20),
  ]);

  return (
    <>
      <AdminTopbar
        title="การเงิน"
        subtitle="รายรับ · รายจ่าย · ค้างชำระ · ภาษี · กระทบยอด"
        actions={
          <Button variant="secondary" iconLeft={<Download size={16} />}>
            Export
          </Button>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ภาพรวมการเงิน"
          description="ข้อมูลจาก Supabase real-time · sync กับ booking"
        />

        <FinanceBoard
          data={{
            today,
            month,
            outstanding,
            trend,
            expenses,
            categories,
            banks,
            transactions,
            aging,
            tax,
            forecast,
            burn,
            byRoom,
            bySource,
            freeBookings,
          }}
        />
      </div>
    </>
  );
}
