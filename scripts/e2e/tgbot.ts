/**
 * End-to-end run of the Telegram booking bot against the real database.
 *
 * Telegram is never called: the bot client records every outgoing message
 * (startRecording), and updates are fed straight into handleUpdate as if
 * Telegram had posted them. E-mail, Google Calendar and the staff Telegram
 * group are stubbed (tsconfig.e2e-bot.json).
 *
 * Bookings land in a free evening slot three weeks out and are deleted in the
 * finally block, together with every bot store row the run created.
 *
 *   npm run test:tgbot
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { handleUpdate, type TgUpdate } from "@/lib/tgbot/flows";
import { startRecording, type Outgoing } from "@/lib/tgbot/telegram";
import { claimJob, executeAiResult } from "@/lib/tgbot/ai";
import { runBotTick } from "@/lib/tgbot/notify";
import { getTelegramLink, kvDel } from "@/lib/tgbot/store";
import { addDays, bkkDate, bkkParts, bkkTime, fromBkk } from "@/lib/time/bkk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const MEMBER_EMAIL = "chanvit.s@thunder.in.th";
const TG = 990000001; // a Telegram user id no real person has
const OUT = process.env.TGBOT_E2E_OUT ?? path.join(process.cwd(), ".e2e-out");

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}   ${extra}`));

let updateId = Math.floor(Date.now() / 1000);
const log = startRecording();
const created = new Set<string>();

function texts(from = 0) {
  return log.slice(from).map((o) => String(o.payload.text ?? o.payload.caption ?? ""));
}
function buttons(o: Outgoing): Array<{ text: string; callback_data?: string }> {
  const rm = o.payload.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } | undefined;
  return rm?.inline_keyboard?.flat() ?? [];
}
function lastWithButton(prefix: string) {
  for (let i = log.length - 1; i >= 0; i--) {
    const b = buttons(log[i]).find((x) => x.callback_data?.startsWith(prefix));
    if (b) return { msg: log[i], button: b };
  }
  return null;
}

/** The conversation as a member would see it, for the manual's chat pictures. */
type ChatLine = { who: "user" | "bot"; section: string; text?: string; buttons?: string[][]; image?: string; menu?: boolean; edited?: boolean };
const chat: ChatLine[] = [];
let section = "start";
let imageNo = 0;

function record(from: number) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const o of log.slice(from)) {
    if (!["sendMessage", "sendPhoto", "editMessageText"].includes(o.method)) continue;
    const rm = o.payload.reply_markup as
      | { inline_keyboard?: Array<Array<{ text: string }>>; keyboard?: unknown }
      | undefined;
    let image: string | undefined;
    if (o.method === "sendPhoto") {
      if (o.photo) {
        image = `chat-${++imageNo}.png`;
        fs.writeFileSync(path.join(OUT, image), o.photo);
      } else image = String(o.payload.photo);
    }
    chat.push({
      who: "bot",
      section,
      text: String(o.payload.text ?? o.payload.caption ?? ""),
      buttons: rm?.inline_keyboard?.map((row) => row.map((b) => b.text)),
      image,
      menu: !!rm?.keyboard,
      edited: o.method === "editMessageText",
    });
  }
}

async function say(text: string) {
  chat.push({ who: "user", section, text });
  const from = log.length;
  await handleUpdate({
    update_id: ++updateId,
    message: { message_id: updateId, chat: { id: TG, type: "private" }, from: { id: TG, first_name: "E2E" }, text },
  } as TgUpdate);
  record(from);
  return from;
}
async function tap(data: string, messageId = 1) {
  const label = [...log].reverse().flatMap((o) => buttons(o)).find((b) => b.callback_data === data)?.text;
  chat.push({ who: "user", section, text: label ? `[กด] ${label}` : `[กด] ${data}` });
  const from = log.length;
  await handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      from: { id: TG, first_name: "E2E" },
      data,
      message: { message_id: messageId, chat: { id: TG, type: "private" } },
    },
  } as TgUpdate);
  record(from);
  return from;
}
function savePhotos(from: number, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const o of log.slice(from)) {
    if (o.method === "sendPhoto" && o.photo) {
      fs.writeFileSync(path.join(OUT, `${name}${n ? `-${n}` : ""}.png`), o.photo);
      n++;
    }
  }
  return n;
}

