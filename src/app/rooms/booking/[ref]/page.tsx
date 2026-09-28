import Link from "next/link";
import { getCompanyProfile, getPublicRoomConfig } from "@/lib/data/public-rooms";
import { getPublicBookingView } from "@/lib/server/public-booking";
import { getPublicPaymentInfo } from "@/lib/server/payment-slips";
import { getPublicLineContact } from "@/lib/server/booking-line";
import { parseChannel } from "@/lib/public-booking/shared";
import { PublicFooter, PublicTopBar } from "../../_components/chrome";
import { BookingStatus } from "./booking-status";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "สถานะการจอง — EasySpace",
  robots: { index: false, follow: false },
};

export default async function PublicBookingStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ t?: string; src?: string }>;
}) {
  const [{ ref }, { t, src }] = await Promise.all([params, searchParams]);
  const channel = parseChannel(src);
  const [view, config, payment] = await Promise.all([
    getPublicBookingView(decodeURIComponent(ref), t ?? ""),
    getPublicRoomConfig(),
    getPublicPaymentInfo(),
  ]);
  const [contact, company] = await Promise.all([getPublicLineContact(config), getCompanyProfile()]);

  return (
    <>
      <PublicTopBar channel={channel} />
      {view ? (
        <BookingStatus
          view={view}
          token={t ?? ""}
          channel={channel}
          payment={payment}
          company={company}
          config={{
            line_url: contact.line_url,
            line_id: contact.line_id,
            line_oa_id: contact.line_oa_id,
            phone: config.phone,
            confirm_message: config.confirm_message,
          }}
        />
      ) : (
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className=" text-[20px] font-bold tracking-tighter">ไม่พบการจอง</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            ลิงก์อาจไม่ครบหรือหมดอายุ กรุณาเปิดจากลิงก์ที่ได้รับหลังจอง
            หรือติดต่อทีมงานพร้อมรหัสการจอง
          </p>
          <Link
            href={`/rooms?src=${channel}`}
            className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-pill bg-ink-1 px-5 text-[14px] font-semibold text-white"
          >
            กลับไปหน้าห้องประชุม
          </Link>
        </div>
      )}
      <PublicFooter lineUrl={contact.line_url} lineId={contact.line_id} phone={config.phone} />
    </>
  );
}
