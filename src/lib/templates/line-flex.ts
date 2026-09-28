/**
 * LINE Flex messages sent to customers about their booking.
 * Built to read like a receipt: brand line, headline, status pill, a clean
 * key/value table, and one clear action.
 */

import { bkkDate, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import { thaiDateLong } from "@/lib/public-booking/shared";
import type { LineMessage } from "@/lib/integrations/line-messaging";

const INK = "#0F172A";
const MUTED = "#94A3B8";
const BODY = "#475569";
const BRAND = "#2D4EF5";

export type BookingFlexKind = "received" | "confirmed" | "cancelled";

export interface BookingFlexInput {
  kind: BookingFlexKind;
  reference: string;
  roomName: string;
  roomImage?: string | null;
  startsAt: string;
  endsAt: string;
  bookerName: string;
  attendees?: number | null;
  totalAmount: number;
  paidAmount: number;
  /** Amount still to pay online right now (received + payment enabled). */
  dueNow?: number | null;
  dueBy?: string | null;
  /** Admin-confirms mode: what to transfer before sending the slip in chat. */
  manualDue?: number | null;
  manualLabel?: string | null;
  paymentLabel?: string | null;
  statusUrl: string;
  note?: string | null;
}

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

function row(label: string, value: string, opts: { bold?: boolean; color?: string } = {}) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
      { type: "text", text: label, size: "sm", color: MUTED, flex: 3 },
      {
        type: "text",
        text: value,
        size: "sm",
        color: opts.color ?? INK,
        weight: opts.bold ? "bold" : "regular",
        align: "end",
        wrap: true,
        flex: 5,
      },
    ],
  };
}

function pill(text: string, fg: string, bg: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        backgroundColor: bg,
        cornerRadius: "xxl",
        paddingStart: "12px",
        paddingEnd: "12px",
        paddingTop: "4px",
        paddingBottom: "4px",
        contents: [{ type: "text", text, size: "xs", weight: "bold", color: fg }],
      },
    ],
  };
}

export function bookingFlexMessage(b: BookingFlexInput): LineMessage {
  const remaining = Math.max(0, b.totalAmount - b.paidAmount);
  const when = `${bkkTime(b.startsAt)} – ${bkkTime(b.endsAt)} น.`;

  const head =
    b.kind === "confirmed"
      ? {
          title: "การจองสำเร็จ",
          sub: "เราได้รับชำระเงินแล้ว ห้องพร้อมสำหรับคุณตามเวลานัด",
          pill: pill(b.paymentLabel ?? "ยืนยันแล้ว", "#047857", "#D1FAE5"),
        }
      : b.kind === "cancelled"
        ? {
            title: "การจองถูกยกเลิก",
            sub: b.note ?? "หากต้องการจองใหม่ สามารถเลือกเวลาได้จากลิงก์ด้านล่าง",
            pill: pill("ยกเลิกแล้ว", "#BE123C", "#FFE4E6"),
          }
        : {
            title: "ได้รับการจองแล้ว",
            sub: b.dueNow
              ? `กรุณาชำระ ${baht(b.dueNow)}${b.dueBy ? ` ภายใน ${bkkTime(b.dueBy)} น. (${bkkDateLabel(b.dueBy)})` : ""} เพื่อยืนยันการจอง`
              : `กรุณาโอน${b.manualDue ? ` ${baht(b.manualDue)}${b.manualLabel ? ` (${b.manualLabel})` : ""}` : "ตามยอดที่แจ้ง"} แล้วส่งสลิปตอบกลับในแชทนี้พร้อมรหัสการจอง แอดมินจะยืนยันให้`,
            pill: pill(b.dueNow ? "รอชำระเงิน" : "รอส่งสลิป", "#334155", "#F1F5F9"),
          };

  const rows = [
    row("รหัสการจอง", b.reference, { bold: true }),
    row("ห้อง", b.roomName),
    row("วันที่", thaiDateLong(bkkDate(b.startsAt)).replace(/^วัน/, "")),
    row("เวลา", when),
    row("ผู้จอง", b.bookerName),
    ...(b.attendees ? [row("ผู้เข้าร่วม", `${b.attendees} ท่าน`)] : []),
  ];

  const money =
    b.kind === "cancelled"
      ? []
      : [
          { type: "separator", margin: "lg", color: "#E8ECF2" },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              row("ยอดรวม", baht(b.totalAmount)),
              ...(b.paidAmount > 0 ? [row("ชำระแล้ว", baht(b.paidAmount), { color: "#047857" })] : []),
              ...(b.paidAmount > 0 && remaining > 0
                ? [row("คงเหลือชำระหน้างาน", baht(remaining), { bold: true })]
                : []),
              ...(b.kind === "received" && b.dueNow
                ? [row("ยอดที่ต้องชำระตอนนี้", baht(b.dueNow), { bold: true, color: BRAND })]
                : []),
            ],
          },
        ];

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    ...(b.roomImage && /^https:\/\//.test(b.roomImage)
      ? {
          hero: {
            type: "image",
            url: b.roomImage,
            size: "full",
            aspectRatio: "20:9",
            aspectMode: "cover",
          },
        }
      : {}),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "EasySpace", size: "xs", weight: "bold", color: BRAND },
        { type: "text", text: head.title, size: "xl", weight: "bold", color: INK, margin: "sm", wrap: true },
        { type: "text", text: head.sub, size: "sm", color: BODY, margin: "sm", wrap: true },
        { ...head.pill, margin: "md" },
        { type: "separator", margin: "lg", color: "#E8ECF2" },
        { type: "box", layout: "vertical", margin: "lg", spacing: "sm", contents: rows },
        ...money,
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: b.kind === "cancelled" ? INK : BRAND,
          height: "md",
          action: {
            type: "uri",
            label:
              b.kind === "received" && b.dueNow
                ? "ชำระเงิน"
                : b.kind === "cancelled"
                  ? "จองใหม่"
                  : "ดูรายละเอียดการจอง",
            uri: b.statusUrl,
          },
        },
      ],
    },
    styles: { footer: { separator: true, separatorColor: "#F1F4F8" } },
  };

  const alt =
    b.kind === "confirmed"
      ? `การจองสำเร็จ ${b.reference}`
      : b.kind === "cancelled"
        ? `ยกเลิกการจอง ${b.reference}`
        : `ได้รับการจอง ${b.reference}`;

  return {
    type: "flex",
    altText: `EasySpace · ${alt} · ${bkkDateLabel(b.startsAt)} ${when}`,
    contents: bubble,
  };
}