/** A free one-hour evening slot three weeks out, on a weekday, in any room. */
async function findSlot() {
  const { data: rooms } = await sb.from("rooms").select("id, name").eq("status", "active").order("display_order");
  for (let off = 21; off < 35; off++) {
    const date = addDays(bkkDate(new Date()), off);
    if (bkkParts(fromBkk(date, "12:00")).weekday >= 6) continue;
    for (const r of (rooms ?? []) as Array<{ id: string; name: string }>) {
      const s = fromBkk(date, "20:00").toISOString();
      const e = fromBkk(date, "21:30").toISOString();
      const { data } = await sb
        .from("bookings")
        .select("id")
        .eq("room_id", r.id)
        .in("booking_status", ["pending", "confirmed", "in_use"])
        .lt("starts_at", e)
        .gt("ends_at", s);
      if (!data?.length) return { date, room: r };
    }
  }
  throw new Error("no free evening slot found");
}

async function main() {
  const { data: member } = await sb.from("members").select("id").ilike("email", MEMBER_EMAIL).single();
  const memberId = (member as { id: string }).id;
  const existing = await getTelegramLink({ memberId });
  if (existing && existing.tgUserId !== String(TG)) {
    throw new Error("the test member already has a real Telegram link — refusing to replace it");
  }

  console.log("linking");
  section = "link";
  let from = await say("/start");
  ok("start asks for e-mail", texts(from).some((t) => t.includes("อีเมล")));
  const clip = log.slice(from).findIndex((o) => o.method === "sendVideo");
  ok("start sends the how-to clip first", clip === 0 && String(log[from].payload.video).endsWith("/tgbot/how-to-book.mp4"));
  from = await say("nobody@nowhere.example");
  ok("unknown e-mail is refused", texts(from).some((t) => t.includes("หาอีเมล")));
  from = await say(MEMBER_EMAIL.toUpperCase());
  ok("known e-mail links", texts(from).some((t) => t.includes("เชื่อมต่อบัญชีเรียบร้อย")));
  ok("link shows company and quota", texts(from).some((t) => t.includes("บริษัท") && t.includes("โควตา")));
  ok("link is stored", (await getTelegramLink({ tgUserId: String(TG) }))?.memberId === memberId);

  console.log("booking with buttons");
  section = "book";
  from = await say("จองห้อง");
  ok("week picture sent", log.slice(from).some((o) => o.method === "sendPhoto" && !!o.photo));
  savePhotos(from, "week");
  const slot = await findSlot();
  from = await tap(`d:${slot.date}`);
  ok("room cards with a select button", !!lastWithButton(`r:${slot.room.id}`));
  from = await tap(`r:${slot.room.id}`);
  ok("start times offered", !!lastWithButton("s:20:00"));
  from = await tap("s:20:00");
  ok("end times offered", !!lastWithButton("e:21:30"));
  from = await tap("e:21:30");
  ok("asks for a title, mentions repeating", texts(from).some((t) => t.includes("ตั้งชื่อ") && t.includes("ซ้ำ")));
  from = await say("E2E ทดสอบบอท");
  ok("confirm card", texts(from).some((t) => t.includes("สรุปก่อนจอง") && t.includes("20:00–21:30")));
  from = await tap("ok");
  ok("summary photo with caption", log.slice(from).some((o) => o.method === "sendPhoto" && String(o.payload.caption).includes("จองแล้ว")));
  savePhotos(from, "summary");
  const { data: booked } = await sb
    .from("bookings")
    .select("id, starts_at, ends_at, booking_status, notes")
    .eq("member_id", memberId)
    .eq("internal_title", "E2E ทดสอบบอท")
    .eq("booking_status", "confirmed");
  const b = ((booked ?? []) as Array<{ id: string; starts_at: string; ends_at: string; notes: string | null }>)[0];
  if (b) created.add(b.id);
  ok("booking row written", !!b && bkkTime(b.starts_at) === "20:00" && bkkTime(b.ends_at) === "21:30");
  ok("marked as booked through Telegram", b?.notes === "จองผ่าน Telegram");

  from = await tap("ok");
  const { count: dup } = await sb
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("internal_title", "E2E ทดสอบบอท")
    .neq("booking_status", "cancelled");
  ok("second tap on confirm books nothing", dup === 1, `count=${dup}`);

  console.log("my bookings, move, cancel");
  section = "manage";
  from = await say("การจองของฉัน");
  ok("listed with buttons", !!lastWithButton(`bm:${b.id}`));
  await tap(`bm:${b.id}`);
  await tap(`d:${slot.date}`);
  ok("move: start picker", !!lastWithButton("s:19:00") || !!lastWithButton("s:20:30"));
  await tap("s:20:30");
  await tap("e:21:30");
  from = await tap("ok");
  const { data: moved } = await sb.from("bookings").select("starts_at, ends_at").eq("id", b.id).single();
  ok("moved to 20:30–21:30", bkkTime((moved as { starts_at: string }).starts_at) === "20:30", texts(from).join(" | "));

  await tap(`bc:${b.id}`);
  from = await tap(`bcy:${b.id}`);
  const { data: cancelled } = await sb.from("bookings").select("booking_status").eq("id", b.id).single();
  ok("cancelled", (cancelled as { booking_status: string }).booking_status === "cancelled", texts(from).join(" | "));

  console.log("settings");
  section = "settings";
  await say("ตั้งค่าแจ้งเตือน");
  await tap("pf:rb");
  ok("reminder lead cycles 60 → 120", (await getTelegramLink({ tgUserId: String(TG) }))?.prefs.remindBeforeMin === 120);
  await tap("pf:rb");
  await tap("pf:rb");
  await tap("pf:rb");
  await tap("pf:rb");
  ok("and back to 60", (await getTelegramLink({ tgUserId: String(TG) }))?.prefs.remindBeforeMin === 60);

  console.log("usage");
  section = "usage";
  from = await say("สรุปการใช้งาน");
  ok("usage summary sent", texts(from).some((t) => t.includes("สรุปเดือน")));

  console.log("free text → AI queue → action");
  section = "ai";
  // The worker's answer is simulated below; the sentence matches it so the manual's picture reads true.
  const sentence = `ขอห้อง ${slot.room.name.replace(/ ROOM$/, "").toLowerCase()} วันที่ ${Number(slot.date.slice(8))} สองทุ่มถึงสามทุ่ม คุยงานลูกค้า`;
  from = await say(sentence);
  const job = await claimJob();
  ok("typed text is queued for the worker", job?.text === sentence);
  ok("queue carries rooms and my bookings", !!job && job.context.rooms.length > 0 && Array.isArray(job.context.myBookings));
  if (job) {
    from = log.length;
    chat.push({ who: "bot", section, text: "(AI บนเครื่อง Mac อ่านข้อความ แล้วส่งคำตอบกลับ)" });
    await executeAiResult(job, {
      reply: "ได้ค่ะ ห้องนี้ช่วงนั้นว่าง ยืนยันอีกทีนะคะ",
      action: "book",
      date: slot.date,
      start: "20:00",
      end: "21:00",
      room: slot.room.name,
      title: "E2E จาก AI",
    });
    record(from);
    ok("AI booking ends at the confirm card", texts(from).some((t) => t.includes("สรุปก่อนจอง") && t.includes("E2E จาก AI")));
    ok("AI never books by itself", !(await sb.from("bookings").select("id").eq("internal_title", "E2E จาก AI")).data?.length);
  }

  console.log("reminders");
  section = "remind";
  const { data: free } = await sb.from("rooms").select("id").eq("status", "active").order("display_order");
  // 40 minutes out, inside the default 60-minute reminder window.
  const startAt = new Date(Math.ceil((Date.now() + 40 * 60_000) / 60_000) * 60_000);
  let fixture: string | null = null;
  for (const r of (free ?? []) as Array<{ id: string }>) {
    const endAt = new Date(startAt.getTime() + 30 * 60_000);
    const { data: busy } = await sb
      .from("bookings")
      .select("id")
      .eq("room_id", r.id)
      .in("booking_status", ["pending", "confirmed", "in_use"])
      .lt("starts_at", endAt.toISOString())
      .gt("ends_at", startAt.toISOString());
    if (busy?.length) continue;
    const { data: row } = await sb
      .from("bookings")
      .insert({
        reference_code: `E2E-TG-${Date.now()}`,
        source: "internal",
        member_id: memberId,
        org_id: (await sb.from("member_organizations").select("org_id").eq("member_id", memberId).limit(1).single()).data!.org_id,
        room_id: r.id,
        starts_at: startAt.toISOString(),
        ends_at: endAt.toISOString(),
        base_amount: 0, addons_amount: 0, discount_amount: 0, total_amount: 0, deposit_amount: 0, paid_amount: 0,
        payment_status: "free",
        booking_status: "confirmed",
        internal_title: "E2E เตือนก่อนประชุม",
        is_public: false,
        created_at: new Date(Date.now() - 3600_000).toISOString(),
      } as never)
      .select("id")
      .single();
    fixture = (row as { id: string }).id;
    created.add(fixture);
    break;
  }
  if (fixture) {
    from = log.length;
    await runBotTick({ force: true });
    record(from);
    const reminder = log.slice(from).find((o) => String(o.payload.text ?? o.payload.caption).includes("E2E เตือนก่อนประชุม"));
    ok("reminder before start, with edit and cancel", !!reminder && buttons(reminder).some((x) => x.callback_data === `bm:${fixture}`));
    ok("reminder carries the day's schedule picture", reminder?.method === "sendPhoto" && !!reminder.photo);
    if (reminder?.photo) fs.writeFileSync(path.join(OUT, "reminder.png"), reminder.photo);
    from = log.length;
    await runBotTick({ force: true });
    ok("not sent twice", !log.slice(from).some((o) => String(o.payload.text ?? o.payload.caption).includes("E2E เตือนก่อนประชุม")));
  } else {
    console.log("  skip reminder check: no room free in 40 minutes");
  }

  console.log("unlink");
  section = "unlink";
  await tap("unlink!");
  ok("unlinked", !(await getTelegramLink({ tgUserId: String(TG) })));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "chat.json"), JSON.stringify(chat, null, 2));
  fs.writeFileSync(
    path.join(OUT, "transcript.json"),
    JSON.stringify(
      log.map((o) => ({ method: o.method, text: o.payload.text ?? o.payload.caption, buttons: buttons(o).map((x) => x.text), photo: !!o.photo })),
      null,
      2,
    ),
  );
}

