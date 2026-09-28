import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
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

  const rooms = await listPublicRooms();
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-600">
          EasySpace Meeting Rooms
        </p>
        <h1 className="mt-2 max-w-xl text-[30px] font-bold leading-[1.1] tracking-tightest sm:text-[44px]">
          ห้องประชุมพร้อมใช้
          <br className="hidden sm:block" /> จองออนไลน์ได้ในหนึ่งนาที
        </h1>
        <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-ink-2">
          เช็กเวลาว่างแบบเรียลไทม์ เลือกห้องและเวลาที่ต้องการ แล้วกดจองได้ทันที
          ทีมงานจะติดต่อยืนยันทุกการจอง
        </p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
          <Trust icon={Radio}>ห้องว่างจริง อัปเดตสด</Trust>
          <Trust icon={ShieldCheck}>ยังไม่ต้องชำระตอนจอง</Trust>
          <Trust icon={BadgeCheck}>ยืนยันโดยทีมงาน</Trust>
        </div>
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
                  {room.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={room.thumbnail_url}
                      alt={room.name}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-white/60">
                      <Building2 size={44} strokeWidth={1.25} />
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur",
                      status.tone === "free" && "text-emerald-700",
                      status.tone === "busy" && "text-amber-700",
                      status.tone === "closed" && "text-ink-2",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status.tone === "free" && "bg-emerald-500",
                        status.tone === "busy" && "bg-amber-500",
                        status.tone === "closed" && "bg-slate-400",
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
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Users size={15} strokeWidth={1.75} className="text-ink-3" />
                        {room.capacity_min ?? 1}–{room.capacity_max} ท่าน
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="font-medium tabular-nums text-emerald-700">
                      {free > 0 ? `วันนี้ว่าง ${durationLabel(free)}` : "วันนี้เต็มแล้ว"}
                    </span>
                  </div>

                  <DayBar busy={blocks} date={today} now={now} />

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[12px] text-ink-3">{status.sub}</span>
                    <span className="inline-flex h-9 items-center gap-1 rounded-pill bg-ink-1 px-4 text-[13px] font-semibold text-white transition group-hover:bg-primary-600">
                      เลือกเวลา <ArrowRight size={14} strokeWidth={2} />
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

function Trust({
  icon: Icon,
  children,
}: {
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={16} strokeWidth={1.75} className="text-primary-600" />
      {children}
    </span>
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
      <div className="relative h-2 overflow-hidden rounded-full bg-emerald-100">
        {nowT > open && (
          <span
            className="absolute inset-y-0 left-0 bg-slate-200"
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
              className="absolute inset-y-0 bg-slate-400/80"
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
