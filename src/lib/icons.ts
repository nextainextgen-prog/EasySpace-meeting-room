import {
  LayoutDashboard,
  Calendar,
  CalendarPlus,
  Users,
  UserCog,
  Wallet,
  DoorOpen,
  Settings,
  Bell,
  Tag,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Clock,
  Building2,
  Brain,
  Activity,
  ListTodo,
  History,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  PaymentStatus,
  BookingStatus,
  NotificationLevel,
} from "@/lib/types";

export const navIcons = {
  dashboard: LayoutDashboard,
  bookings: CalendarPlus,
  calendar: Calendar,
  customers: Users,
  finance: Wallet,
  rooms: DoorOpen,
  settings: Settings,
  notifications: Bell,
  promotions: Tag,
  users: UserCog,
  analytics: Brain,
  activity: Activity,
  tasks: ListTodo,
  ai: Sparkles,
  buildings: Building2,
  audit: History,
  account: UserCircle,
} as const satisfies Record<string, LucideIcon>;

export function paymentStatusIcon(status: PaymentStatus): LucideIcon {
  switch (status) {
    case "paid":
      return CheckCircle2;
    case "deposit":
      return Clock;
    case "unpaid":
      return AlertCircle;
    case "free":
      return Tag;
  }
}

export function bookingStatusIcon(status: BookingStatus): LucideIcon {
  switch (status) {
    case "confirmed":
    case "completed":
      return CheckCircle2;
    case "in_use":
      return Activity;
    case "cancelled":
    case "no_show":
      return AlertCircle;
    case "pending":
      return Clock;
  }
}

export function notificationLevelIcon(level: NotificationLevel): LucideIcon {
  switch (level) {
    case "danger":
      return AlertCircle;
    case "warning":
      return Bell;
    case "success":
      return CheckCircle2;
    case "info":
      return Activity;
  }
}

export const deltaIcon = (delta: number) =>
  delta >= 0 ? TrendingUp : TrendingDown;

export const paymentMethodIcon = CreditCard;
