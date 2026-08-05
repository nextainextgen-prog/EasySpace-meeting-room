/**
 * ติดจอง (tentative hold) — shared constants and pure helpers.
 *
 * A hold is a booking with `booking_status = 'pending'`, no money attached,
 * and a `hold_expires_at` deadline. It blocks the room (every conflict check
 * already treats 'pending' as occupied) but is excluded from revenue.
 *
 * Kept out of the "use server" action files because those may only export
 * async functions.
 */

/** Days a hold stays alive before the cron releases the room. Configurable at
 *  /admin/settings/policy → `booking.policy.hold_expiry_days`. */
export const DEFAULT_HOLD_EXPIRY_DAYS = 3;

/** Hours before expiry at which the cron sends the "ใกล้หมดอายุ" warning. */
export const HOLD_WARNING_HOURS = 24;

/**
 * Hold deadline = whichever comes first: the configured grace period, or the
 * moment the held slot actually starts. A hold must never outlive the slot it
 * is holding — otherwise the room sits blocked through its own booking time.
 */
export function computeHoldExpiry(startsAt: string, days: number): string {
  const byPolicy = Date.now() + days * 86_400_000;
  const slotStart = new Date(startsAt).getTime();
  const deadline = Number.isNaN(slotStart)
    ? byPolicy
    : Math.min(byPolicy, slotStart);
  return new Date(deadline).toISOString();
}

/** Whole days left before a hold expires; negative once it has lapsed. */
export function holdDaysLeft(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

/** Short Thai countdown for calendar blocks — "เหลือ 2 วัน" / "วันนี้". */
export function holdCountdownLabel(
  expiresAt: string | null | undefined,
): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "หมดอายุแล้ว";
  if (ms < 3_600_000) return "เหลือไม่ถึง 1 ชม.";
  // Round up throughout: a countdown that says "เหลือ 4 ชม." with 4h59m left
  // reads as more urgent than it is and invites the wrong call.
  if (ms < 86_400_000) return `เหลือ ${Math.ceil(ms / 3_600_000)} ชม.`;
  return `เหลือ ${Math.ceil(ms / 86_400_000)} วัน`;
}
