"use client";

import { useState } from "react";
import {
  Plus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Download,
  MoreVertical,
  X,
  Save,
  Bell,
  RefreshCw,
  Link as LinkIcon,
  ArrowUpRight,
  Building2,
  Lock,
  AlertTriangle,
  Globe,
  Activity,
  Send,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { relativeFromNow } from "@/lib/format";
import {
  inviteAdmin,
  updateAdmin,
  suspendAdmin,
  restoreAdmin,
  resendInviteEmail,
} from "@/lib/actions/admin-users";
import {
  upsertOrganization,
  setOrgStatus,
  broadcastToOrg,
  bulkImportMembers,
} from "@/lib/actions/organizations";

type TabId = "admins" | "orgs" | "audit";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  accountant: "Accountant",
  marketing: "Marketing",
  viewer: "Viewer",
  owner: "Owner",
};

const ORG_STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "muted"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  expired: "muted",
  archived: "muted",
};

const ROLE_OPTIONS = [
  "super_admin",
  "admin",
  "staff",
  "accountant",
  "marketing",
  "viewer",
] as const;

const ORG_STATUS_OPTIONS = [
  "active",
  "pending",
  "suspended",
  "expired",
  "archived",
] as const;

export type AdminRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
};

export type AdminMeta = {
  two_factor_required?: boolean;
  force_password_change?: boolean;
  ip_whitelist?: string[];
  failed_attempts?: number;
  session_count?: number;
  permissions_override?: Record<string, boolean>;
};

export type OrgRow = {
  id: string;
  name: string;
  short_name: string | null;
  industry: string | null;
  floor: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  contract_start: string | null;
  contract_end: string | null;
  brand_color: string | null;
  email_domains: string[];
  tags: string[];
  logo_url: string | null;
  member_count: number;
  active_today: number;
  quota_used_month: number;
  quota_total_month: number;
};

