import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  bkkToday,
  getPublicRoomConfig,
  listPublicBusy,
  listPublicRooms,
  slugForRoom,
} from "@/lib/data/public-rooms";
import { fromBkk } from "@/lib/time/bkk";
import {
  PUBLIC_CLOSE_TIME,
  PUBLIC_OPEN_TIME,
  durationLabel,
  formatBahtPlain,
  freeMinutesOn,
  parseChannel,
  publicRoomStatus,
  type PublicBusyBlock,
} from "@/lib/public-booking/shared";
import { LiveBadge, PublicFooter, PublicTopBar } from "./_components/chrome";
import { getPublicPaymentInfo } from "@/lib/server/payment-slips";
import { MyBookingsStrip } from "./_components/my-bookings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "จองห้องประชุม — EasySpace",
};

/**
 * Room list — the LINE OA rich-menu entry point (`/rooms?src=line`).
 * QR codes on each door go straight to `/rooms/<slug>` instead.
 */
export default async function PublicRoomsIndex({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const { src } = await searchParams;
  const channel = parseChannel(src ?? "web");
  const config = await getPublicRoomConfig();
  if (!config.enabled) return notFound();

  const [rooms, payment] = await Promise.all([listPublicRooms(), getPublicPaymentInfo()]);
  const today = bkkToday();
  const busy = await listPublicBusy({
    roomIds: rooms.map((r) => r.id),
    fromDate: today,
    days: 1,
    includeInternal: !config.allow_override_internal,
  });
  const now = new Date();

  return (
    <>
      <PublicTopBar channel={channel} right={<LiveBadge />} />

      <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <p className="text-[12px] font-medium tracking-tight text-ink-3">EasySpace · Meeting Rooms</p>
        <h1 className="mt-2 max-w-xl text-[30px] font-bold leading-[1.1] tracking-tightest sm:text-[44px]">
          ห้องประชุมพร้อมใช้
          <br className="hidden sm:block" /> จองออนไลน์ได้ในหนึ่งนาที
        </h1>
        <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-ink-2">
          เช็กเวลาว่างแบบเรียลไทม์ เลือกห้องและเวลาที่ต้องการ แล้วกดจองได้ทันที
          {payment.ready
            ? " ชำระเงินและแนบสลิป ระบบยืนยันการจองให้อัตโนมัติ"
            : " ทีมงานจะติดต่อยืนยันทุกการจอง"}
        </p>
        <p className="mt-4 text-[13px] font-medium text-ink-3">
          {[
            "ห้องว่างจริง อัปเดตสด",
            payment.ready ? "ชำระออนไลน์ ตรวจสลิปอัตโนมัติ" : "ยังไม่ต้องชำระตอนจอง",
            payment.ready ? "ยืนยันการจองทันที" : "ยืนยันโดยทีมงาน",
          ].join("  ·  ")}
        </p>
      </section>

      <MyBookingsStrip channel={channel} />

      <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[18px] font-bold tracking-tighter">เลือกห้องประชุม</h2>
          <p className="text-[12px] text-ink-3">{rooms.length} ห้อง · เปิด 08:30–22:00</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const blocks = busy.get(room.id) ?? [];
            const status = publicRoomStatus(blocks, now);
            const free = freeMinutesOn(today, blocks, now);
            const slug = slugForRoom(config, room);
            return (
              <Link
                key={room.id}
                href={`/rooms/${slug}?src=${channel}`}
                className="group overflow-hidden rounded-card-lg border border-slate-900/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.25)]"
              >
                <div
                  className="relative aspect-[16/10] overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}B3)` }}
                >
                  {room.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={room.thumbnail_url}
                      alt={room.name}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                    />
                  )}
                  <span
                    className={cn(
                      "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-1",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status.tone === "free" ? "bg-emerald-500" : "bg-slate-400",
                      )}
                    />
                    {status.label}
                  </span>
                </div>

                <div className="p-4">
                  <div className="mb-2.5 flex items-baseline justify-between gap-2">
                    <p className="truncate text-[19px] font-bold tracking-tighter">{room.name}</p>
                    {config.show_hourly_rate && (
                      <p className="shrink-0 text-[14px] font-bold tabular-nums">
                        ฿{formatBahtPlain(room.hourly_rate)}
                        <span className="font-medium text-ink-3">/ชม.</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-ink-2">
                    {config.show_capacity && room.capacity_max ? (
                      <span className="tabular-nums">รองรับ {room.capacity_min ?? 1}–{room.capacity_max} ท่าน</span>
                    ) : (
                      <span />
                    )}
                    <span className="font-medium tabular-nums text-ink-1">
                      {free > 0 ? `วันนี้ว่าง ${durationLabel(free)}` : "วันนี้เต็มแล้ว"}
                    </span>
                  </div>

                  <DayBar busy={blocks} date={today} now={now} />

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[12px] text-ink-3">{status.sub}</span>
                    <span className="inline-flex h-9 items-center rounded-pill bg-ink-1 px-4 text-[13px] font-semibold text-white transition group-hover:bg-slate-800">
                      เลือกเวลา
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <PublicFooter lineUrl={config.line_url} lineId={config.line_id} phone={config.phone} />
    </>
  );
}

/** Today at a glance: 08:30 → 22:00, busy stretches shaded, past dimmed. */
function DayBar({
  busy,
  date,
  now,
}: {
  busy: PublicBusyBlock[];
  date: string;
  now: Date;
}) {
  const open = fromBkk(date, PUBLIC_OPEN_TIME).getTime();
  const close = fromBkk(date, PUBLIC_CLOSE_TIME).getTime();
  const span = close - open;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - open) / span) * 100))}%`;
  const nowT = now.getTime();

  return (
    <div className="mt-3">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-100">
        {nowT > open && (
          <span
            className="absolute inset-y-0 left-0 bg-slate-200/70"
            style={{ width: pct(Math.min(nowT, close)) }}
          />
        )}
        {busy.map((b, i) => {
          const s = Math.max(open, new Date(b.startsAt).getTime());
          const e = Math.min(close, new Date(b.endsAt).getTime());
          if (e <= s) return null;
          return (
            <span
              key={i}
              className="absolute inset-y-0 bg-ink-1/70"
              style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }}
            />
          );
        })}
        {nowT > open && nowT < close && (
          <span className="absolute inset-y-[-2px] w-0.5 rounded bg-ink-1" style={{ left: pct(nowT) }} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-3">
        <span>{PUBLIC_OPEN_TIME}</span>
        <span>{PUBLIC_CLOSE_TIME}</span>
      </div>
    </div>
  );
}
