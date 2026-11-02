import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Development only: replays the conversation recorded by `npm run test:tgbot`
 * (.e2e-out/chat.json) in a Telegram-like frame, for the manual's pictures.
 * Every bot line is the bot's real output; names, e-mails and other people's
 * meeting titles are swapped for sample ones before display.
 *   /dev/chat?section=link|book|manage|settings|ai|remind
 */
type Line = { who: "user" | "bot"; section: string; text?: string; buttons?: string[][]; image?: string; menu?: boolean; edited?: boolean };

const SAMPLE: Array<[RegExp, string]> = [
  [/Chanvit Soponsuk/g, "สมชาย ใจดี"],
  [/chanvit\.s@thunder\.in\.th/gi, "somchai@example.co.th"],
  [/Thunder Solution/g, "บริษัทตัวอย่าง จำกัด"],
  [/E2E ทดสอบบอท/g, "ประชุมทีมขาย"],
  [/E2E จาก AI/g, "คุยงานลูกค้า"],
  [/E2E เตือนก่อนประชุม/g, "สัมภาษณ์ผู้สมัคร"],
  [/ใช้ชื่อ "[^"]*"/g, "ใช้ชื่อเดิม"],
  // The test member's real hours, replaced with plausible sample numbers.
  [/จองไปแล้ว \d+ ครั้ง รวม [^<\n]+/g, "จองไปแล้ว 5 ครั้ง รวม 6 ชม. 30 นาที"],
  [/บริษัทใช้ไป [\d.]+ ชม\.( \d+ นาที)?/g, "บริษัทใช้ไป 42 ชม."],
  [/เดือนนี้ใช้ไป [\d.]+ ชม\.( \d+ นาที)?/g, "เดือนนี้ใช้ไป 42 ชม."],
  [/คุณใช้ไป [\d.]+ ชม\.( \d+ นาที)?/g, "คุณใช้ไป 6 ชม. 30 นาที"],
  [/คุณจองไป <b>\d+ ครั้ง<\/b> รวม <b>[^<]+<\/b>/g, "คุณจองไป <b>5 ครั้ง</b> รวม <b>6 ชม. 30 นาที</b>"],
  [/ใช้ไป [\d.]+ ชม\.( \d+ นาที)?/g, "ใช้ไป 42 ชม."],
  [/\nถัดไป: [^\n]+/g, "\nถัดไป: MASTER ROOM พรุ่งนี้ 10:00"],
];

const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function clean(s: string) {
  return SAMPLE.reduce((t, [re, to]) => t.replace(re, to), s).replace(
    /^\[กด\] d:(\d{4})-(\d{2})-(\d{2})$/,
    (_, _y, m, d) => `[กด] ${Number(d)} ${THAI_MONTH[Number(m) - 1]}`,
  );
}

export default async function DevChat({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { section = "book" } = await searchParams;
  const dir = path.join(process.cwd(), ".e2e-out");
  const file = path.join(dir, "chat.json");
  if (!fs.existsSync(file)) return <p className="p-8">run npm run test:tgbot first</p>;
  let lines = (JSON.parse(fs.readFileSync(file, "utf8")) as Line[]).filter((l) => l.section === section);
  // The test taps "ยืนยัน" a second time on purpose (double-booking check); not part of the story.
  const expired = lines.findIndex((l) => l.text?.includes("รายการนี้หมดอายุ"));
  if (expired > 0) lines = lines.filter((_, i) => i !== expired && i !== expired - 1);
  // The bookings list shows real meetings; keep the header and the test booking only.
  if (section === "manage") {
    lines = lines.filter((l) => l.who === "user" || !/<code>BK\d+<\/code>/.test(l.text ?? "") || /E2E/.test(l.text ?? ""));
    lines = lines.map((l) => (l.text?.startsWith("มี ") && l.who === "bot" ? { ...l, text: "มี 3 รายการที่กำลังจะมาถึงค่ะ" } : l));
  }
  const img = (name: string, text = "") => {
    if (name.startsWith("http")) return name;
    // The real summary card names the test member; show the sample card instead.
    const file = text.includes("จองแล้ว") && fs.existsSync(path.join(dir, "sample-summary.png")) ? "sample-summary.png" : name;
    return `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`;
  };
  const hasMenu = lines.some((l) => l.menu);

  return (
    <div className="min-h-screen bg-[#dfe7ec] py-6 flex justify-center">
      <div className="w-[430px] rounded-[28px] overflow-hidden bg-[#c9d9c5] shadow-pop" data-tour="phone">
        <div className="bg-[#517da2] text-white px-4 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/easyspace-bot.png" alt="" className="w-10 h-10 rounded-full" />
          <div>
            <p className="font-semibold leading-5">EasySpace ห้องประชุม</p>
            <p className="text-xs text-white/75">bot · @EasySpaceBookingBot</p>
          </div>
        </div>
        <div className="px-3 py-4 space-y-2 bg-[linear-gradient(180deg,#d7e5c9,#c4d8bd)]">
          {lines.map((l, i) =>
            l.who === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#effdde] px-3 py-2 text-[15px] text-ink-1 shadow-sm">
                  {clean(l.text ?? "").replace(/^\[กด\] /, "")}
                  {l.text?.startsWith("[กด]") && <span className="block text-[11px] text-emerald-700/80 mt-0.5">กดปุ่ม</span>}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start max-w-[88%]">
                <div className="rounded-2xl rounded-bl-md bg-white shadow-sm overflow-hidden">
                  {l.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(l.image, l.text)} alt="" className="block w-full max-w-[360px]" />
                  )}
                  {l.text && (
                    <div
                      className="px-3 py-2 text-[15px] leading-[1.45] text-ink-1 whitespace-pre-wrap [&_b]:font-semibold [&_code]:font-mono [&_code]:text-[13px] [&_i]:italic"
                      dangerouslySetInnerHTML={{ __html: clean(l.text) }}
                    />
                  )}
                  {l.edited && <p className="px-3 pb-1.5 -mt-1 text-[11px] text-ink-3">แก้ไขข้อความเดิม</p>}
                </div>
                {l.buttons && (
                  <div className="mt-1 w-full space-y-1">
                    {l.buttons.map((row, r) => (
                      <div key={r} className="flex gap-1">
                        {row.map((b, j) => (
                          <span key={j} className="flex-1 text-center rounded-lg bg-[#5e7d6a]/35 text-white text-[13px] font-medium px-2 py-1.5 truncate">
                            {clean(b)}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
        {hasMenu && (
          <div className="bg-[#f1f1f1] p-2 grid grid-cols-2 gap-1.5 text-[14px]">
            {["จองห้อง", "ห้องว่างวันนี้", "การจองของฉัน", "สรุปการใช้งาน", "ตั้งค่าแจ้งเตือน"].map((m) => (
              <span key={m} className="rounded-lg bg-white text-center py-2 shadow-sm last:col-span-2">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