async function cleanup() {
  const ids = [...created];
  const { data: extra } = await sb
    .from("bookings")
    .select("id")
    .in("internal_title", ["E2E ทดสอบบอท", "E2E จาก AI", "E2E เตือนก่อนประชุม"]);
  for (const r of (extra ?? []) as Array<{ id: string }>) ids.push(r.id);
  if (ids.length) {
    await sb.from("booking_audit_log").delete().in("booking_id", ids);
    await sb.from("notifications").delete().in("related_id", ids);
    await sb.from("bookings").delete().in("id", ids);
  }
  // Bot store rows this run created.
  await sb.from("app_secrets").delete().like("key", `tgbot:%:${TG}`);
  await sb.from("app_secrets").delete().like("key", `tgbot:lock:${TG}:%`);
  await sb.from("app_secrets").delete().like("key", "tgbot:q:%");
  for (const id of ids) await sb.from("app_secrets").delete().like("key", `tgbot:sent:%${id}%`);
  const { data: m } = await sb.from("members").select("id").ilike("email", MEMBER_EMAIL).single();
  const current = await getTelegramLink({ memberId: (m as { id: string }).id });
  if (!current || current.tgUserId === String(TG)) await kvDel(`tgbot:member:${(m as { id: string }).id}`);
}

main()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n${pass} passed, ${fail} failed · images in ${OUT}`);
    process.exit(fail ? 1 : 0);
  });
