import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/billing/overage";
import { getInvoice, getOrgMonth, listInvoices } from "@/lib/server/org-billing";
import { InvoiceDoc } from "./invoice-doc";
import { InvoiceActions } from "./invoice-actions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("accountant");
  const { id } = await params;
  const found = await getInvoice(id);
  if (!found) notFound();
  const { invoice: inv, payments, events } = found;

  // A voided invoice can be replaced — only if nothing live exists for that month yet.
  const siblings = (await listInvoices({ orgId: inv.orgId, period: inv.period })) ?? [];
  const replacement = siblings.find((s) => s.status !== "void" && s.id !== inv.id) ?? null;
  const month = inv.status === "void" && !replacement ? await getOrgMonth(inv.orgId, inv.period) : null;
  const replaced = inv.replacesId ? siblings.find((s) => s.id === inv.replacesId) ?? null : null;

  return (
    <>
      <div className="print:hidden">
        <AdminTopbar title={`ใบแจ้งหนี้ ${inv.invoiceNo}`} subtitle={`${inv.orgName} · ค่าใช้เกินโควตา`} />
      </div>
      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto print:p-0 print:max-w-none">
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <Link href={`/admin/orgs/billing?period=${inv.period}`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink-1">
            <ChevronLeft size={16} /> กลับหน้าค่าใช้เกินโควตา
          </Link>
          <Badge tone={INVOICE_STATUS[inv.status].tone}>{INVOICE_STATUS[inv.status].label}</Badge>
          {replacement && (
            <Link href={`/admin/orgs/billing/${replacement.id}`} className="text-xs text-primary-700 hover:underline">
              ใบที่ออกแทน: {replacement.invoiceNo}
            </Link>
          )}
          {replaced && (
            <Link href={`/admin/orgs/billing/${replaced.id}`} className="text-xs text-primary-700 hover:underline">
              ออกแทนใบ {replaced.invoiceNo}
            </Link>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] print:block">
          <InvoiceDoc inv={inv} />
          <div className="print:hidden">
            <InvoiceActions inv={inv} payments={payments} events={events} month={month} />
          </div>
        </div>
      </div>
    </>
  );
}
