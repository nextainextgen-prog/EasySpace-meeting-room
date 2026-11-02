/**
 * Time-driven messages from the booking bot, sent from templates (no AI):
 *
 *   before  — N minutes before start (member's setting, default 60), with
 *             แก้เวลา / ยกเลิก buttons
 *   start   — at start time
 *   endwarn — N minutes before end (default 10), with ต่อเวลา / จบเลย
 *   end     — at end time
 *   ext     — an outside customer's booking was confirmed for some room
 *
 * `runBotTick` is idempotent: every message is keyed in the store before it
 * goes out, so the Mac worker (every minute) and the GitHub Actions cron
 * (every five) can both call it.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { addDays, bkkDate, bkkTime } from "@/lib/time/bkk";
import { formatHours, getOpenHours, listBlocks, loadMemberCtx, type Block } from "@/lib/server/member-ops";
import { botConfigured, sendPhoto, sendText, type Keyboard } from "./telegram";
import { kvAdd, kvGet, kvPurge, kvSet, listTelegramLinks, type TelegramLink } from "./store";
import { rescueStaleJobs } from "./ai";
import { dayImage, esc, nextFreeAfter, thaiDay } from "./views";

const MIN = 60_000;

export async function runBotTick(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped?: string }> {
  if (!botConfigured() && process.env.TGBOT_DRY_RUN !== "1") return { sent: 0, skipped: "not_configured" };
  // One tick at a time across callers: a key per minute. Tests force past it,
  // since production ticks against the same database every minute.
  const minuteKey = new Date().toISOString().slice(0, 16);
  if (!(await kvAdd(`tgbot:tick:${minuteKey}`, 1)) && !opts.force) return { sent: 0, skipped: "already_ran" };

  const links = await listTelegramLinks();
  let sent = 0;
  sent += await meetingReminders(links);
  sent += await externalAlerts(links);
  await rescueStaleJobs();

  // Housekeeping for keys that only matter for a short while.
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const week = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  await Promise.all([
    kvPurge("tgbot:tick:", day),
    kvPurge("tgbot:seen:", day),
    kvPurge("tgbot:lock:", day),
    kvPurge("tgbot:sent:", week),
  ]);
  return { sent };
}

interface Row {
  id: string;
  reference_code: string;
  room_id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  internal_title: string | null;
  room: { name: string } | null;
}

async function meetingReminders(links: TelegramLink[]): Promise<number> {
  if (links.length === 0) return 0;
  const byMember = new Map(links.map((l) => [l.memberId, l]));
  const maxLead = Math.max(...links.map((l) => l.prefs.remindBeforeMin), 0);
  const now = Date.now();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, reference_code, room_id, member_id, starts_at, ends_at, created_at, internal_title, room:rooms(name)")
    .in("member_id", [...byMember.keys()])
    .in("booking_status", ["confirmed", "in_use", "pending"])
    .lt("starts_at", new Date(now + (maxLead + 5) * MIN).toISOString())
    .gt("ends_at", new Date(now - 20 * MIN).toISOString());
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return 0;

  const today = bkkDate(new Date());
  const [blocks, hours] = await Promise.all([listBlocks(today, addDays(today, 1)), getOpenHours()]);
  let sent = 0;

  for (const b of rows) {
    const link = byMember.get(b.member_id);
    if (!link) continue;
    const p = link.prefs;
    const start = Date.parse(b.starts_at);
    const end = Date.parse(b.ends_at);
    const room = b.room?.name ?? "ห้องประชุม";
    const span = `${bkkTime(b.starts_at)}–${bkkTime(b.ends_at)}`;
    const title = esc(b.internal_title ?? "ประชุม");
    const toStart = (start - now) / MIN;
    const toEnd = (end - now) / MIN;
    const fresh = now - Date.parse(b.created_at) < 3 * MIN;

    // Before start — skipped for something booked a minute ago.
    if (p.remindBeforeMin > 0 && toStart > 0 && toStart <= p.remindBeforeMin && !fresh) {
      if (await once(`before:${b.id}:${start}`)) {
        const left = Math.max(1, Math.round(toStart));
        const text = `⏰ อีก ${left >= 60 && left % 60 === 0 ? `${left / 60} ชั่วโมง` : left >= 60 ? formatHours(left / 60) : `${left} นาที`}ประชุมนะคะ\n\n<b>${esc(room)} · ${span}</b>\n${title}`;
        const kb: Keyboard = [[{ text: "แก้เวลา", data: `bm:${b.id}` }, { text: "ยกเลิก", data: `bc:${b.id}` }]];
        // The day's schedule with this meeting in orange.
        let image: Buffer | null = null;
        try {
          const ctx = await loadMemberCtx(link.memberId);
          image = await dayImage({
            date: bkkDate(b.starts_at),
            viewer: ctx,
            highlightId: b.id,
            highlightLabel: b.internal_title ?? "ประชุมของคุณ",
            highlightLegend: "ประชุมนี้",
            title: "ประชุมที่กำลังจะถึง",
          });
        } catch (e) {
          console.error("[tgbot] reminder image failed", e);
        }
        if (image) await sendPhoto(link.chatId, image, text, kb);
        else await sendText(link.chatId, text, { buttons: kb });
        sent++;
      }
    }

    // Start.
    if (p.startAlert && toStart <= 0 && toStart > -15 && toEnd > 0) {
      if (await once(`start:${b.id}:${start}`)) {
        await sendText(link.chatId, `⏰ ถึงเวลาประชุมแล้วค่ะ\n<b>${esc(room)} · ${span}</b>\n${title}`, {
          buttons: [[{ text: "จบก่อนเวลา คืนห้อง", data: `be:${b.id}` }]],
        });
        sent++;
      }
    }

    // Before end — offer only the extensions that actually fit.
    if (p.endWarnMin > 0 && toStart <= 0 && toEnd > 0 && toEnd <= p.endWarnMin) {
      if (await once(`endwarn:${b.id}:${end}`)) {
        const until = nextFreeAfter(blocks as Block[], b.room_id, b.ends_at, hours.close, bkkDate(b.ends_at), b.id);
        const room_free_min = (Date.parse(`${bkkDate(b.ends_at)}T${until}:00+07:00`) - end) / MIN;
        const kb: Keyboard = [];
        const opts = [15, 30, 60].filter((m) => m <= room_free_min);
        if (opts.length) kb.push(opts.map((m) => ({ text: `ต่อ ${m === 60 ? "1 ชม." : `${m} นาที`}`, data: `bx:${b.id}:${m}` })));
        kb.push([{ text: "จบเลย", data: `be:${b.id}` }]);
        await sendText(
          link.chatId,
          [
            `อีก ${Math.max(1, Math.round(toEnd))} นาทีหมดเวลาห้อง <b>${esc(room)}</b> ค่ะ`,
            opts.length ? `ห้องว่างต่อได้ถึง ${until} น. ต่อเวลาได้นะคะ` : "หลังจากนี้มีคนจองห้องต่อแล้วค่ะ",
          ].join("\n"),
          { buttons: kb },
        );
        sent++;
      }
    }

    // End.
    if (p.endAlert && toEnd <= 0 && toEnd > -15) {
      if (await once(`end:${b.id}:${end}`)) {
        await sendText(link.chatId, `หมดเวลาห้อง <b>${esc(room)}</b> แล้วค่ะ ขอบคุณที่ใช้ห้องนะคะ 🌸`);
        sent++;
      }
    }
  }
  return sent;
}

async function once(key: string) {
  return kvAdd(`tgbot:sent:${key}`, 1);
}

/** Outside customers' bookings, as they become confirmed. Never names the customer. */
async function externalAlerts(links: TelegramLink[]): Promise<number> {
  const cursorKey = "tgbot:meta:ext_cursor";
  const cursor = (await kvGet<string>(cursorKey)) ?? new Date(Date.now() - 10 * MIN).toISOString();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, room_id, starts_at, ends_at, updated_at, room:rooms(name)")
    .eq("source", "external")
    .in("booking_status", ["confirmed", "in_use"])
    .gt("updated_at", cursor)
    .gt("ends_at", new Date().toISOString())
    .order("updated_at")
    .limit(50);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    updated_at: string;
    room: { name: string } | null;
  }>;
  if (rows.length) await kvSet(cursorKey, rows[rows.length - 1].updated_at);
  if (!links.length) return 0;

  let sent = 0;
  for (const r of rows) {
    if (!(await once(`ext:${r.id}`))) continue;
    // Whose own booking sits under it, so they hear about it first-hand.
    const { data: clash } = await admin
      .from("bookings")
      .select("member_id, reference_code")
      .eq("room_id", r.room_id)
      .eq("source", "internal")
      .in("booking_status", ["confirmed", "pending"])
      .lt("starts_at", r.ends_at)
      .gt("ends_at", r.starts_at);
    const affected = new Map(
      ((clash ?? []) as Array<{ member_id: string | null; reference_code: string }>)
        .filter((c) => c.member_id)
        .map((c) => [c.member_id as string, c.reference_code]),
    );
    const head = `มีการจองจากลูกค้าภายนอกค่ะ\n<b>${esc(r.room?.name ?? "ห้องประชุม")} · ${thaiDay(bkkDate(r.starts_at))} · ${bkkTime(r.starts_at)}–${bkkTime(r.ends_at)}</b>`;
    const date = bkkDate(r.starts_at);
    for (const l of links) {
      const ref = affected.get(l.memberId);
      if (!ref && !l.prefs.externalAlerts) continue;
      const caption = ref
        ? `${head}\n\nช่วงนี้ทับการจองของคุณ (<code>${ref}</code>) ทีมงานจะช่วยย้ายห้องให้นะคะ ดูสถานะล่าสุดได้ที่ การจองของฉัน`
        : head;
      // The day's schedule with the new booking in orange: which room, until when.
      let image: Buffer | null = null;
      try {
        const ctx = await loadMemberCtx(l.memberId);
        image = await dayImage({
          date,
          viewer: ctx,
          highlightId: r.id,
          highlightLabel: "ลูกค้าภายนอก (ใหม่)",
          title: "มีการจองใหม่",
        });
      } catch (e) {
        console.error("[tgbot] external alert image failed", e);
      }
      if (image) await sendPhoto(l.chatId, image, caption);
      else await sendText(l.chatId, caption);
      sent++;
    }
  }
  return sent;
}
