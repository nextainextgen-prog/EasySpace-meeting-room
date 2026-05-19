import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('[email] RESEND_API_KEY is not set');
}

export const resend = new Resend(apiKey);

const FROM_NAME = process.env.EMAIL_FROM_NAME ?? 'EasySpace';
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
export const DEFAULT_FROM = `${FROM_NAME} <${FROM_ADDRESS}>`;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput) {
  const { data, error } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    replyTo,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

export function bookingConfirmationEmail(params: {
  userName: string;
  roomName: string;
  startTime: string;
  endTime: string;
  bookingId: string;
}) {
  const { userName, roomName, startTime, endTime, bookingId } = params;
  return {
    subject: `ยืนยันการจองห้อง ${roomName}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#111;">การจองห้องประชุมของคุณได้รับการยืนยัน</h2>
        <p>สวัสดีคุณ ${userName},</p>
        <p>การจองของคุณได้รับการยืนยันเรียบร้อยแล้ว</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;color:#666;">ห้อง</td><td style="padding:8px 12px;font-weight:600;">${roomName}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;">เริ่ม</td><td style="padding:8px 12px;">${startTime}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;">สิ้นสุด</td><td style="padding:8px 12px;">${endTime}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;">รหัสจอง</td><td style="padding:8px 12px;font-family:monospace;">${bookingId}</td></tr>
        </table>
        <p style="color:#666;font-size:13px;">หากมีข้อสงสัย กรุณาตอบกลับอีเมลฉบับนี้</p>
      </div>
    `,
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatThaiDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export interface MeetingInviteEmailParams {
  title: string;
  organizerName: string;
  organizerEmail: string;
  orgName?: string | null;
  roomName: string;
  roomCapacity?: number | null;
  startsAt: string;
  endsAt: string;
  attendees?: number | null;
  agenda?: string | null;
  notes?: string | null;
  attendeeEmails: string[];
  reference: string;
  appUrl: string;
  bookingId: string;
}

/**
 * Email sent to the booker + each attendee when a member portal booking is
 * created. The booker gets a "confirmation" framing; attendees get an
 * "invitation" framing. Same template, conditional intro.
 */
export function meetingInviteEmail(
  params: MeetingInviteEmailParams,
  recipientRole: "organizer" | "attendee",
) {
  const dateLabel = formatThaiDateTime(params.startsAt);
  const endLabel = formatTime(params.endsAt);
  const subject =
    recipientRole === "organizer"
      ? `ยืนยันการจอง: ${params.title} · ${dateLabel}`
      : `ขอเชิญเข้าร่วมประชุม: ${params.title} · ${dateLabel}`;

  const intro =
    recipientRole === "organizer"
      ? `<p>ระบบยืนยันการจองห้องประชุมของคุณเรียบร้อย รายละเอียดดังนี้</p>`
      : `<p>คุณ <b>${escapeHtml(params.organizerName)}</b>${
          params.orgName ? ` · ${escapeHtml(params.orgName)}` : ""
        } ได้เชิญคุณเข้าร่วมประชุม</p>`;

  const attendeesLine =
    params.attendeeEmails.length > 0
      ? `<tr><td style="padding:6px 12px;color:#666;vertical-align:top;">ผู้เข้าร่วม</td><td style="padding:6px 12px;">${params.attendeeEmails
          .map((e) => escapeHtml(e))
          .join(", ")}</td></tr>`
      : "";

  const agendaBlock = params.agenda
    ? `<div style="margin-top:18px;"><p style="color:#666;font-size:13px;margin:0 0 4px;">วาระการประชุม</p><div style="background:#F8FAFC;border-left:3px solid #3B5BDB;padding:10px 14px;white-space:pre-wrap;font-size:13px;">${escapeHtml(
        params.agenda,
      )}</div></div>`
    : "";

  const notesBlock = params.notes
    ? `<p style="color:#666;font-size:13px;margin-top:14px;">หมายเหตุ: ${escapeHtml(params.notes)}</p>`
    : "";

  const html = `
    <div style="font-family:'IBM Plex Sans Thai','Plus Jakarta Sans',system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0F172A;">
      <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#EEF2FF;color:#3B5BDB;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
        ${recipientRole === "organizer" ? "BOOKING CONFIRMED" : "MEETING INVITATION"}
      </div>
      <h1 style="font-size:22px;letter-spacing:-0.02em;margin:14px 0 6px;">${escapeHtml(params.title)}</h1>
      ${intro}

      <table style="border-collapse:collapse;margin:18px 0;width:100%;font-size:14px;">
        <tr><td style="padding:6px 12px;color:#666;width:120px;">ห้อง</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(params.roomName)}${
          params.roomCapacity ? ` <span style="color:#94A3B8;font-weight:400;">(สูงสุด ${params.roomCapacity} ท่าน)</span>` : ""
        }</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">เวลา</td><td style="padding:6px 12px;">${dateLabel} – ${endLabel}</td></tr>
        ${params.attendees ? `<tr><td style="padding:6px 12px;color:#666;">จำนวนผู้เข้า</td><td style="padding:6px 12px;">${params.attendees} ท่าน</td></tr>` : ""}
        ${attendeesLine}
        <tr><td style="padding:6px 12px;color:#666;">รหัสจอง</td><td style="padding:6px 12px;font-family:'SF Mono',monospace;">${escapeHtml(params.reference)}</td></tr>
      </table>

      ${agendaBlock}
      ${notesBlock}

      <div style="margin-top:24px;">
        <a href="${params.appUrl}/app/booking/${params.bookingId}" style="display:inline-block;padding:11px 22px;background:#3B5BDB;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">เปิดดูในระบบ</a>
      </div>

      <hr style="margin:28px 0;border:none;border-top:1px solid #E2E8F0;" />
      <p style="color:#94A3B8;font-size:12px;line-height:1.5;">
        ส่งอัตโนมัติจาก EasySpace · ระบบจัดการห้องประชุม<br/>
        ผู้จัด: ${escapeHtml(params.organizerName)} &lt;${escapeHtml(params.organizerEmail)}&gt;
      </p>
    </div>
  `;

  const text = [
    recipientRole === "organizer"
      ? `ยืนยันการจอง: ${params.title}`
      : `ขอเชิญเข้าร่วมประชุม: ${params.title}`,
    "",
    `ห้อง: ${params.roomName}`,
    `เวลา: ${dateLabel} – ${endLabel}`,
    params.attendees ? `จำนวนผู้เข้า: ${params.attendees} ท่าน` : null,
    `รหัสจอง: ${params.reference}`,
    "",
    `ผู้จัด: ${params.organizerName} <${params.organizerEmail}>`,
    `เปิดดู: ${params.appUrl}/app/booking/${params.bookingId}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
