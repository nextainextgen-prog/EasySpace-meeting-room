import Link from "next/link";
import {
  AirVent,
  Car,
  Coffee,
  LayoutGrid,
  Mic,
  MonitorSpeaker,
  Plug,
  Projector,
  Sparkles,
  Speaker,
  Tv,
  Wifi,
  ShowerHead,
  Phone,
  MessageCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[10px]" />
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-tighter text-ink-1">
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
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-emerald-600/15 bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold tracking-tight text-emerald-700">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      อัปเดตสด
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
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7 rounded-[9px]" />
            <span className="text-[15px] font-bold tracking-tighter">EasySpace</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-2">
            ห้องประชุมพร้อมใช้งาน จองออนไลน์ได้ทันที ทีมงานยืนยันและดูแลทุกการจอง
          </p>
        </div>
        <div className="space-y-2.5 text-[13px]">
          <p className="text-[12px] font-semibold tracking-tight text-ink-3">
            ติดต่อ
          </p>
          <a
            href={lineUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-ink-1 hover:text-primary-600"
          >
            <MessageCircle size={16} strokeWidth={1.75} className="text-[#06C755]" />
            LINE {lineId}
          </a>
          <a
            href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
            className="flex items-center gap-2 text-ink-1 hover:text-primary-600"
          >
            <Phone size={16} strokeWidth={1.75} className="text-ink-3" />
            {phone}
          </a>
        </div>
        <div className="space-y-2.5 text-[13px]">
          <p className="text-[12px] font-semibold tracking-tight text-ink-3">
            เวลาให้บริการ
          </p>
          <p className="flex items-center gap-2 text-ink-1">
            <Clock size={16} strokeWidth={1.75} className="text-ink-3" />
            ทุกวัน 08:30 – 22:00 น.
          </p>
        </div>
      </div>
      <div className="border-t border-slate-900/[0.05] py-4 text-center text-[11px] text-ink-3">
        © {new Date().getFullYear()} EasySpace · ข้อมูลห้องว่างอัปเดตแบบเรียลไทม์
      </div>
    </footer>
  );
}

const AMENITY_RULES: Array<[RegExp, LucideIcon]> = [
  [/wi-?fi|อินเทอร์เน็ต|internet/i, Wifi],
  [/โปรเจ|projector/i, Projector],
  [/ไมโครโฟน|ไมค์|mic/i, Mic],
  [/เครื่องเสียง|ลำโพง|speaker|sound/i, Speaker],
  [/จอ|tv|ทีวี|โทรทัศน์|display/i, Tv],
  [/ปลั๊ก|plug|power/i, Plug],
  [/แอร์|air/i, AirVent],
  [/กาแฟ|coffee|pantry|อาหาร|เครื่องดื่ม/i, Coffee],
  [/ที่จอดรถ|parking|จอดรถ/i, Car],
  [/ห้องน้ำ|restroom/i, ShowerHead],
  [/ไวท์บอร์ด|whiteboard|board/i, LayoutGrid],
  [/conference|vdo|video|zoom/i, MonitorSpeaker],
];

export function amenityIcon(label: string): LucideIcon {
  for (const [re, icon] of AMENITY_RULES) if (re.test(label)) return icon;
  return Sparkles;
}