export type AuditEntry = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export function UsersBoard({
  admins,
  adminMeta,
  orgs,
  audit,
}: {
  admins: AdminRow[];
  adminMeta: Record<string, AdminMeta>;
  orgs: OrgRow[];
  audit: AuditEntry[];
}) {
  const [tab, setTab] = useState<TabId>("admins");
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <Card className="!p-2">
        <div className="flex gap-1">
          {(
            [
              { id: "admins", label: "แอดมินระบบ", count: admins.length },
              { id: "orgs", label: "องค์กรในตึก", count: orgs.length },
              { id: "audit", label: "Audit Log", count: audit.length },
            ] as Array<{ id: TabId; label: string; count: number }>
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-5 py-2.5 rounded-pill text-sm font-medium tracking-tight transition inline-flex items-center gap-2",
                tab === t.id
                  ? "bg-primary-600 text-white"
                  : "text-ink-2 hover:bg-surface-subtle",
              )}
            >
              {t.label}
              <span className="text-[11px] opacity-70 tabular-nums">
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {tab === "admins" && (
        <AdminsTab
          admins={admins}
          adminMeta={adminMeta}
          notify={notify}
        />
      )}
      {tab === "orgs" && <OrgsTab orgs={orgs} notify={notify} />}
      {tab === "audit" && <AuditTab audit={audit} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-pill bg-ink-1 text-white text-xs shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

/* ────────────────────────────── Admins Tab ───────────────────────────── */
function AdminsTab({
  admins,
  adminMeta,
  notify,
}: {
  admins: AdminRow[];
  adminMeta: Record<string, AdminMeta>;
  notify: (m: string) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");

  const filtered = admins.filter((a) => {
    if (roleFilter && a.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !`${a.full_name ?? ""} ${a.email} ${a.phone ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
    }
    return true;
  });

  async function onSuspend(id: string, currentlyActive: boolean) {
    if (currentlyActive) {
      const reason = prompt("เหตุผลในการระงับ?");
      if (!reason) return;
      const r = await suspendAdmin(id, reason);
      notify(r.ok ? "ระงับเรียบร้อย" : `ไม่สำเร็จ: ${r.error}`);
    } else {
      const r = await restoreAdmin(id);
      notify(r.ok ? "เปิดใช้งานเรียบร้อย" : `ไม่สำเร็จ: ${r.error}`);
    }
  }

  async function onResendInvite(id: string) {
    const r = await resendInviteEmail(id);
    notify(r.ok ? "ส่งอีเมล invite ใหม่แล้ว" : `ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <Input
            iconLeft={<Search size={14} />}
            placeholder="ค้นหา ชื่อ / email / เบอร์"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!h-10"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="!h-10 !w-48"
        >
          <option value="">ทุกบทบาท</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Button
          iconLeft={<Plus size={14} />}
          size="sm"
          onClick={() => setInviteOpen(true)}
        >
          เพิ่มแอดมิน
        </Button>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
                <th className="text-left px-4 py-3">ชื่อ</th>
                <th className="text-left px-3 py-3">บทบาท</th>
                <th className="text-center px-3 py-3">2FA</th>
                <th className="text-center px-3 py-3">Failed</th>
                <th className="text-center px-3 py-3">Sessions</th>
                <th className="text-left px-3 py-3">Last IP</th>
                <th className="text-left px-3 py-3">เข้าระบบล่าสุด</th>
                <th className="text-center px-3 py-3">สถานะ</th>
                <th className="text-right px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12">
                    <EmptyState
                      icon={ShieldAlert}
                      title="ไม่พบแอดมิน"
                      description="ลองล้าง filter หรือกด 'เพิ่มแอดมิน'"
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const meta = adminMeta[a.id] ?? {};
                  const failed = meta.failed_attempts ?? 0;
                  const sessions = meta.session_count ?? 0;
                  const ipCountry = a.last_login_ip
                    ? guessCountryFromIp(a.last_login_ip)
                    : null;
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-line-soft hover:bg-surface-subtle/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-pill bg-primary-50 text-primary-700 grid place-items-center font-semibold text-xs overflow-hidden shrink-0">
                            {a.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.avatar_url}
                                alt={a.email}
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
                            <p className="text-[11px] text-ink-3 truncate">
                              {a.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          tone={
                            a.role === "super_admin"
                              ? "primary"
                              : a.role === "admin"
                                ? "info"
                                : "muted"
                          }
                          className="!text-[10px]"
                        >
                          {ROLE_LABEL[a.role] ?? a.role}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {a.two_factor_enabled ? (
                          <ShieldCheck
                            size={14}
                            className="text-emerald-500 mx-auto"
                          />
                        ) : meta.two_factor_required ? (
                          <Badge tone="warning" className="!text-[9px]">
                            required
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {failed > 0 ? (
                          <Badge
                            tone={failed >= 3 ? "danger" : "warning"}
                            className="!text-[10px] tabular-nums"
                          >
                            {failed}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-ink-3">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-xs tabular-nums">
                        {sessions}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-3 font-mono">
                        {a.last_login_ip ?? "—"}
                        {ipCountry && (
                          <span className="ml-1 text-[10px] text-ink-3">
                            {ipCountry}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-3 tabular-nums">
                        {a.last_login_at
                          ? relativeFromNow(a.last_login_at)
                          : "ยังไม่เคย"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {a.is_active ? (
                          <Badge tone="success" className="!text-[10px]">
                            active
                          </Badge>
                        ) : (
                          <Badge tone="danger" className="!text-[10px]">
                            suspended
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => setEditing(a)}
                          className="text-xs text-primary-600 hover:underline mr-3"
                        >
                          แก้ไข
                        </button>
                        <DropdownActions>
                          <button
                            onClick={() => onResendInvite(a.id)}
                            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                          >
                            <RefreshCw size={11} className="inline mr-1" />
                            ส่ง invite ใหม่
                          </button>
                          <button
                            onClick={() => onSuspend(a.id, a.is_active)}
                            className={cn(
                              "block w-full text-left px-3 py-1.5 text-xs",
                              a.is_active
                                ? "text-red-600 hover:bg-red-50"
                                : "text-emerald-700 hover:bg-emerald-50",
                            )}
                          >
                            <Lock size={11} className="inline mr-1" />
                            {a.is_active ? "ระงับ" : "เปิดใช้งาน"}
                          </button>
                        </DropdownActions>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {inviteOpen && (
        <AdminFormModal
          mode="invite"
          onClose={() => setInviteOpen(false)}
          onSaved={() => {
            setInviteOpen(false);
            notify("เพิ่มแอดมินเรียบร้อย");
          }}
        />
      )}
      {editing && (
        <AdminFormModal
          mode="edit"
          initial={{
            ...editing,
            meta: adminMeta[editing.id] ?? {},
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกเรียบร้อย");
          }}
        />
      )}
    </>
  );
}

function DropdownActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-7 h-7 rounded-pill text-ink-3 hover:bg-surface-subtle grid place-items-center"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-40 surface-card !p-0 overflow-hidden shadow-pop">
          {children}
        </div>
      )}
    </div>
  );
}

function AdminFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "invite" | "edit";
  initial?: AdminRow & { meta: AdminMeta };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial?.id,
    email: initial?.email ?? "",
    fullName: initial?.full_name ?? "",
    phone: initial?.phone ?? "",
    role: (initial?.role ?? "admin") as (typeof ROLE_OPTIONS)[number],
    isActive: initial?.is_active ?? true,
    twoFactorRequired: initial?.meta?.two_factor_required ?? false,
    forcePasswordChange: initial?.meta?.force_password_change ?? true,
    ipWhitelist: (initial?.meta?.ip_whitelist ?? []).join(", "),
    permissionsOverride: JSON.stringify(
      initial?.meta?.permissions_override ?? {},
      null,
      2,
    ),
    sendInviteEmail: true,
  });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    let perms: Record<string, boolean> | undefined;
    try {
      perms = form.permissionsOverride
        ? JSON.parse(form.permissionsOverride)
        : {};
    } catch (er) {
      setErr(`permissions JSON: ${(er as Error).message}`);
      setPending(false);
      return;
    }
    const ipList = form.ipWhitelist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (mode === "invite") {
      const r = await inviteAdmin({
        email: form.email,
        fullName: form.fullName,
        phone: form.phone || undefined,
        role: form.role,
        twoFactorRequired: form.twoFactorRequired,
        forcePasswordChange: form.forcePasswordChange,
        ipWhitelist: ipList,
        permissionsOverride: perms,
        sendInviteEmail: form.sendInviteEmail,
      });
      setPending(false);
      if (r.ok) onSaved();
      else
        setErr(
          r.error === "auth_required"
            ? "Service role ยังไม่ได้ตั้งใน env — ขอ Supabase Service Role Key ใน Vercel ก่อน"
            : r.error,
        );
    } else if (form.id) {
      const r = await updateAdmin({
        id: form.id,
        fullName: form.fullName,
        phone: form.phone,
        role: form.role,
        isActive: form.isActive,
        twoFactorRequired: form.twoFactorRequired,
        forcePasswordChange: form.forcePasswordChange,
        ipWhitelist: ipList,
        permissionsOverride: perms,
      });
      setPending(false);
      if (r.ok) onSaved();
      else setErr(r.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4 overflow-y-auto">
      <form
        onSubmit={save}
        className="w-full max-w-xl surface-card !p-0 overflow-hidden my-4"
      >
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight">
              {mode === "invite" ? "เพิ่มแอดมินใหม่" : "แก้ไขแอดมิน"}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {mode === "invite"
                ? "ระบบจะส่งอีเมล invite ผ่าน Supabase Auth"
                : "อัปเดตข้อมูล + permission override"}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                disabled={mode === "edit"}
              />
            </div>
            <div>
              <Label>บทบาท</Label>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as (typeof ROLE_OPTIONS)[number],
                  })
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ชื่อ-นามสกุล *</Label>
              <Input
                value={form.fullName}
                onChange={(e) =>
                  setForm({ ...form, fullName: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>เบอร์โทร</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-line-soft">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.twoFactorRequired}
                onChange={(e) =>
                  setForm({ ...form, twoFactorRequired: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              <ShieldCheck size={13} className="text-emerald-600" />
              บังคับเปิด 2FA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.forcePasswordChange}
                onChange={(e) =>
                  setForm({ ...form, forcePasswordChange: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              <Lock size={13} className="text-ink-3" />
              บังคับเปลี่ยน password ครั้งแรก
            </label>
            {mode === "invite" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sendInviteEmail}
                  onChange={(e) =>
                    setForm({ ...form, sendInviteEmail: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary-600"
                />
                <Bell size={13} className="text-primary-600" />
                ส่งอีเมล invite ทันที
              </label>
            )}
            {mode === "edit" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm({ ...form, isActive: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary-600"
                />
                เปิดใช้งาน
              </label>
            )}
          </div>

          <div>
            <Label>IP Whitelist (คั่นด้วย ,)</Label>
            <Input
              value={form.ipWhitelist}
              onChange={(e) =>
                setForm({ ...form, ipWhitelist: e.target.value })
              }
              placeholder="203.0.113.0/24, 198.51.100.10"
            />
            <p className="text-[10px] text-ink-3 mt-1">
              เว้นว่าง = อนุญาตทุก IP · รองรับ CIDR
            </p>
          </div>

          <div>
            <Label>Permission Override (JSON)</Label>
            <Textarea
              rows={4}
              value={form.permissionsOverride}
              onChange={(e) =>
                setForm({ ...form, permissionsOverride: e.target.value })
              }
              className="!font-mono !text-[11px]"
              placeholder='{"finance.expense.delete": true}'
            />
            <p className="text-[10px] text-ink-3 mt-1">
              Override permission ของบทบาท · key = permission id, value = true/false
            </p>
          </div>

          {err && (
            <p className="text-xs text-red-600 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {err}
            </p>
          )}
        </div>

        <div className="px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconLeft={<Save size={12} />}
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Cheap IP-to-country: only flag obvious local IPs. */
function guessCountryFromIp(ip: string): string | null {
  if (ip.startsWith("127.") || ip === "::1") return "local";
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return "lan";
  return null;
}

/* ────────────────────────────── Orgs Tab ───────────────────────────── */
function OrgsTab({
  orgs,
  notify,
}: {
  orgs: OrgRow[];
  notify: (m: string) => void;
}) {
  const [editing, setEditing] = useState<OrgRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [broadcastOrg, setBroadcastOrg] = useState<OrgRow | null>(null);
  const [importOrg, setImportOrg] = useState<OrgRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filtered = orgs.filter(
    (o) => !statusFilter || o.status === statusFilter,
  );

  async function onStatusChange(id: string, status: string) {
    const reason =
      status === "suspended" || status === "archived"
        ? prompt("เหตุผล?") ?? undefined
        : undefined;
    const r = await setOrgStatus(
      id,
      status as "active" | "pending" | "suspended" | "expired" | "archived",
      reason,
    );
    notify(r.ok ? "เปลี่ยนสถานะแล้ว" : `ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          {(["", ...ORG_STATUS_OPTIONS] as const).map((s) => {
            const count = s
              ? orgs.filter((o) => o.status === s).length
              : orgs.length;
            return (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-medium border transition",
                  statusFilter === s
                    ? "bg-primary-600 border-primary-600 text-white"
                    : "bg-white border-line text-ink-2 hover:bg-surface-subtle",
                )}
              >
                {s || "ทั้งหมด"}
                <span className="text-[10px] opacity-70 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          iconLeft={<Plus size={14} />}
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          เพิ่มองค์กร
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="ยังไม่มีองค์กรในตึก"
          description="เพิ่มองค์กร (บริษัทผู้เช่า) เพื่อให้พนักงานเข้าใช้ผ่าน invite link"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((o) => {
            const pct = o.quota_total_month
              ? (o.quota_used_month / o.quota_total_month) * 100
              : 0;
            const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${o.short_name?.toLowerCase() ?? o.id.slice(0, 8)}`;
            return (
              <Card key={o.id}>
                <div
                  className="h-1.5 rounded-full mb-3"
                  style={{ background: o.brand_color ?? "#3b5bdb" }}
                />
                <CardHeader>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {o.logo_url ? (
                      <span className="w-10 h-10 rounded-input overflow-hidden bg-surface-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={o.logo_url}
                          alt={o.name}
                          className="w-full h-full object-cover"
                        />
                      </span>
                    ) : (
                      <IconTile icon={Building2} tone="primary" />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="truncate">{o.name}</CardTitle>
                      <CardSubtitle>
                        {[o.floor, o.industry].filter(Boolean).join(" · ") ||
                          "—"}
                      </CardSubtitle>
                    </div>
                  </div>
                  <Badge tone={ORG_STATUS_TONE[o.status] ?? "muted"}>
                    {o.status}
                  </Badge>
                </CardHeader>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-3">สมาชิก</span>
                    <span className="font-semibold tabular-nums">
                      {o.member_count} · active วันนี้ {o.active_today}
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
                        className={`h-full ${pct > 90 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-primary-600"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                  {o.email_domains.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {o.email_domains.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="text-[10px] px-1.5 py-0.5 rounded-pill bg-surface-subtle text-ink-3 font-mono"
                        >
                          @{d}
                        </span>
                      ))}
                    </div>
                  )}
                  {o.contract_end && (
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-3">สัญญาถึง</span>
                      <span>{o.contract_end}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-line-soft grid grid-cols-3 gap-1.5">
                  <Link href={`/admin/users/orgs/${o.id}`}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      iconLeft={<ArrowUpRight size={12} />}
                    >
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<LinkIcon size={12} />}
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                      notify("คัดลอก invite link แล้ว");
                    }}
                  >
                    Invite
                  </Button>
                  <DropdownActions>
                    <button
                      onClick={() => setEditing(o)}
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                    >
                      แก้ไขข้อมูล
                    </button>
                    <button
                      onClick={() => setBroadcastOrg(o)}
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                    >
                      <Send size={11} className="inline mr-1" />
                      Broadcast
                    </button>
                    <button
                      onClick={() => setImportOrg(o)}
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                    >
                      <Upload size={11} className="inline mr-1" />
                      Bulk import CSV
                    </button>
                    <div className="h-px bg-line-soft" />
                    {ORG_STATUS_OPTIONS.filter((s) => s !== o.status).map(
                      (s) => (
                        <button
                          key={s}
                          onClick={() => onStatusChange(o.id, s)}
                          className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-subtle"
                        >
                          เปลี่ยนเป็น <b>{s}</b>
                        </button>
                      ),
                    )}
                  </DropdownActions>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {createOpen && (
        <OrgFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            notify("เพิ่มองค์กรเรียบร้อย");
          }}
        />
      )}
      {editing && (
        <OrgFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกองค์กรเรียบร้อย");
          }}
        />
      )}
      {broadcastOrg && (
        <BroadcastModal
          org={broadcastOrg}
          onClose={() => setBroadcastOrg(null)}
          onSent={(n) => {
            setBroadcastOrg(null);
            notify(`Broadcast ส่งให้ ${n} คน`);
          }}
        />
      )}
      {importOrg && (
        <BulkImportModal
          org={importOrg}
          onClose={() => setImportOrg(null)}
          onDone={(n, created, attached) => {
            setImportOrg(null);
            notify(`Import ${n} แถว · ใหม่ ${created} · ผูก ${attached}`);
          }}
        />
      )}
    </>
  );
}

function OrgFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: OrgRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial?.id,
    name: initial?.name ?? "",
    short_name: initial?.short_name ?? "",
    brand_color: initial?.brand_color ?? "#3b5bdb",
    logo_url: initial?.logo_url ?? "",
    industry: initial?.industry ?? "",
    floor: initial?.floor ?? "",
    email_domains: (initial?.email_domains ?? []).join(", "),
    contact_phone: initial?.contact_phone ?? "",
    contact_email: initial?.contact_email ?? "",
    contact_name: "",
    contract_start: initial?.contract_start ?? "",
    contract_end: initial?.contract_end ?? "",
    status: (initial?.status ?? "active") as
      | "active"
      | "pending"
      | "suspended"
      | "expired"
      | "archived",
    plan_tier: "basic" as "free" | "basic" | "pro" | "enterprise",
    tags: (initial?.tags ?? []).join(", "),
    notes: "",
  });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    const r = await upsertOrganization({
      id: form.id,
      name: form.name,
      short_name: form.short_name || null,
      brand_color: form.brand_color || null,
      logo_url: form.logo_url || null,
      industry: form.industry || null,
      floor: form.floor || null,
      email_domains: form.email_domains
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      contact_name: form.contact_name || null,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      status: form.status,
      plan_tier: form.plan_tier,
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes: form.notes || null,
    });
    setPending(false);
    if (r.ok) onSaved();
    else setErr(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4 overflow-y-auto">
      <form
        onSubmit={save}
        className="w-full max-w-2xl surface-card !p-0 overflow-hidden my-4"
      >
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight text-lg">
              {mode === "create" ? "เพิ่มองค์กรใหม่" : "แก้ไของค์กร"}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              Logo · brand · contract · email domain · plan tier
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ชื่อองค์กร *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>ชื่อย่อ (สำหรับ slug)</Label>
              <Input
                value={form.short_name}
                onChange={(e) =>
                  setForm({ ...form, short_name: e.target.value })
                }
                placeholder="bni / acme"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Logo URL</Label>
              <Input
                value={form.logo_url}
                onChange={(e) =>
                  setForm({ ...form, logo_url: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>Brand color</Label>
              <div className="flex gap-2">
                <Input
                  value={form.brand_color}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                />
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                  className="h-11 w-12 rounded-input border border-line"
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as typeof form.status,
                  })
                }
              >
                {ORG_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Industry</Label>
              <Input
                value={form.industry}
                onChange={(e) =>
                  setForm({ ...form, industry: e.target.value })
                }
                placeholder="Software / Marketing / Legal"
              />
            </div>
            <div>
              <Label>Floor</Label>
              <Input
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
              />
            </div>
            <div>
              <Label>Plan tier</Label>
              <Select
                value={form.plan_tier}
                onChange={(e) =>
                  setForm({
                    ...form,
                    plan_tier: e.target.value as typeof form.plan_tier,
                  })
                }
              >
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>
              <span className="inline-flex items-center gap-1">
                <Globe size={11} /> Email domains (คั่นด้วย ,)
              </span>
            </Label>
            <Input
              value={form.email_domains}
              onChange={(e) =>
                setForm({ ...form, email_domains: e.target.value })
              }
              placeholder="acme.com, acme.co.th"
            />
            <p className="text-[10px] text-ink-3 mt-1">
              สมาชิกสมัครด้วย email โดเมนนี้จะ verify อัตโนมัติ
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Primary contact name</Label>
              <Input
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.contact_phone}
                onChange={(e) =>
                  setForm({ ...form, contact_phone: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm({ ...form, contact_email: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract start</Label>
              <Input
                type="date"
                value={form.contract_start}
                onChange={(e) =>
                  setForm({ ...form, contract_start: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Contract end</Label>
              <Input
                type="date"
                value={form.contract_end}
                onChange={(e) =>
                  setForm({ ...form, contract_end: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <Label>Tags (คั่นด้วย ,)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="VIP, BNI, anchor"
            />
          </div>

          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {err && (
            <p className="text-xs text-red-600">{err}</p>
          )}
        </div>

        <div className="px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconLeft={<Save size={12} />}
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function BroadcastModal({
  org,
  onClose,
  onSent,
}: {
  org: OrgRow;
  onClose: () => void;
  onSent: (recipients: number) => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    const r = await broadcastToOrg({ orgId: org.id, message });
    setPending(false);
    if (r.ok) onSent(r.recipients);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4">
      <div className="w-full max-w-md surface-card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold tracking-tight">
              Broadcast: {org.name}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              ส่งให้ {org.member_count} สมาชิก (ผ่าน Telegram &quot;ติดตามสถานะ&quot;)
            </p>
          </div>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <Label>ข้อความ</Label>
        <Textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="ประชาสัมพันธ์... เช่น 'พรุ่งนี้ปิดปรับปรุง 13:00-15:00'"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Send size={12} />}
            disabled={pending || !message.trim()}
            onClick={send}
          >
            {pending ? "ส่ง..." : "Broadcast"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkImportModal({
  org,
  onClose,
  onDone,
}: {
  org: OrgRow;
  onClose: () => void;
  onDone: (total: number, created: number, attached: number) => void;
}) {
  const [csv, setCsv] = useState(
    "email,full_name,phone,tier\njohn@acme.com,John Doe,0812345678,member",
  );
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setErr(null);
    const r = await bulkImportMembers({ orgId: org.id, csv });
    setPending(false);
    if (r.ok) onDone(r.total, r.created, r.attached);
    else setErr(r.error);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4">
      <div className="w-full max-w-lg surface-card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold tracking-tight">
              Bulk Import: {org.name}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              CSV: email, full_name, phone, tier
            </p>
          </div>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <input
          type="file"
          accept=".csv"
          onChange={onFile}
          className="mb-3 text-xs"
        />
        <Textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="!font-mono !text-[11px]"
        />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Upload size={12} />}
            disabled={pending}
            onClick={run}
          >
            {pending ? "Import..." : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Audit Tab ───────────────────────────── */
function AuditTab({ audit }: { audit: AuditEntry[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);

  const filtered = audit.filter((a) => {
    if (actionFilter && a.action !== actionFilter) return false;
    if (from && new Date(a.created_at) < new Date(from)) return false;
    if (to && new Date(a.created_at) > new Date(`${to}T23:59:59`)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${a.actor_name ?? ""} ${a.action} ${a.target_type} ${a.target_id ?? ""} ${a.reason ?? ""} ${a.ip_address ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const actionSet = Array.from(new Set(audit.map((a) => a.action))).sort();

  function exportCSV() {
    const header = [
      "เวลา",
      "ผู้ดำเนินการ",
      "บทบาท",
      "Action",
      "Target",
      "Reason",
      "IP",
      "UA",
    ];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          new Date(r.created_at).toISOString(),
          `"${(r.actor_name ?? "").replace(/"/g, '""')}"`,
          r.actor_role ?? "",
          r.action,
          `${r.target_type}${r.target_id ? `#${r.target_id.slice(0, 8)}` : ""}`,
          `"${(r.reason ?? "").replace(/"/g, '""')}"`,
          r.ip_address ?? "",
          `"${(r.user_agent ?? "").replace(/"/g, '""')}"`,
        ].join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            iconLeft={<Search size={14} />}
            placeholder="actor / action / target / reason / IP"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!h-10"
          />
        </div>
        <Select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="!h-10 !w-48"
        >
          <option value="">ทุก action</option>
          {actionSet.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="!h-10 !w-40"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="!h-10 !w-40"
        />
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Filter size={13} />}
          onClick={() => {
            setSearch("");
            setActionFilter("");
            setFrom("");
            setTo("");
          }}
        >
          ล้าง
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Download size={13} />}
          onClick={exportCSV}
        >
          Export
        </Button>
      </div>

      <Card>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em]">
            {filtered.length} จาก {audit.length} รายการ
          </p>
          <Link
            href="/admin/audit-log"
            className="text-[11px] text-primary-600 hover:underline inline-flex items-center gap-1"
          >
            หน้า audit ฉบับเต็ม <ArrowUpRight size={11} />
          </Link>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-8">
            ไม่พบรายการที่ตรงกัน
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((a) => (
              <li
                key={a.id}
                onClick={() => setOpenEntry(a)}
                className="grid grid-cols-12 gap-2 py-2 px-2 border-b border-line-soft last:border-0 items-center hover:bg-primary-50/20 cursor-pointer rounded-input"
              >
                <span className="col-span-2 text-xs text-ink-3 tabular-nums">
                  {new Date(a.created_at).toLocaleString("th-TH", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="col-span-2 font-medium truncate text-xs">
                  {a.actor_name ?? "system"}
                  {a.actor_role && (
                    <span className="text-ink-3 ml-1">
                      · {a.actor_role}
                    </span>
                  )}
                </span>
                <span className="col-span-3 font-mono text-xs text-primary-700 truncate">
                  {a.action}
                </span>
                <span className="col-span-3 text-xs text-ink-2 truncate">
                  {a.target_type}
                  {a.target_id && (
                    <span className="text-ink-3 ml-1 font-mono">
                      #{a.target_id.slice(0, 6)}
                    </span>
                  )}
                </span>
                <span className="col-span-1 text-[10px] text-ink-3 font-mono truncate">
                  {a.ip_address ?? "—"}
                </span>
                <span className="col-span-1 text-right">
                  <Activity size={11} className="text-ink-3 inline" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {openEntry && (
        <AuditDetailModal
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </>
  );
}

function AuditDetailModal({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4">
      <div className="w-full max-w-xl surface-card !p-0 overflow-hidden">
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight">
              <code className="font-mono text-primary-700">
                {entry.action}
              </code>
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {new Date(entry.created_at).toLocaleString("th-TH")}
            </p>
          </div>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Actor" value={entry.actor_name ?? "system"} />
            <Info label="Role" value={entry.actor_role ?? "—"} />
            <Info
              label="Target"
              value={
                <span>
                  {entry.target_type}
                  {entry.target_id && (
                    <span className="text-ink-3 font-mono text-xs ml-1">
                      #{entry.target_id.slice(0, 12)}
                    </span>
                  )}
                </span>
              }
            />
            <Info
              label="IP"
              value={
                <code className="font-mono text-xs">
                  {entry.ip_address ?? "—"}
                </code>
              }
            />
          </div>
          {entry.reason && <Info label="Reason" value={entry.reason} />}
          {entry.user_agent && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                User Agent
              </p>
              <p className="text-[11px] text-ink-2 break-words font-mono">
                {entry.user_agent}
              </p>
            </div>
          )}
          {entry.changes && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                Changes / Before-After
              </p>
              <pre className="text-[11px] bg-surface-subtle/60 rounded-input p-2 overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(entry.changes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
        {label}
      </p>
      <p className="text-sm font-medium tracking-tight">{value}</p>
    </div>
  );
}
