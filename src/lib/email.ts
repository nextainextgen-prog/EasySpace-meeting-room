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
