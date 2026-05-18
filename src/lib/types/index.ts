/**
 * Domain types — kept light so spec changes don't fan out across the codebase.
 * Database types are auto-generated separately into `database.ts` (TODO once
 * Supabase types are pulled via `supabase gen types`).
 */

export type Role =
  | "owner"
  | "super_admin"
  | "admin"
  | "staff"
  | "accountant"
  | "marketing"
  | "viewer";

export type CustomerType = "individual" | "company" | "government";

export type BookingSource = "external" | "internal";

export type PaymentStatus = "unpaid" | "deposit" | "paid" | "free";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_use"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "promptpay"
  | "qr"
  | "credit_card";

export type LeadSource =
  | "line"
  | "walk_in"
  | "referral_bni"
  | "facebook"
  | "google"
  | "email"
  | "other";

export type RoomStatus = "active" | "maintenance" | "inactive";

export type PromotionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "expired";

export type PromotionDiscountType =
  | "percentage"
  | "fixed"
  | "package_upgrade"
  | "free_addon"
  | "bogo"
  | "voucher";

export type NotificationLevel = "info" | "success" | "warning" | "danger";

export type NotificationCategory =
  | "time"
  | "finance"
  | "ai_digest"
  | "ai_insight"
  | "system";

export type AuditAction =
  | "created"
  | "updated"
  | "cancelled"
  | "restored"
  | "paid"
  | "refunded"
  | "role_changed"
  | "login_success"
  | "login_failed"
  | "settings_changed";

export type TelegramEventKey =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "payment.paid"
  | "payment.deposit"
  | "payment.free"
  | "payment.refund"
  | "outstanding.alert"
  | "finance.daily_brief"
  | "finance.weekly_summary"
  | "notification.time_alert"
  | "notification.system"
  | "internal.member_joined"
  | "internal.quota_alert"
  | "internal.no_show";

export interface Money {
  amount: number;
  currency: "THB";
}

export interface TimeRange {
  start: string; // ISO 8601
  end: string; // ISO 8601
}
