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
  Lock,
  AlertTriangle,
  Activity,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { relativeFromNow } from "@/lib/format";
import {
  inviteAdmin,
  updateAdmin,
  suspendAdmin,
  restoreAdmin,
  resendInviteEmail,
  setAdminPassword,
  generateAdminResetLink,
} from "@/lib/actions/admin-users";

type TabId = "admins" | "audit";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  accountant: "Accountant",
  marketing: "Marketing",
  viewer: "Viewer",
  owner: "Owner",
};

const ROLE_OPTIONS = [
  "super_admin",
  "admin",
  "staff",
  "accountant",
  "marketing",
  "viewer",
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
  audit,
}: {
  admins: AdminRow[];
  adminMeta: Record<string, AdminMeta>;
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
  const [credential, setCredential] = useState<{
    email: string;
    password?: string;
    link?: string;
    mode: "password" | "link";
  } | null>(null);

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

  async function onSetPassword(id: string) {
    if (
      !confirm(
        "ระบบจะสร้างรหัสผ่านชั่วคราวให้แอดมินคนนี้ทันที (จะแสดงเพียงครั้งเดียว) ดำเนินการต่อ?",
      )
    )
      return;
    const r = await setAdminPassword(id);
    if (r.ok) {
      setCredential({
        email: r.email,
        password: r.password,
        mode: "password",
      });
    } else {
      notify(`ไม่สำเร็จ: ${r.error}`);
    }
  }

  async function onGenerateResetLink(id: string) {
    const r = await generateAdminResetLink(id);
    if (r.ok && r.actionLink) {
      setCredential({
        email: r.email,
        link: r.actionLink,
        mode: "link",
      });
    } else {
      notify(`ไม่สำเร็จ: ${"error" in r ? r.error : "ไม่ได้ลิงก์"}`);
    }
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
                            onClick={() => onSetPassword(a.id)}
                            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                          >
                            <KeyRound size={11} className="inline mr-1" />
                            ตั้งรหัสผ่านชั่วคราว
                          </button>
                          <button
                            onClick={() => onGenerateResetLink(a.id)}
                            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                          >
                            <LinkIcon size={11} className="inline mr-1" />
                            คัดลอกลิงก์ตั้งรหัสผ่าน
                          </button>
                          <button
                            onClick={() => onResendInvite(a.id)}
                            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50"
                          >
                            <RefreshCw size={11} className="inline mr-1" />
                            ส่ง invite ใหม่ (อีเมล)
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
      {credential && (
        <CredentialModal
          credential={credential}
          onClose={() => setCredential(null)}
        />
      )}
    </>
  );
}

function CredentialModal({
  credential,
  onClose,
}: {
  credential: {
    email: string;
    password?: string;
    link?: string;
    mode: "password" | "link";
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"email" | "password" | "link" | null>(
    null,
  );
  async function copy(text: string, tag: "email" | "password" | "link") {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }
  const isPassword = credential.mode === "password";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card !p-0 overflow-hidden">
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight inline-flex items-center gap-1.5">
              {isPassword ? (
                <KeyRound size={14} className="text-primary-600" />
              ) : (
                <LinkIcon size={14} className="text-primary-600" />
              )}
              {isPassword ? "รหัสผ่านชั่วคราว" : "ลิงก์ตั้งรหัสผ่าน"}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {isPassword
                ? "แสดงเพียงครั้งเดียว — คัดลอกแล้วส่งให้แอดมินทาง Telegram/แชต"
                : "ลิงก์มีอายุจำกัด — ส่งให้แอดมินเพื่อเข้าไปตั้งรหัสผ่านเอง"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
              อีเมล
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono px-3 py-2 rounded-input bg-surface-subtle break-all">
                {credential.email}
              </code>
              <button
                onClick={() => copy(credential.email, "email")}
                className="w-9 h-9 grid place-items-center rounded-input border border-line text-ink-2 hover:bg-surface-subtle"
                aria-label="คัดลอกอีเมล"
              >
                {copied === "email" ? (
                  <Check size={14} className="text-emerald-600" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>
          {isPassword && credential.password && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                รหัสผ่าน
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono px-3 py-2 rounded-input bg-amber-50 border border-amber-200 break-all">
                  {credential.password}
                </code>
                <button
                  onClick={() =>
                    copy(credential.password!, "password")
                  }
                  className="w-9 h-9 grid place-items-center rounded-input border border-line text-ink-2 hover:bg-surface-subtle"
                  aria-label="คัดลอกรหัสผ่าน"
                >
                  {copied === "password" ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-amber-700 mt-2 inline-flex items-center gap-1">
                <AlertTriangle size={11} />
                แอดมินควรเปลี่ยนรหัสผ่านเองหลังเข้าระบบครั้งแรก
              </p>
            </div>
          )}
          {!isPassword && credential.link && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                ลิงก์ตั้งรหัสผ่าน
              </p>
              <div className="flex items-start gap-2">
                <code className="flex-1 text-[11px] font-mono px-3 py-2 rounded-input bg-surface-subtle break-all">
                  {credential.link}
                </code>
                <button
                  onClick={() => copy(credential.link!, "link")}
                  className="w-9 h-9 shrink-0 grid place-items-center rounded-input border border-line text-ink-2 hover:bg-surface-subtle"
                  aria-label="คัดลอกลิงก์"
                >
                  {copied === "link" ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <form
        onSubmit={save}
        className="w-full max-w-xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden"
      >
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
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
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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

        <div className="shrink-0 px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
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
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
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
