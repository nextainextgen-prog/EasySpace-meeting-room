"use client";

import { useMemo, useState } from "react";
import { Search, Filter, Download, History, X, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";

type Role =
  | "owner"
  | "super_admin"
  | "admin"
  | "staff"
  | "accountant"
  | "marketing"
  | "viewer";

interface Row {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: Role | null;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "เจ้าของระบบ",
  super_admin: "Super Admin",
  admin: "แอดมิน",
  staff: "พนักงาน",
  accountant: "บัญชี",
  marketing: "การตลาด",
  viewer: "ผู้ดู",
};

const ACTION_TONE: Record<string, "success" | "info" | "warning" | "danger" | "muted"> = {
  booking_created: "success",
  booking_updated: "info",
  booking_cancelled: "warning",
  payment_added: "success",
  paid: "success",
  refunded: "warning",
  login_success: "info",
  login_failed: "danger",
  role_changed: "warning",
  settings_changed: "info",
  admin_invited: "info",
  admin_updated: "info",
  admin_suspended: "danger",
  admin_restored: "success",
  org_created: "success",
  org_updated: "info",
  org_status_changed: "warning",
  org_broadcast: "info",
  org_members_bulk_import: "info",
  org_domain_added: "info",
  org_quota_updated: "info",
  reminder_sent: "info",
  bad_debt_marked: "danger",
  moved: "warning",
};

function formatThaiDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AuditLogBoard({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [openRow, setOpenRow] = useState<Row | null>(null);

  const actors = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.actor_name)
            .filter((x): x is string => !!x),
        ),
      ).sort(),
    [rows],
  );
  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (actorFilter && r.actor_name !== actorFilter) return false;
      if (actionFilter && r.action !== actionFilter) return false;
      if (from && new Date(r.created_at) < new Date(from)) return false;
      if (to && new Date(r.created_at) > new Date(`${to}T23:59:59`))
        return false;
      if (search) {
        const q = search.toLowerCase();
        const hay =
          `${r.actor_name ?? ""} ${r.action} ${r.target_type} ${r.target_id ?? ""} ${r.reason ?? ""} ${r.ip_address ?? ""} ${r.user_agent ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, actorFilter, actionFilter, from, to, search]);

  function exportCSV() {
    const header = [
      "เวลา",
      "ผู้ดำเนินการ",
      "บทบาท",
      "Action",
      "Target",
      "Reason",
      "IP",
      "User-Agent",
      "Changes JSON",
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
          `"${JSON.stringify(r.changes ?? {}).replace(/"/g, '""')}"`,
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
      <Card className="!p-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <Input
              iconLeft={<Search size={14} />}
              placeholder="ค้นหา ผู้ดำเนินการ / action / target / IP / UA"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!h-10"
            />
          </div>
          <Select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="!h-10 !w-48"
          >
            <option value="">ทุกคน</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="!h-10 !w-48"
          >
            <option value="">ทุก action</option>
            {actions.map((a) => (
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
          <span className="text-xs text-ink-3">–</span>
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
              setActorFilter("");
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
            Export CSV
          </Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-primary-50 text-primary-600 grid place-items-center mx-auto mb-3">
            <History size={26} strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-2 font-medium">
            ไม่พบรายการที่ตรงกัน
          </p>
          <p className="text-xs text-ink-3 mt-1">
            ลองล้าง filter หรือขยายช่วงเวลา
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-ink-3 text-[11px] uppercase tracking-[0.06em]">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">เวลา</th>
                  <th className="text-left px-3 py-3 font-medium">ผู้ดำเนินการ</th>
                  <th className="text-left px-3 py-3 font-medium">Action</th>
                  <th className="text-left px-3 py-3 font-medium">เป้าหมาย</th>
                  <th className="text-left px-3 py-3 font-medium">IP</th>
                  <th className="text-left px-3 py-3 font-medium">UA</th>
                  <th className="text-left px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = ACTION_TONE[r.action] ?? "muted";
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenRow(r)}
                      className="border-t border-line hover:bg-surface-subtle/60 cursor-pointer"
                    >
                      <td className="px-5 py-3 text-ink-2 tabular-nums whitespace-nowrap text-xs">
                        {formatThaiDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink-1 font-medium tracking-tight text-sm">
                          {r.actor_name ?? "ระบบ"}
                        </p>
                        {r.actor_role && (
                          <p className="text-[10px] text-ink-3">
                            {ROLE_LABEL[r.actor_role]}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={tone} className="!text-[10px]">
                          {r.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-ink-2 tracking-tight text-xs">
                        <span className="text-[10px] text-ink-3 uppercase mr-1">
                          {r.target_type}
                        </span>
                        {r.target_id && (
                          <span className="font-mono text-[10px] text-ink-3">
                            {r.target_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink-3 font-mono text-[11px]">
                        {r.ip_address ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-ink-3 text-[10px] max-w-[120px] truncate">
                        {r.user_agent
                          ? r.user_agent.match(
                              /(Chrome|Safari|Firefox|Edge|Mobile|iPhone|Android)/i,
                            )?.[0] ?? "—"
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-ink-2 max-w-sm truncate text-xs">
                        {r.reason ?? "—"}
                        {r.changes && (
                          <Activity
                            size={10}
                            className="inline ml-1 text-primary-500"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openRow && <DetailModal row={openRow} onClose={() => setOpenRow(null)} />}
    </>
  );
}

function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight">
              <code className="font-mono text-primary-700">{row.action}</code>
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {formatThaiDateTime(row.created_at)}
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
            <Info label="Actor" value={row.actor_name ?? "system"} />
            <Info label="Role" value={row.actor_role ?? "—"} />
            <Info
              label="Target"
              value={
                <span>
                  {row.target_type}
                  {row.target_id && (
                    <span className="text-ink-3 font-mono text-xs ml-1">
                      #{row.target_id.slice(0, 12)}
                    </span>
                  )}
                </span>
              }
            />
            <Info
              label="IP"
              value={
                <code className="font-mono text-xs">
                  {row.ip_address ?? "—"}
                </code>
              }
            />
          </div>
          {row.reason && <Info label="Reason" value={row.reason} />}
          {row.user_agent && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                User Agent
              </p>
              <p className="text-[11px] text-ink-2 break-words font-mono bg-surface-subtle/60 p-2 rounded-input">
                {row.user_agent}
              </p>
            </div>
          )}
          {row.changes && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
                Changes / Before-After
              </p>
              <pre className="text-[11px] bg-surface-subtle/60 rounded-input p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(row.changes, null, 2)}
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
