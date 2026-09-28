/**
 * Rules governing what an internal user may do to their own bookings without
 * asking an admin. Stored under the `booking.member_reschedule` settings key
 * and editable from /admin/settings/member-reschedule.
 *
 * Kept out of the server-action module because a "use server" file may only
 * export async functions.
 */

export interface ReschedulePolicy {
  /** Master switch for the whole feature. */
  enabled: boolean;
  /** Which member_organizations.tier values may reschedule. */
  allowed_tiers: Array<"manager" | "member" | "guest">;
  /** An occurrence starting sooner than this can no longer be moved. */
  min_notice_hours: number;
  /** How far ahead a destination slot may sit. */
  max_advance_days: number;
  /** Ceiling on one request, so a 52-week series cannot become a runaway job. */
  max_occurrences_per_request: number;
  /** Off by default: members change when, admins change where. */
  allow_room_change: boolean;
  /** Whether rooms.buffer_minutes is enforced, and against whom. */
  respect_room_buffer: "off" | "external_only" | "all";
  /** Honour rooms.service_days and the blocking holiday calendar. */
  respect_service_days: boolean;
  /** Stops a series being dragged around repeatedly. 0 disables the limit. */
  max_reschedules_per_series_per_month: number;
}

export const RESCHEDULE_SETTING_KEY = "booking.member_reschedule";

export const DEFAULT_RESCHEDULE_POLICY: ReschedulePolicy = {
  enabled: true,
  allowed_tiers: ["manager", "member"],
  min_notice_hours: 2,
  max_advance_days: 365,
  max_occurrences_per_request: 60,
  allow_room_change: false,
  respect_room_buffer: "external_only",
  respect_service_days: true,
  max_reschedules_per_series_per_month: 4,
};
