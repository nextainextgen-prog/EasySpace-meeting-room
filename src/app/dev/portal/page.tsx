import { notFound } from "next/navigation";
import { AppShell } from "@/app/app/_components/shell";
import { PortalHome } from "@/app/app/_portal/portal-home";
import { addDays, bkkDate, bkkTime, fromBkk } from "@/lib/time/bkk";
import { getOpenHours, listMemberRooms, type OwnBooking } from "@/lib/server/member-ops";
import type { PortalBlock, PortalData } from "@/lib/server/portal-data";

export const dynamic = "force-dynamic";

/**
 * Development only: the member portal with made-up bookings, for checking the
 * layout and taking manual screenshots without signing in as a real person.
 * Rooms are real; every person and meeting here is fictional.
 *   /dev/portal?state=live | next | empty  &at=14:10
 */
export default async function DevPortal({ searchParams }: { searchParams: Promise<{ state?: string; at?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state = "live", at: clock } = await searchParams;
  const [rooms, hours] = await Promise.all([listMemberRooms(), getOpenHours()]);
  // ?at=14:10 pretends it is that time today, so screenshots show a working day.
  const now = clock && /^\d{2}:\d{2}$/.test(clock) ? fromBkk(bkkDate(new Date()), clock) : new Date();
  const today = bkkDate(now);
  const nowHalf = Math.floor(now.getTime() / 1_800_000) * 1_800_000;
  const at = (offsetMin: number) => new Date(nowHalf + offsetMin * 60_000).toISOString();
  const r = (i: number) => rooms[i % rooms.length];

  const mine: OwnBooking[] = [];
  const add = (i: number, s: string, e: string, title: string, ref: string, recurring = false) =>
    mine.push({ id: ref, reference: ref, roomId: r(i).id, roomName: r(i).name, startsAt: s, endsAt: e, title, status: "confirmed", isRecurring: recurring, cancelledReason: null });

  if (state === "live") add(1, at(-30), at(45), "ประชุมทีมขายประจำสัปดาห์", "BK00731", true);
  if (state !== "empty") {
    add(0, at(150), at(210), "สัมภาษณ์ผู้สมัคร UX", "BK00734");
    add(1, fromBkk(addDays(today, 1), "10:00").toISOString(), fromBkk(addDays(today, 1), "11:30").toISOString(), "ประชุมทีมขายประจำสัปดาห์", "BK00735", true);
    add(2, fromBkk(addDays(today, 2), "14:00").toISOString(), fromBkk(addDays(today, 2), "16:00").toISOString(), "Workshop ลูกค้า Q4", "BK00738");
  }

  const others: PortalBlock[] = [
    { id: "o1", roomId: r(0).id, startsAt: at(-90), endsAt: at(0), mine: false, label: "นภัส ศรีสุข · Sprint review" },
    { id: "o2", roomId: r(2).id, startsAt: at(60), endsAt: at(180), mine: false, label: "ไม่ว่าง" },
    { id: "o3", roomId: r(0).id, startsAt: at(240), endsAt: at(300), mine: false, label: "ธนพล วงศ์ดี" },
    { id: "o4", roomId: r(1).id, startsAt: fromBkk(addDays(today, 1), "13:00").toISOString(), endsAt: fromBkk(addDays(today, 1), "15:00").toISOString(), mine: false, label: "ไม่ว่าง" },
  ];
  const blocks: PortalBlock[] = [
    ...others,
    ...mine.map((b) => ({ id: b.id, roomId: b.roomId, startsAt: b.startsAt, endsAt: b.endsAt, mine: true, label: b.title })),
  ];

  const data: PortalData = {
    serverNow: now.toISOString(),
    today,
    me: { name: "สมชาย ใจดี", email: "somchai@example.co.th", position: "Sales Lead", orgName: "บริษัทตัวอย่าง จำกัด", tier: "member" },
    usage: { monthLabel: "พฤศจิกายน 2569", myHours: 6.5, myCount: 5, orgHours: 13.5, quotaHours: 20, unlimited: false, remainingHours: 6.5 },
    hours,
    rooms,
    blocks,
    upcoming: mine.filter((b) => Date.parse(b.endsAt) > now.getTime()),
    past: [
      { id: "p1", reference: "BK00702", roomId: r(1).id, roomName: r(1).name, startsAt: fromBkk(addDays(today, -2), "10:00").toISOString(), endsAt: fromBkk(addDays(today, -2), "11:00").toISOString(), title: "Daily stand-up", status: "completed", isRecurring: false, cancelledReason: null },
    ],
    cancelled: [],
    suggestions: [
      { roomId: r(1).id, roomName: r(1).name, uses: 18, habit: "ใช้ 18 ครั้งใน 4 เดือน · ปกติ 10:00 นาน 1 ชม. 30 นาที", slots: suggestion(today, ["10:00", "10:30"], 90) },
      { roomId: r(0).id, roomName: r(0).name, uses: 7, habit: "ใช้ 7 ครั้งใน 4 เดือน · ปกติ 14:00 นาน 1 ชม.", slots: suggestion(today, ["14:00"], 60) },
    ],
    telegram: { linked: state === "live", botUsername: "EasySpaceBookingBot" },
  };

  return (
    <AppShell profile={{ name: data.me.name, email: data.me.email, avatarUrl: null, orgName: data.me.orgName }}>
      <PortalHome data={data} />
    </AppShell>
  );
}

function suggestion(today: string, starts: string[], minutes: number) {
  return [1, 2, 3].map((d, i) => {
    const date = addDays(today, d);
    const s = fromBkk(date, starts[i % starts.length]);
    const e = new Date(s.getTime() + minutes * 60_000);
    const label = d === 1 ? "พรุ่งนี้" : ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][new Date(s.getTime() + 7 * 3600_000).getUTCDay()] + ` ${Number(date.slice(8))}`;
    return { date, start: bkkTime(s), end: bkkTime(e), label: `${label} ${bkkTime(s)}–${bkkTime(e)}` };
  });
}
