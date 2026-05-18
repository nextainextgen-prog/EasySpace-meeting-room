import {
  Plus,
  Building2,
  ShieldCheck,
  Link as LinkIcon,
  Globe,
  UserCog,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listAdmins,
  listOrganizations,
  listAuditLog,
} from "@/lib/data";
import { relativeFromNow } from "@/lib/format";
import { UsersTabs } from "./tabs";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  accountant: "Accountant",
  marketing: "Marketing",
  viewer: "Viewer",
};

const STATUS_TONE: Record<string, "success" | "warning" | "muted"> = {
  active: "success",
  pending: "warning",
  suspended: "warning",
  expired: "muted",
  archived: "muted",
};

export default async function UsersPage() {
  const [admins, orgs, audit] = await Promise.all([
    listAdmins(),
    listOrganizations(),
    listAuditLog(20),
  ]);

  const adminsView = (
    <Card className="!p-0">
      <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
        <div className="col-span-4">ชื่อ</div>
        <div className="col-span-3">Email</div>
        <div className="col-span-2">Role</div>
        <div className="col-span-1 text-center">2FA</div>
        <div className="col-span-2 text-right pr-2">เข้าระบบล่าสุด</div>
      </div>
      {admins.length === 0 ? (
        <div className="p-10">
          <EmptyState
            icon={UserCog}
            title="ยังไม่มีแอดมิน"
            description="เพิ่มผู้ใช้ผ่าน Supabase Auth + ตั้ง role"
          />
        </div>
      ) : (
        <ul>
          {admins.map((a) => (
            <li
              key={a.id}
              className="grid grid-cols-12 px-5 py-4 border-b border-line-soft items-center hover:bg-surface-subtle/60 transition"
            >
              <div className="col-span-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-pill bg-primary-50 text-primary-600 grid place-items-center font-semibold text-sm overflow-hidden">
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.avatar_url}
                      alt={a.full_name ?? a.email}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (a.full_name ?? a.email).slice(0, 2).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight truncate">
                    {a.full_name ?? a.email.split("@")[0]}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {ROLE_LABEL[a.role]}
                  </p>
                </div>
              </div>
              <div className="col-span-3 text-sm text-ink-2 truncate">
                {a.email}
              </div>
              <div className="col-span-2">
                <Badge
                  tone={a.role === "super_admin" ? "primary" : "muted"}
                >
                  {ROLE_LABEL[a.role]}
                </Badge>
              </div>
              <div className="col-span-1 text-center">
                {a.two_factor_enabled ? (
                  <ShieldCheck
                    size={18}
                    className="text-emerald-500 mx-auto"
                    strokeWidth={1.75}
                  />
                ) : (
                  <span className="text-[11px] text-ink-3">—</span>
                )}
              </div>
              <div className="col-span-2 text-right text-xs text-ink-3 pr-2 tabular-nums">
                {a.last_login_at
                  ? relativeFromNow(a.last_login_at)
                  : "ยังไม่เคย"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const orgsView =
    orgs.length === 0 ? (
      <EmptyState
        icon={Building2}
        title="ยังไม่มีองค์กรในตึก"
        description="เพิ่มองค์กร (บริษัทผู้เช่า) เพื่อให้พนักงานเข้าใช้ผ่าน invite link"
        action={<Button iconLeft={<Plus size={16} />}>เพิ่มองค์กร</Button>}
      />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {orgs.map((o) => {
          const pct = o.quota_total_month
            ? (o.quota_used_month / o.quota_total_month) * 100
            : 0;
          return (
            <Card key={o.id}>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <IconTile icon={Building2} tone="primary" />
                  <div>
                    <CardTitle>{o.name}</CardTitle>
                    <CardSubtitle>
                      {[o.floor, o.industry].filter(Boolean).join(" · ") ||
                        "—"}
                    </CardSubtitle>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[o.status] ?? "muted"}>
                  {o.status}
                </Badge>
              </CardHeader>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-3">สมาชิก</span>
                  <span className="font-semibold tabular-nums">
                    {o.member_count} คน · active วันนี้ {o.active_today}
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-3">Quota เดือนนี้</span>
                    <span className="tabular-nums font-medium">
                      {o.quota_used_month.toFixed(1)}/{o.quota_total_month} ชม.
                    </span>
                  </div>
                  <div className="h-2 rounded-pill bg-surface-subtle overflow-hidden">
                    <div
                      className={`h-full ${
                        pct > 90
                          ? "bg-red-500"
                          : pct > 80
                            ? "bg-amber-500"
                            : "bg-primary-600"
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
                {o.contract_end && (
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-3">สัญญาถึง</span>
                    <span>{o.contract_end}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-5 border-t border-line-soft flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  iconLeft={<LinkIcon size={14} />}
                >
                  Invite link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Globe size={14} />}
                >
                  Dashboard
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );

  const auditView = (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Audit Log</CardTitle>
          <CardSubtitle>
            ทุก action ของแอดมิน · {audit.length} รายการล่าสุด
          </CardSubtitle>
        </div>
      </CardHeader>
      {audit.length === 0 ? (
        <p className="text-sm text-ink-3 text-center py-8 tracking-tight">
          ยังไม่มี audit event
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {audit.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-12 gap-2 py-2.5 border-b border-line-soft last:border-0 items-center"
            >
              <span className="col-span-2 text-xs text-ink-3 tabular-nums">
                {new Date(row.created_at).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="col-span-3 font-medium truncate">
                {row.actor_name ?? "system"}
              </span>
              <span className="col-span-4 font-mono text-xs text-primary-600 truncate">
                {row.action}
              </span>
              <span className="col-span-3 text-xs text-ink-2 text-right truncate">
                {row.target_type}
                {row.target_id ? ` #${row.target_id.slice(0, 6)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <>
      <AdminTopbar
        title="ผู้ใช้งาน"
        subtitle="แอดมินระบบ · องค์กรในตึก · Audit Log"
      />

      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-5">
        <PageHeader
          title="ผู้ใช้งานทั้งหมด"
          description="Role granular · 2FA · Invite link · Quota"
          actions={<Button iconLeft={<Plus size={16} />}>เพิ่ม</Button>}
        />

        <UsersTabs admins={adminsView} orgs={orgsView} audit={auditView} />
      </div>
    </>
  );
}
