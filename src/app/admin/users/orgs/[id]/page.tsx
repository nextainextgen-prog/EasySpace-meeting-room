import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Building2,
  Users,
  Calendar,
  Link as LinkIcon,
  Globe,
  Activity,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getSettingValue } from "@/lib/actions/settings";
import { formatBaht } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrgDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!org) return notFound();
  const row = org as unknown as {
    id: string;
    name: string;
    short_name: string | null;
    brand_color: string | null;
    logo_url: string | null;
    industry: string | null;
    floor: string | null;
    email_domains: string[];
    contact_email: string | null;
    contact_phone: string | null;
    contract_start: string | null;
    contract_end: string | null;
    status: string;
    notes: string | null;
    tags: string[];
  };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [members, bookings, meta, quota] = await Promise.all([
    supabase
      .from("member_organizations")
      .select(
        "member_id, tier, joined_at, is_active, member:members(id, full_name, email, phone)",
      )
      .eq("org_id", id)
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select(
        "id, reference_code, starts_at, ends_at, paid_amount, total_amount, payment_status, room:rooms(name)",
      )
      .eq("org_id", id)
      .gte("starts_at", monthStart.toISOString())
      .order("starts_at", { ascending: false }),
    getSettingValue<{ plan_tier?: string; contact_name?: string }>(
      `org.${id}.meta`,
    ),
    getSettingValue<{
      total_hours_month?: number;
      per_member_hours?: number;
    }>(`org.${id}.quota`),
  ]);

  const memberRows = ((members.data ?? []) as unknown as Array<{
    member_id: string;
    tier: string;
    joined_at: string;
    is_active: boolean;
    member: {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
    } | null;
  }>);
  const bookingRows = ((bookings.data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    paid_amount: number;
    total_amount: number;
    payment_status: string;
    room: { name: string } | null;
  }>);

  const usedHours = bookingRows.reduce((sum, b) => {
    return (
      sum +
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
        3_600_000
    );
  }, 0);
  const revenueMonth = bookingRows.reduce(
    (s, b) => s + Number(b.paid_amount ?? 0),
    0,
  );
  const totalQuota =
    quota?.total_hours_month ?? memberRows.length * (quota?.per_member_hours ?? 4);
  const pct = totalQuota > 0 ? (usedHours / totalQuota) * 100 : 0;

  return (
    <>
      <AdminTopbar
        title={row.name}
        subtitle={`Org dashboard · ${row.status}`}
      />
      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-5">
        <div>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600 mb-2"
          >
            <ChevronLeft size={12} />
            กลับสู่หน้า Users
          </Link>
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-card grid place-items-center text-white overflow-hidden shrink-0"
              style={{ background: row.brand_color ?? "#3b5bdb" }}
            >
              {row.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.logo_url}
                  alt={row.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 size={24} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold tracking-tight truncate">
                  {row.name}
                </h1>
                <Badge
                  tone={
                    row.status === "active"
                      ? "success"
                      : row.status === "pending"
                        ? "warning"
                        : row.status === "suspended"
                          ? "danger"
                          : "muted"
                  }
                >
                  {row.status}
                </Badge>
                {meta?.plan_tier && (
                  <Badge tone="primary" className="!text-[10px]">
                    {meta.plan_tier}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-ink-3">
                {[
                  row.floor && `ชั้น ${row.floor}`,
                  row.industry,
                  meta?.contact_name && `Contact: ${meta.contact_name}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              {row.email_domains.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {row.email_domains.map((d) => (
                    <span
                      key={d}
                      className="text-[10px] px-1.5 py-0.5 rounded-pill bg-surface-subtle text-ink-2 font-mono"
                    >
                      <Globe size={9} className="inline mr-1" />@{d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="สมาชิก"
            value={`${memberRows.length}`}
            hint={`Manager ${memberRows.filter((m) => m.tier === "manager").length}`}
            icon={Users}
            iconTone="primary"
          />
          <KpiCard
            label="การจองเดือนนี้"
            value={`${bookingRows.length}`}
            icon={Calendar}
          />
          <KpiCard
            label="ใช้ Quota"
            value={`${usedHours.toFixed(1)}/${totalQuota}`}
            hint={`${pct.toFixed(0)}%`}
            icon={Activity}
            iconTone={
              pct > 90 ? "danger" : pct > 80 ? "warning" : "success"
            }
          />
          <KpiCard
            label="รายได้เดือนนี้"
            value={formatBaht(revenueMonth)}
            icon={Building2}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>การจองเดือนนี้</CardTitle>
              <CardSubtitle>{bookingRows.length} รายการ</CardSubtitle>
            </CardHeader>
            {bookingRows.length === 0 ? (
              <p className="text-sm text-ink-3 text-center py-8">
                ยังไม่มีการจองเดือนนี้
              </p>
            ) : (
              <ul className="space-y-1.5">
                {bookingRows.slice(0, 15).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-input bg-surface-subtle/40 text-xs"
                  >
                    <code className="font-mono font-semibold text-primary-700 w-16 shrink-0">
                      {b.reference_code}
                    </code>
                    <span className="text-ink-3 tabular-nums w-28 shrink-0">
                      {new Date(b.starts_at).toLocaleString("th-TH", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex-1 truncate">
                      {b.room?.name ?? "—"}
                    </span>
                    <Badge
                      tone={
                        b.payment_status === "paid"
                          ? "success"
                          : b.payment_status === "deposit"
                            ? "warning"
                            : "danger"
                      }
                      className="!text-[10px]"
                    >
                      {b.payment_status}
                    </Badge>
                    <span className="tabular-nums font-medium w-20 text-right">
                      {formatBaht(Number(b.total_amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <p className="text-sm font-semibold mb-3 tracking-tight">
                ติดต่อ
              </p>
              <ul className="space-y-2 text-xs">
                {row.contact_email && (
                  <li className="flex justify-between">
                    <span className="text-ink-3">Email</span>
                    <span className="font-mono">{row.contact_email}</span>
                  </li>
                )}
                {row.contact_phone && (
                  <li className="flex justify-between">
                    <span className="text-ink-3">Phone</span>
                    <span className="font-mono">{row.contact_phone}</span>
                  </li>
                )}
                {row.contract_start && (
                  <li className="flex justify-between">
                    <span className="text-ink-3">Contract</span>
                    <span>
                      {row.contract_start} – {row.contract_end ?? "ไม่ระบุ"}
                    </span>
                  </li>
                )}
              </ul>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold tracking-tight">Invite Link</p>
                <Button variant="ghost" size="sm" iconLeft={<LinkIcon size={12} />}>
                  Copy
                </Button>
              </div>
              <code className="text-[11px] text-ink-3 font-mono break-all bg-surface-subtle p-2 rounded-input block">
                /book/{row.short_name?.toLowerCase() ?? row.id.slice(0, 8)}
              </code>
              <p className="text-[10px] text-ink-3 mt-2">
                อีเมล @
                {row.email_domains[0] ?? "..."}{" "}
                จะ verified อัตโนมัติเมื่อสมัครผ่านลิงก์นี้
              </p>
            </Card>

            <Card>
              <p className="text-sm font-semibold mb-3 tracking-tight">
                สมาชิก ({memberRows.length})
              </p>
              {memberRows.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="ยังไม่มีสมาชิก"
                  description="Import CSV หรือส่ง invite link"
                />
              ) : (
                <ul className="space-y-1.5">
                  {memberRows.slice(0, 8).map((m) => (
                    <li
                      key={m.member_id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <IconTile icon={Users} tone="muted" size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium tracking-tight truncate">
                          {m.member?.full_name ?? "—"}
                        </p>
                        <p className="text-[10px] text-ink-3 truncate">
                          {m.member?.email}
                        </p>
                      </div>
                      <Badge tone="muted" className="!text-[9px]">
                        {m.tier}
                      </Badge>
                    </li>
                  ))}
                  {memberRows.length > 8 && (
                    <li className="text-[10px] text-ink-3 text-center pt-1">
                      +{memberRows.length - 8} อื่นๆ
                    </li>
                  )}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
