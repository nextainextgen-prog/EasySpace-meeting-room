import {
  jsonOk,
  preflight,
  requireAgentKey,
  SLOTS,
  TIMEZONE,
  today,
} from "@/lib/agent-api/core";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent — discovery document.
 *
 * The Telegram agent can fetch this once at boot to learn the endpoints and
 * to build its function/tool definitions without hardcoding them.
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  return jsonOk({
    ok: true,
    name: "EasySpace Agent API",
    version: "1.0.0",
    timezone: TIMEZONE,
    today: today(),
    auth: "Authorization: Bearer <AGENT_API_KEY>  (หรือ X-Api-Key)",
    slotGrid: { starts: SLOTS, slotMinutes: 30, closeTime: "22:30" },
    endpoints: [
      {
        method: "GET",
        path: "/api/agent/rooms",
        purpose: "รายการห้อง + รูปภาพ + ราคา (ตอบตอนผู้ใช้ถามว่ามีห้องอะไรบ้าง)",
        query: ["attendees", "includeInactive"],
      },
      {
        method: "GET",
        path: "/api/agent/rooms/{idOrName}",
        purpose: "ข้อมูลห้องเดียว (ระบุด้วย uuid หรือชื่อบางส่วน เช่น prime)",
        query: ["date"],
      },
      {
        method: "GET",
        path: "/api/agent/availability",
        purpose: "ตารางช่วงเวลาว่างรายวัน พร้อมข้อความสำเร็จรูปสำหรับส่งใน Telegram",
        query: ["date", "room", "attendees", "startTime", "endTime"],
      },
      {
        method: "POST",
        path: "/api/agent/availability",
        purpose: "เช็กว่าเวลาที่ต้องการว่างไหม (ตอบ true/false)",
        body: ["room", "date", "startTime", "endTime|durationMinutes"],
      },
      {
        method: "GET",
        path: "/api/agent/quote",
        purpose: "คำนวณราคาสำหรับลูกค้าภายนอก (แพ็กเกจ/รายชั่วโมง)",
        query: ["room", "date", "startTime", "endTime"],
      },
      {
        method: "POST",
        path: "/api/agent/bookings",
        purpose: "สร้างการจอง — mode 'member' (ภายใน ฟรี) หรือ 'customer' (ลูกค้าภายนอก มีราคา)",
        body: [
          "mode",
          "room",
          "date",
          "startTime",
          "endTime|durationMinutes",
          "title",
          "attendees",
          "memberEmail|telegramUserId (member mode)",
          "customer{name,phone} (customer mode)",
          "asHold (ติดจอง)",
        ],
      },
      {
        method: "GET",
        path: "/api/agent/bookings",
        purpose: "ค้นหาการจอง (ตามวัน / ห้อง / สมาชิก)",
        query: ["date", "from", "to", "room", "memberEmail", "telegramUserId", "status"],
      },
      {
        method: "GET",
        path: "/api/agent/bookings/{idOrReference}",
        purpose: "รายละเอียดการจองตามรหัส เช่น BK-2026-0042",
      },
      {
        method: "POST",
        path: "/api/agent/bookings/{idOrReference}/cancel",
        purpose: "ยกเลิกการจอง",
        body: ["reason", "memberEmail|telegramUserId"],
      },
      {
        method: "GET",
        path: "/api/agent/members/resolve",
        purpose: "ระบุตัวผู้ใช้ + โควตาชั่วโมงขององค์กร",
        query: ["email", "phone", "memberId", "telegramUserId"],
      },
      {
        method: "POST",
        path: "/api/agent/members/link",
        purpose: "ผูก Telegram user id เข้ากับสมาชิก (ทำครั้งเดียว)",
        body: ["telegramUserId", "email", "unlink"],
      },
    ],
    conversationFlow: [
      "1. ผู้ใช้: 'ขอดูห้องประชุม' → GET /api/agent/rooms → ส่งรูป thumbnail_url + text",
      "2. ผู้ใช้เลือกห้อง + วัน → GET /api/agent/availability?room=&date= → ส่ง text ตารางเวลา",
      "3. ผู้ใช้เลือกช่วงเวลา → POST /api/agent/availability เพื่อยืนยันว่ายังว่าง",
      "4. ถามหัวข้อประชุม → POST /api/agent/bookings (mode=member, title=...)",
      "5. ตอบกลับด้วย field `text` จาก response ได้ทันที (HTML parse mode)",
    ],
  });
}
