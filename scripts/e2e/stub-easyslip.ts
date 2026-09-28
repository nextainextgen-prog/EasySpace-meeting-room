// Test double for @/lib/integrations/easyslip — scripted verdicts, so the
// payment e2e never spends real EasySlip quota and can exercise every branch.
import type { EasySlipData, EasySlipResult } from "../../src/lib/integrations/easyslip";
export type { EasySlipData, EasySlipResult };
export { EASYSLIP_MESSAGES } from "../../src/lib/integrations/easyslip";

let next: EasySlipResult[] = [];
export const calls: number[] = [];
export function __queue(...r: EasySlipResult[]) {
  next.push(...r);
}
export function __reset() {
  next = [];
  calls.length = 0;
}
export async function easySlipConfigured() {
  return true;
}
export async function verifySlipImage(bytes: ArrayBuffer): Promise<EasySlipResult> {
  calls.push(bytes.byteLength);
  return next.shift() ?? { ok: false, status: 500, message: "server_error" };
}
export async function easySlipMe() {
  return { ok: true as const, data: { application: "stub", usedQuota: 0, maxQuota: 50, remainingQuota: 50, expiredAt: "", currentCredit: 0 } };
}
