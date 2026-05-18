"use client";

import { useState } from "react";
import {
  Plus,
  Copy,
  RefreshCw,
  UserCog,
  Building2,
  ShieldCheck,
  Link as LinkIcon,
  Globe,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { organizations } from "@/lib/mocks";

const tabs = [
  { id: "admins", label: "แอดมินระบบ" },
  { id: "orgs", label: "องค์กรในตึก" },
  { id: "audit", label: "Audit Log" },
];

const admins = [
  {
    id: "a1",
    name: "Admin A",
    role: "Super Admin",
    email: "admin.a@easyspace.co.th",
    twoFA: true,
    lastLogin: "ตอนนี้",
    tone: "primary",
  },
  {
    id: "a2",
    name: "Admin B",
    role: "Admin",
    email: "admin.b@easyspace.co.th",
    twoFA: true,
    lastLogin: "2 ชม.ก่อน",
    tone: "info",
  },
  {
    id: "a3",
    name: "คุณบัญชี",
    role: "Accountant",
    email: "accountant@easyspace.co.th",
    twoFA: false,
    lastLogin: "1 วันก่อน",
    tone: "warning",
  },
  {
    id: "a4",
    name: "น้อง C",
    role: "Staff",
    email: "staff.c@easyspace.co.th",
    twoFA: false,
    lastLogin: "3 วันก่อน",
    tone: "muted",
  },
];

export default function UsersPage() {
  const [tab, setTab] = useState("admins");

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
          actions={
            <Button iconLeft={<Plus size={16} />}>
              {tab === "admins" ? "เพิ่มแอดมิน" : "เพิ่มองค์กร"}
            </Button>
          }
        />

        <Card className="!p-2">
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-2.5 rounded-pill text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-primary-600 text-white"
                    : "text-ink-2 hover:bg-surface-subtle"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        {tab === "admins" && (
          <Card className="!p-0">
            <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
              <div className="col-span-4">ชื่อ</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-1 text-center">2FA</div>
              <div className="col-span-2 text-right pr-2">เข้าระบบล่าสุด</div>
            </div>
            <ul>
              {admins.map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-12 px-5 py-4 border-b border-line-soft items-center hover:bg-surface-subtle/60 transition"
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-pill bg-primary-50 text-primary-600 grid place-items-center font-semibold text-sm">
                      {a.name.slice(0, 2)}
                    </span>
                    <div>
                      <p className="font-semibold tracking-tight">{a.name}</p>
                      <p className="text-[11px] text-ink-3">{a.role}</p>
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-ink-2 truncate">
                    {a.email}
                  </div>
                  <div className="col-span-2">
                    <Badge
                      tone={a.role === "Super Admin" ? "primary" : "muted"}
                    >
                      {a.role}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-center">
                    {a.twoFA ? (
                      <ShieldCheck size={18} className="text-emerald-500 mx-auto" strokeWidth={1.75} />
                    ) : (
                      <span className="text-[11px] text-ink-3">—</span>
                    )}
                  </div>
                  <div className="col-span-2 text-right text-xs text-ink-3 pr-2">
                    {a.lastLogin}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "orgs" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {organizations.map((o) => {
              const pct = (o.quotaUsed / o.quotaTotal) * 100;
              return (
                <Card key={o.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2.5">
                      <IconTile icon={Building2} tone="primary" />
                      <div>
                        <CardTitle>{o.name}</CardTitle>
                        <CardSubtitle>{o.floor} · {o.industry}</CardSubtitle>
                      </div>
                    </div>
                    <Badge tone="success">Active</Badge>
                  </CardHeader>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-ink-3">สมาชิก</span>
                      <span className="font-semibold tabular-nums">
                        {o.members} คน · active {o.activeToday}
                      </span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-ink-3">Quota</span>
                        <span className="tabular-nums font-medium">
                          {o.quotaUsed}/{o.quotaTotal} ชม.
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
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-3">สัญญาถึง</span>
                      <span>{o.contractEnd}</span>
                    </div>
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
                    <Button variant="ghost" size="sm" iconLeft={<Globe size={14} />}>
                      Dashboard
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "audit" && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Audit Log</CardTitle>
                <CardSubtitle>ทุก action ของแอดมิน · เก็บ 365 วัน</CardSubtitle>
              </div>
            </CardHeader>
            <ul className="space-y-3 text-sm">
              {[
                { time: "14:22", actor: "Admin A", action: "booking.cancelled", target: "BK001" },
                { time: "13:50", actor: "Admin A", action: "payment.added", target: "+฿200" },
                { time: "13:30", actor: "Admin B", action: "login.success", target: "IP 103.x" },
                { time: "12:00", actor: "Admin B", action: "promo.created", target: "SUMMER10" },
                { time: "09:15", actor: "Admin A", action: "user.role.changed", target: "B → admin" },
              ].map((row, i) => (
                <li
                  key={i}
                  className="grid grid-cols-12 py-2.5 border-b border-line-soft last:border-0 items-center"
                >
                  <span className="col-span-2 text-xs text-ink-3 tabular-nums">
                    {row.time}
                  </span>
                  <span className="col-span-3 font-medium">{row.actor}</span>
                  <span className="col-span-4 font-mono text-xs text-primary-600">
                    {row.action}
                  </span>
                  <span className="col-span-3 text-xs text-ink-2 text-right">
                    {row.target}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
