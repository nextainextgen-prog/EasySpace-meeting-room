import { notFound } from "next/navigation";
import { getCompanyProfile } from "@/lib/data/public-rooms";
import { getPublicBookingView } from "@/lib/server/public-booking";
import { QuotationDoc } from "../../_components/quotation-doc";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "ใบเสนอราคา — EasySpace", robots: { index: false, follow: false } };

export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ ref }, { t }] = await Promise.all([params, searchParams]);
  const [view, company] = await Promise.all([getPublicBookingView(decodeURIComponent(ref), t ?? ""), getCompanyProfile()]);
  if (!view?.quote) return notFound();
  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-[13px] text-ink-3">ใบเสนอราคา {view.quote.number}</p>
        <PrintButton />
      </div>
      <QuotationDoc
        quote={view.quote}
        company={company}
        customer={{ name: view.customerName, phone: view.customerPhone, email: view.customerEmail }}
        doc={view.doc}
        booking={{
          reference: view.reference,
          roomName: view.roomName,
          startsAt: view.startsAt,
          endsAt: view.endsAt,
          attendees: view.attendees,
        }}
      />
    </div>
  );
}
