/**
 * EasySlip v1 — Thai bank-slip verification.
 * Docs: https://document.easyslip.com/en/v1/
 *
 *   POST https://api.easyslip.com/v1/verify   multipart `file` (+ checkDuplicate)
 *   GET  https://api.easyslip.com/v1/me       quota / expiry (free of charge)
 *
 * Success: { status: 200, data: {...} }   Error: { status, message: "code" }
 */

import { getSecret } from "@/lib/server/secrets";

const BASE = "https://api.easyslip.com/v1";

export interface EasySlipAccount {
  name?: { th?: string; en?: string };
  bank?: { type?: string; account?: string };
  proxy?: { type?: string; account?: string };
}

export interface EasySlipData {
  payload?: string;
  transRef: string;
  date: string;
  countryCode?: string;
  amount: { amount: number; local?: { amount?: number; currency?: string } };
  fee?: number;
  ref1?: string;
  ref2?: string;
  ref3?: string;
  sender?: { bank?: { id?: string; name?: string; short?: string }; account?: EasySlipAccount };
  receiver?: {
    bank?: { id?: string; name?: string; short?: string };
    account?: EasySlipAccount;
    merchantId?: string;
  };
}

export type EasySlipResult =
  | { ok: true; status: 200; data: EasySlipData }
  | { ok: false; status: number; message: string };

export const EASYSLIP_MESSAGES: Record<string, string> = {
  unauthorized: "API key ของ EasySlip ไม่ถูกต้อง",
  access_denied: "EasySlip ปฏิเสธการเข้าถึง",
  quota_exceeded: "โควตาตรวจสลิปของ EasySlip หมดแล้ว",
  duplicate_slip: "สลิปนี้เคยถูกใช้ไปแล้ว",
  invalid_payload: "อ่านข้อมูลสลิปไม่ได้",
  invalid_image: "ไฟล์นี้ไม่ใช่รูปสลิปที่อ่านได้",
  image_size_too_large: "รูปมีขนาดใหญ่เกิน 4MB",
  qrcode_not_found: "ไม่พบ QR code บนสลิป กรุณาอัปโหลดสลิปที่เห็น QR ชัดเจน",
  slip_not_found: "ไม่พบรายการนี้ในระบบธนาคาร",
  slip_pending: "ธนาคารยังไม่ยืนยันรายการ (สลิปกรุงเทพฯ อาจต้องรอ 5 นาที) กรุณาลองใหม่อีกครั้ง",
  application_expired: "แพ็กเกจ EasySlip หมดอายุ",
  application_deactivated: "แอป EasySlip ถูกปิดใช้งาน",
  server_error: "ระบบ EasySlip ขัดข้องชั่วคราว",
};

export async function easySlipConfigured(): Promise<boolean> {
  return Boolean(await getSecret("easyslip"));
}

export async function verifySlipImage(
  bytes: ArrayBuffer,
  mime: string,
  filename = "slip.jpg",
): Promise<EasySlipResult> {
  const key = await getSecret("easyslip");
  if (!key) return { ok: false, status: 0, message: "not_configured" };

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime || "image/jpeg" }), filename);
  form.append("checkDuplicate", "true");

  try {
    const res = await fetch(`${BASE}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json().catch(() => null)) as
      | { status?: number; data?: EasySlipData; message?: string }
      | null;
    if (json?.status === 200 && json.data) {
      return { ok: true, status: 200, data: json.data };
    }
    return {
      ok: false,
      status: json?.status ?? res.status,
      message: json?.message ?? `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, status: 0, message: (err as Error).name === "TimeoutError" ? "timeout" : "network_error" };
  }
}

export interface EasySlipMe {
  application: string;
  usedQuota: number;
  maxQuota: number | null;
  remainingQuota: number | null;
  expiredAt: string;
  currentCredit: number;
}

export async function easySlipMe(
  keyOverride?: string,
): Promise<{ ok: true; data: EasySlipMe } | { ok: false; message: string }> {
  const key = keyOverride ?? (await getSecret("easyslip"));
  if (!key) return { ok: false, message: "not_configured" };
  try {
    const res = await fetch(`${BASE}/me`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { status?: number; data?: EasySlipMe; message?: string }
      | null;
    if (json?.status === 200 && json.data) return { ok: true, data: json.data };
    return { ok: false, message: json?.message ?? `http_${res.status}` };
  } catch {
    return { ok: false, message: "network_error" };
  }
}
