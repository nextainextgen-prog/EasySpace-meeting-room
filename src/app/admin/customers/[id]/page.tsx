import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Crown,
  Building2,
  Landmark,
  User as UserIcon,
  Ban,
  Sparkles,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  getCustomerById,
  listCustomerBookings,
  listCustomerPayments,
  getCustomerTimeline,
  getCustomerAnalytics,
  listAdmins,
} from "@/lib/data";
import {
  SEGMENT_DEFS,
  classifySegment,
  rfmScores,
  computeHealthScore,
} from "@/lib/data/customer-segments";
import { formatBaht, relativeFromNow, formatDate } from "@/lib/format";
import { CustomerTabs } from "./customer-tabs";
import { CustomerQuickActions } from "./customer-quick-actions";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const [bookings, payments, timeline, analytics, admins] = await Promise.all([
    listCustomerBookings(id),
    listCustomerPayments(id),
    getCustomerTimeline(id),
    getCustomerAnalytics(id),
    listAdmins(),
  ]);

  const segment = classifySegment(customer);
  const segDef = SEGMENT_DEFS.find((s) => s.key === segment);
  const rfm = rfmScores(customer);
  const health = computeHealthScore(customer);

  const lifetimeDays = customer.first_booked_at
    ? Math.round(
        (Date.now() - new Date(customer.first_booked_at).getTime()) / 86_400_000,
      )
    : 0;
  const lifetimeYears = lifetimeDays > 0 ? (lifetimeDays / 365).toFixed(1) : "0";

  const avgBookingValue =
    customer.total_bookings > 0
      ? Math.round(Number(customer.total_spent) / customer.total_bookings)
      : 0;
  const clvEstimate = Math.round(avgBookingValue * Math.max(customer.total_bookings, 4) * 1.5);

  const TypeIcon =
    customer.type === "company"
      ? Building2
      : customer.type === "government"
        ? Landmark
        : UserIcon;
  const typeLabel =
    customer.type === "company"
      ? "นิติบุคคล"
      : customer.type === "government"
        ? "ราชการ"
        : "บุคคลธรรมดา";

  return (
    <>
      <AdminTopbar
        title={customer.display_name}
        subtitle={`360° Profile · ${segDef?.label ?? "ลูกค้า"} · ${typeLabel}`}
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-1 transition"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          กลับไปหน้า ลูกค้า
        </Link>

        <Card className="!p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <span className="w-16 h-16 rounded-card-sm bg-primary-50 text-primary-600 grid place-items-center font-semibold text-xl shrink-0 relative">
                {customer.display_name.slice(0, 2)}
                {customer.tags.includes("VIP") && (
                  <Crown
                    size={14}
                    strokeWidth={2}
                    className="absolute -top-1.5 -right-1.5 text-amber-500 bg-white rounded-full p-0.5 w-5 h-5 shadow-card"
                  />
                )}
                {customer.blacklisted_at && (
                  <Ban
                    size={14}
                    strokeWidth={2}
                    className="absolute -top-1.5 -right-1.5 text-red-500 bg-white rounded-full p-0.5 w-5 h-5 shadow-card"
                  />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl lg:text-2xl font-bold tracking-tighter text-ink-1 truncate">
                    {customer.display_name}
                  </h1>
                  {segDef && segDef.key !== "all" && (
                    <Badge tone={segDef.tone}>{segDef.label}</Badge>
                  )}
                  {customer.tags.map((t) => (
                    <Badge
                      key={t}
                      tone={
                        t === "VIP" || t === "Champion"
                          ? "primary"
                          : "muted"
                      }
                    >
                      {t}
                    </Badge>
                  ))}
                  {customer.blacklisted_at && (
                    <Badge tone="danger">Blacklist</Badge>
                  )}
                </div>
                <p className="text-xs text-ink-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <TypeIcon size={11} strokeWidth={1.75} />
                    {typeLabel}
                  </span>
                  {customer.source && <span>· ที่มา {sourceLabel(customer.source)}</span>}
                  {customer.first_booked_at && (
                    <span>· ลูกค้ามา {lifetimeYears} ปี · {lifetimeDays} วัน</span>
                  )}
                  {customer.last_booked_at && (
                    <span>· จองล่าสุด {relativeFromNow(customer.last_booked_at)}</span>
                  )}
                </p>
              </div>
            </div>

            <CustomerQuickActions
              customer={customer}
              owners={admins.map((a) => ({
                id: a.id,
                full_name: a.full_name,
                email: a.email,
              }))}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-line-soft">
            <Stat label="จองทั้งหมด" value={`${customer.total_bookings}`} suffix="ครั้ง" />
            <Stat
              label="ยอดรวม"
              value={formatBaht(Number(customer.total_spent))}
            />
            <Stat label="เฉลี่ย/ครั้ง" value={formatBaht(avgBookingValue)} />
            <Stat
              label={`RFM ${rfm.code}`}
              value={segDef?.label ?? "—"}
              tone={segDef?.tone}
            />
            <Stat
              label="CLV (คาดการณ์)"
              value={formatBaht(clvEstimate)}
            />
            <Stat
              label="Health Score"
              value={`${health.score}`}
              suffix={health.label}
              tone={health.tone === "success" ? "success" : health.tone === "warning" ? "warning" : "danger"}
            />
          </div>

          {(customer.no_show_count > 0 ||
            customer.cancellation_count > 0 ||
            customer.churn_risk === "high") && (
            <div className="mt-4 px-4 py-3 rounded-card-sm bg-amber-50/60 border border-amber-200 flex items-start gap-3">
              <IconTile icon={Sparkles} tone="warning" size="sm" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold mb-0.5">AI พบสัญญาณที่ต้องระวัง</p>
                <p>
                  {customer.no_show_count > 0 && `No-show ${customer.no_show_count} ครั้ง · `}
                  {customer.cancellation_count > 0 && `ยกเลิก ${customer.cancellation_count} ครั้ง · `}
                  {customer.churn_risk === "high" && "ความเสี่ยงหาย (Churn) ระดับสูง — แนะนำให้ติดตาม"}
                </p>
              </div>
            </div>
          )}
        </Card>

        <CustomerTabs
          customer={customer}
          bookings={bookings}
          payments={payments}
          timeline={timeline}
          analytics={analytics}
          owners={admins.map((a) => ({
            id: a.id,
            full_name: a.full_name,
            email: a.email,
          }))}
        />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "muted";
}) {
  const color =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : tone === "primary"
            ? "text-primary-700"
            : "text-ink-1";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
        {label}
      </p>
      <p className={`mt-1 text-base font-bold tabular-nums tracking-tight ${color}`}>
        {value}
      </p>
      {suffix && (
        <p className="text-[10px] text-ink-3 font-medium tracking-wide">{suffix}</p>
      )}
    </div>
  );
}

function sourceLabel(s: string) {
  return (
    {
      line: "LINE",
      walk_in: "Walk-in",
      referral_bni: "BNI Referral",
      facebook: "Facebook",
      google: "Google",
      email: "Email",
      other: "อื่นๆ",
    }[s] ?? s
  );
}
