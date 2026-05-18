import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  MapPin,
  FileText,
  Activity,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { getCurrentMember } from "@/lib/data/members";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { formatDate, formatTimeRange, durationHours } from "@/lib/format";
import { CancelBookingButton } from "./cancel-button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface BookingDetail {
  id: string;
  reference_code: string;
  member_id: string | null;
  org_id: string | null;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  booking_status: string;
  is_public: boolean;
  internal_title: string | null;
  internal_agenda: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  room: { name: string; color: string; floor: string | null; room_number: string | null } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  reason: string | null;
  changes: unknown;
  created_at: string;
}

export default async function MemberBookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentMember();
  if (!ctx) redirect("/app");

  const admin = createSupabaseAdminClient();
  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      `id, reference_code, member_id, org_id, starts_at, ends_at,
       attendees_count, booking_status, is_public,
       internal_title, internal_agenda, notes,
       cancelled_at, cancelled_reason, created_at,
       room:rooms(name, color, floor, room_number)`,
    )
    .eq("id", id)
    .maybeSingle();
  const booking = bookingRaw as unknown as BookingDetail | null;

  if (!booking) notFound();

  // Access control — only owner or same-org can view
  const isOwner = booking.member_id === ctx.member.id;
  const isSameOrg = booking.org_id === ctx.primaryOrgId;
  if (!isOwner && !isSameOrg) notFound();

  const { data: auditRaw } = await admin
    .from("booking_audit_log")
    .select("id, action, reason, changes, created_at")
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const audit = (auditRaw ?? []) as unknown as AuditEntry[];

  const hours = durationHours(booking.starts_at, booking.ends_at);
  const status = booking.booking_status;
  const isCancelled = status === "cancelled";
  const isPast = new Date(booking.ends_at) < new Date();
  const isUpcoming = !isCancelled && !isPast;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <Link
        href="/app/my-bookings"
        className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600"
      >
        <ChevronLeft size={12} />
        กลับสู่การจองของฉัน
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span
              className="w-1 h-14 rounded-full"
              style={{ background: booking.room?.color ?? "#cbd5e1" }}
            />
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tighter">
                {booking.internal_title ?? "การประชุม"}
              </h1>
              <p className="text-xs text-ink-3 font-mono mt-0.5">
                {booking.reference_code}
              </p>
            </div>
          </div>
          <Badge
            tone={
              isCancelled
                ? "danger"
                : isPast
                  ? "muted"
                  : status === "confirmed"
                    ? "success"
                    : "warning"
            }
          >
            {isCancelled
              ? "ยกเลิกแล้ว"
              : isPast
                ? "ผ่านมาแล้ว"
                : status === "confirmed"
                  ? "ยืนยันแล้ว"
                  : "รออนุมัติ"}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <DetailRow icon={Calendar} label="วันที่">
            {formatDate(booking.starts_at)}
          </DetailRow>
          <DetailRow icon={Clock} label="เวลา">
            {formatTimeRange(booking.starts_at, booking.ends_at)} · {hours} ชม.
          </DetailRow>
          <DetailRow icon={MapPin} label="ห้อง">
            {booking.room?.name ?? "—"}
            {booking.room?.floor ? ` · ชั้น ${booking.room.floor}` : ""}
            {booking.room?.room_number ? ` · ${booking.room.room_number}` : ""}
          </DetailRow>
          <DetailRow icon={Users} label="จำนวนคน">
            {booking.attendees_count ?? "—"} คน
          </DetailRow>
        </dl>

        {booking.internal_agenda && (
          <div className="mt-5 pt-5 border-t border-line-soft">
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
              Agenda
            </p>
            <p className="text-sm text-ink-1 whitespace-pre-wrap">
              {booking.internal_agenda}
            </p>
          </div>
        )}

        {booking.notes && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
              หมายเหตุภายใน
            </p>
            <p className="text-sm text-ink-2">{booking.notes}</p>
          </div>
        )}

        {isCancelled && booking.cancelled_reason && (
          <div className="mt-4 rounded-input bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <span className="font-medium">เหตุผลยกเลิก:</span>{" "}
            {booking.cancelled_reason}
          </div>
        )}

        {isUpcoming && isOwner && (
          <div className="mt-5 pt-5 border-t border-line-soft flex justify-end">
            <CancelBookingButton
              bookingId={booking.id}
              memberId={ctx.member.id}
            />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconTile icon={FileText} tone="primary" size="sm" />
            <div>
              <CardTitle>ผู้เข้าร่วม</CardTitle>
              <p className="text-xs text-ink-3 mt-0.5">
                Phase 2 — invite attendees ทาง email + sync Google Calendar
              </p>
            </div>
          </div>
        </CardHeader>
        <p className="text-sm text-ink-3 text-center py-6">
          ฟีเจอร์เชิญผู้เข้าร่วม + Calendar sync จะเปิดใน Phase 2
        </p>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconTile icon={Activity} tone="primary" size="sm" />
            <div>
              <CardTitle>Activity</CardTitle>
              <p className="text-xs text-ink-3 mt-0.5">
                ประวัติการเปลี่ยนแปลงของการจอง
              </p>
            </div>
          </div>
        </CardHeader>
        {audit.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">ไม่มี activity</p>
        ) : (
          <ul className="space-y-3">
            {audit.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-pill bg-primary-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-1 tracking-tight">
                    {actionLabel(a.action)}
                    {a.reason ? ` — ${a.reason}` : ""}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-0.5">
                    {new Date(a.created_at).toLocaleString("th-TH")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon size={16} className="text-primary-600 mt-0.5" strokeWidth={1.75} />
      <div>
        <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">
          {label}
        </p>
        <p className="text-sm font-medium text-ink-1 mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function actionLabel(action: string) {
  switch (action) {
    case "created":
      return "สร้างการจอง";
    case "updated":
      return "แก้ไขข้อมูล";
    case "cancelled":
      return "ยกเลิกการจอง";
    case "paid":
      return "บันทึกการชำระ";
    case "restored":
      return "กู้คืน";
    default:
      return action;
  }
}
