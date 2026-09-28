/**
 * Online payment rules shared by the server and the public pages.
 * Pure and client-safe.
 */

export type PaymentMode = "deposit" | "full";

/** What the customer must transfer now to secure the booking. */
export function amountDueNow(total: number, mode: PaymentMode, depositPercent: number): number {
  if (total <= 0) return 0;
  if (mode === "full") return Math.round(total);
  const pct = Math.min(100, Math.max(1, depositPercent));
  return Math.ceil((total * pct) / 100);
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "ยังไม่ชำระ",
  deposit: "ชำระมัดจำแล้ว",
  paid: "ชำระครบแล้ว",
  free: "ไม่มีค่าใช้จ่าย",
};

// ─── PromptPay (EMVCo merchant-presented QR) ──────────────────────────────

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * PromptPay payload for a phone (10 digits), national/tax ID (13 digits) or
 * e-wallet ID (15 digits). With an amount, the customer's banking app fills
 * it in. Returns null for an id we can't encode.
 */
export function promptPayPayload(id: string, amount?: number): string | null {
  const digits = id.replace(/\D/g, "");
  let account: string;
  if (digits.length === 10 && digits.startsWith("0")) {
    account = tlv("01", `0066${digits.slice(1)}`);
  } else if (digits.length === 13) {
    account = tlv("02", digits);
  } else if (digits.length === 15) {
    account = tlv("03", digits);
  } else {
    return null;
  }
  const parts = [
    tlv("00", "01"),
    tlv("01", amount ? "12" : "11"),
    tlv("29", tlv("00", "A000000677010111") + account),
    tlv("58", "TH"),
    tlv("53", "764"),
    ...(amount ? [tlv("54", amount.toFixed(2))] : []),
  ].join("");
  const withCrcTag = `${parts}6304`;
  return withCrcTag + crc16(withCrcTag);
}

// ─── Slip ↔ account matching ──────────────────────────────────────────────

/**
 * EasySlip masks account numbers ("xxx-x-x5678-x"). A configured account
 * matches when every digit the bank did reveal lines up with ours.
 */
export function maskedAccountMatches(masked: string | null | undefined, full: string): boolean {
  if (!masked) return false;
  const m = masked.replace(/[^0-9xX*]/g, "").toLowerCase().replace(/\*/g, "x");
  const f = full.replace(/\D/g, "");
  const revealed = m.replace(/x/g, "");
  if (revealed.length < 3 || !f) return false;
  if (m.length === f.length) {
    for (let i = 0; i < m.length; i++) {
      if (m[i] !== "x" && m[i] !== f[i]) return false;
    }
    return true;
  }
  // Different layout (proxy / e-wallet): fall back to the trailing digits.
  const tail = m.match(/(\d+)x*$/)?.[1] ?? revealed;
  return tail.length >= 3 && f.endsWith(tail);
}

/** Loose Thai/English name match — titles and spacing stripped. */
export function namesLookAlike(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?|miss|บจก\.?|บริษัท|หจก\.?|co\.?,?\s*ltd\.?)/g, "")
      .replace(/[^a-z0-9฀-๿]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (x.length < 3 || y.length < 3) return false;
  // Slips truncate long names ("บริษัท ธันเดอร์ โซลู…"): prefix is enough.
  return x.startsWith(y.slice(0, 6)) || y.startsWith(x.slice(0, 6));
}

/** What the public pages need to take a payment — no secrets in here. */
export interface PublicPaymentInfo {
  ready: boolean;
  mode: PaymentMode;
  depositPercent: number;
  holdMinutes: number;
  banks: Array<{ id: string; bank_name: string; account_number: string; account_name: string }>;
  promptpayId: string | null;
}

export function paymentModeLabel(mode: PaymentMode | null | undefined, percent: number): string {
  return mode === "full" ? "ชำระเต็มจำนวน" : `มัดจำ ${percent}%`;
}
