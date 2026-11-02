#!/usr/bin/env node
/**
 * น้องจอง's brain — runs on the office Mac, under the Claude account signed in
 * there (Claude Code, `claude -p`). No API key involved.
 *
 *   1. Every second: claim the oldest typed message the bot queued
 *      (app_secrets rows `tgbot:q:*`, claimed by deleting them).
 *   2. Ask Claude what the member meant. The system prompt is built from the
 *      skills in ./.claude/skills (voice, brain, humanizer), loaded every time.
 *   3. POST Claude's JSON to the app, which shows cards and buttons; every
 *      change still needs the member's tap on "ยืนยัน".
 *   4. Every minute: ping /api/tgbot/tick so reminders go out on time.
 *
 * Config comes from ../.env.local (or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TGBOT_WORKER_KEY
 *   TGBOT_APP_URL   (default: production)
 *   TGBOT_MODEL     (default: sonnet)    TGBOT_EFFORT (default: low)
 *
 *   node bot-worker/worker.mjs           run
 *   node bot-worker/worker.mjs --once "พรุ่งนี้บ่ายสอง ห้อง master"   try one sentence, print JSON
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(HERE, "..", ".env.local"));
loadEnv(path.join(HERE, ".env"));

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_KEY = process.env.TGBOT_WORKER_KEY;
const APP = (process.env.TGBOT_APP_URL ?? "https://easy-space-meeting-room-yjqk.vercel.app").replace(/\/$/, "");
const MODEL = process.env.TGBOT_MODEL ?? "sonnet";
const EFFORT = process.env.TGBOT_EFFORT ?? "low";
const CLAUDE = process.env.CLAUDE_BIN ?? "claude";

const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "schema.json"), "utf8"));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

// ─── Skills → system prompt ────────────────────────────────────────────────

function skillBody(name) {
  const raw = fs.readFileSync(path.join(HERE, ".claude", "skills", name, "SKILL.md"), "utf8");
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

function systemPrompt() {
  return [
    "# บทบาท",
    "คุณคือน้องจอง ผู้ช่วยจองห้องประชุม EasySpace บน Telegram ทำตามสกิลด้านล่างทุกข้อ",
    "ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น",
    "",
    "# สกิล: nong-jong-brain (วิธีคิด)",
    skillBody("nong-jong-brain"),
    "",
    "# สกิล: nong-jong-voice (วิธีตอบ) — ใช้กับช่อง reply",
    skillBody("nong-jong-voice"),
    "",
    "# สกิล: humanizer (ตัดสำนวนที่ฟังเหมือน AI)",
    "สกิลนี้เขียนสำหรับภาษาอังกฤษ ใช้หลักการเดียวกันกับภาษาไทยในช่อง reply ถ้าขัดกับ nong-jong-voice ให้ยึด nong-jong-voice",
    skillBody("humanizer"),
  ].join("\n");
}

const SYSTEM_FILE = path.join(HERE, ".runtime", "system.md");
fs.mkdirSync(path.dirname(SYSTEM_FILE), { recursive: true });
fs.writeFileSync(SYSTEM_FILE, systemPrompt());

// ─── Claude ────────────────────────────────────────────────────────────────

function askClaude(context, message) {
  const prompt = [
    "context:",
    "```json",
    JSON.stringify(context, null, 1),
    "```",
    "",
    "message:",
    message,
  ].join("\n");
  const args = [
    "-p",
    "--model", MODEL,
    "--effort", EFFORT,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "project",
    "--no-session-persistence",
    "--system-prompt-file", SYSTEM_FILE,
    "--output-format", "json",
    "--json-schema", JSON.stringify(SCHEMA),
  ];
  return new Promise((resolve) => {
    const child = spawn(CLAUDE, args, { cwd: HERE, env: process.env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out);
        if (parsed.is_error || !parsed.structured_output) {
          log("claude error", parsed.subtype, (parsed.result ?? err).slice(0, 300));
          return resolve(null);
        }
        resolve(parsed.structured_output);
      } catch {
        log("claude output unreadable", err.slice(0, 300) || out.slice(0, 300));
        resolve(null);
      }
    });
    child.stdin.end(prompt);
  });
}

// ─── Queue ─────────────────────────────────────────────────────────────────

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

async function claim() {
  const list = await fetch(
    `${SUPABASE}/rest/v1/app_secrets?select=key&key=like.tgbot:q:*&order=key&limit=5`,
    { headers: sbHeaders },
  ).then((r) => r.json());
  for (const row of Array.isArray(list) ? list : []) {
    const res = await fetch(`${SUPABASE}/rest/v1/app_secrets?key=eq.${encodeURIComponent(row.key)}`, {
      method: "DELETE",
      headers: { ...sbHeaders, Prefer: "return=representation" },
    }).then((r) => r.json());
    if (Array.isArray(res) && res[0]?.value) return JSON.parse(res[0].value);
  }
  return null;
}

async function post(pathname, body) {
  const res = await fetch(`${APP}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? res.json().catch(() => ({})) : { ok: false, status: res.status };
}

async function handle(job) {
  const started = Date.now();
  const result = await askClaude(job.context, job.text);
  log(`job ${job.id} "${job.text.slice(0, 40)}" → ${result?.action ?? "fail"} in ${Date.now() - started}ms`);
  const res = await post("/api/tgbot/worker/result", { job, result });
  if (!res.ok) log("result post failed", res.status ?? "");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function once(text) {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const context = {
    now: `${today} 10:00`,
    today,
    weekdayToday: "(ดูจาก nextSevenDays)",
    nextSevenDays: Array.from({ length: 8 }, (_, i) => {
      const d = new Date(Date.parse(today) + i * 86_400_000);
      return { date: d.toISOString().slice(0, 10), weekday: ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"][d.getUTCDay()] };
    }),
    openHours: { open: "08:30", close: "22:00" },
    member: { name: "ทดสอบ ระบบ", company: "Thunder Solution" },
    rooms: [
      { name: "PRIME ROOM", capacity: "2-6 คน", amenities: [] },
      { name: "MASTER ROOM", capacity: "8-10 คน", amenities: [] },
      { name: "MEETING ROOM", capacity: "10-40 คน", amenities: [] },
    ],
    myBookings: [],
    draft: null,
    reminderPrefs: { remindBeforeMin: 60, startAlert: true, endWarnMin: 10, endAlert: true, externalAlerts: true },
    quota: { unlimited: true, remainingHours: null, myHoursThisMonth: 3 },
    history: [],
  };
  const t = Date.now();
  console.log(JSON.stringify(await askClaude(context, text), null, 2));
  console.log(`${Date.now() - t}ms`);
}

async function loop() {
  for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE, TGBOT_WORKER_KEY: WORKER_KEY })) {
    if (!v) {
      console.error(`missing ${k} (put it in .env.local)`);
      process.exit(1);
    }
  }
  log(`worker up · app ${APP} · model ${MODEL}/${EFFORT}`);
  let lastTick = 0;
  const running = new Set();
  for (;;) {
    try {
      if (Date.now() - lastTick > 60_000) {
        lastTick = Date.now();
        post("/api/tgbot/tick").catch((e) => log("tick failed", e.message));
      }
      // Up to three conversations at once; one member's slow answer never blocks another.
      if (running.size < 3) {
        const job = await claim();
        if (job) {
          const p = handle(job).catch((e) => log("job failed", e.message)).finally(() => running.delete(p));
          running.add(p);
          continue;
        }
      }
    } catch (e) {
      log("loop error", e.message);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const onceIdx = process.argv.indexOf("--once");
if (onceIdx > -1) await once(process.argv.slice(onceIdx + 1).join(" ") || "พรุ่งนี้บ่ายสอง ห้อง master ชั่วโมงครึ่ง ประชุมทีมขาย");
else await loop();
