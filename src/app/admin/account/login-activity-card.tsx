"use client";

import {
  CheckCircle2,
  AlertCircle,
  Globe,
  Activity,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityRow {
  id: string;
  created_at: string;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
}

const ICON: Record<string, typeof Globe> = {
  login_success: CheckCircle2,
  login_failed: AlertCircle,
  signed_out_other_devices: LogOut,
  page_view: Activity,
};

const TONE: Record<
  string,
  "success" | "danger" | "info" | "muted"
> = {
  login_success: "success",
  login_failed: "danger",
  signed_out_other_devices: "info",
  page_view: "muted",
};

function uaBrief(ua: string | null) {
  if (!ua) return "—";
  const m = ua.match(/(Chrome|Safari|Firefox|Edge|Mobile|iPhone|Android)/i);
  return m?.[0] ?? "—";
}

export function LoginActivityCard({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-ink-3 text-center py-6 mt-3">
        ยังไม่มีบันทึก
      </p>
    );

  return (
    <ul className="mt-4 space-y-1.5">
      {rows.map((r) => {
        const Icon = ICON[r.action] ?? Activity;
        return (
          <li
            key={r.id}
            className="flex items-center gap-3 px-3 py-2 rounded-input border border-line-soft bg-surface-subtle/30 text-xs"
          >
            <Icon size={13} className="text-ink-3 shrink-0" />
            <Badge tone={TONE[r.action] ?? "muted"} className="!text-[10px]">
              {r.action}
            </Badge>
            <span className="text-ink-3 tabular-nums w-32 shrink-0">
              {new Date(r.created_at).toLocaleString("th-TH", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-ink-3 font-mono truncate flex-1">
              {r.ip_address ?? "—"}
            </span>
            <span className="text-[10px] text-ink-3 shrink-0">
              {uaBrief(r.user_agent)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
