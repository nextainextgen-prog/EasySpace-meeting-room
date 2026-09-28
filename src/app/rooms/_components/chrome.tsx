import Link from "next/link";

/** Brand mark + wordmark. Links home to the room list, keeping the channel. */
export function PublicTopBar({
  channel,
  right,
}: {
  channel: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/[0.06] bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href={`/rooms?src=${channel}`}
          className="flex items-center gap-2.5 rounded-pill pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
        >
          <span className="leading-none">
            <span className="block text-[17px] font-bold tracking-tighter text-ink-1">
              EasySpace
            </span>
            <span className="mt-0.5 block text-[10.5px] font-medium tracking-tight text-ink-3">
              Meeting Room Booking
            </span>
          </span>
        </Link>
        {right}
      </div>
    </header>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-tight text-ink-2">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      ข้อมูลเรียลไทม์
    </span>
  );
}

export function PublicFooter({
  lineUrl,
  lineId,
  phone,
}: {
  lineUrl: string;
  lineId: string;
  phone: string;
}) {
  return (
    <footer className="mt-14 border-t border-slate-900/[0.06] bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <p className="text-[17px] font-bold tracking-tighter">EasySpace</p>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-2">
            ห้องประชุมพร้อมใช้งาน จองออนไลน์ได้ทันที ทีมงานยืนยันและดูแลทุกการจอง
          </p>
        </div>
        <div className="space-y-2.5 text-[13px]">
          <p className="text-[12px] font-semibold tracking-tight text-ink-3">
            ติดต่อ
          </p>
          <a href={lineUrl} target="_blank" rel="noreferrer" className="block text-ink-1 hover:text-primary-600">
            LINE {lineId}
          </a>
          <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="block text-ink-1 tabular-nums hover:text-primary-600">
            {phone}
          </a>
        </div>
        <div className="space-y-2.5 text-[13px]">
          <p className="text-[12px] font-semibold tracking-tight text-ink-3">
            เวลาให้บริการ
          </p>
          <p className="text-ink-1 tabular-nums">ทุกวัน 08:30 – 22:00 น.</p>
        </div>
      </div>
      <div className="border-t border-slate-900/[0.05] py-4 text-center text-[11px] text-ink-3">
        © {new Date().getFullYear()} EasySpace · ข้อมูลห้องว่างอัปเดตแบบเรียลไทม์
      </div>
    </footer>
  );
}
