"use client";

import { useState, useTransition } from "react";
import {
  Smartphone,
  Monitor,
  LogOut,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOutOtherDevices } from "@/lib/actions/account";

export function SessionsCard() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function signOutOthers() {
    if (!confirm("ออกจากระบบทุกอุปกรณ์อื่น (ยกเว้นอุปกรณ์ปัจจุบัน)?"))
      return;
    startTransition(async () => {
      const r = await signOutOtherDevices();
      if (r.ok) setDone(true);
      else setErr(r.error);
    });
  }

  // The current device (always shown). Real per-device list would require
  // a session tracking table — for now we expose the "sign out others"
  // action which is the practical security feature most users want.
  const current = {
    label: "อุปกรณ์ปัจจุบัน",
    detail: typeof navigator !== "undefined" ? navigator.userAgent : "—",
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-input border border-line-soft bg-surface-subtle/40 p-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-input bg-primary-50 text-primary-700 grid place-items-center shrink-0">
          {/Mobile|Android|iPhone/i.test(current.detail) ? (
            <Smartphone size={16} />
          ) : (
            <Monitor size={16} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight">
            {current.label}
          </p>
          <p className="text-[10px] text-ink-3 truncate">{current.detail}</p>
        </div>
        <Badge tone="success" className="!text-[10px]">
          กำลังใช้งาน
        </Badge>
      </div>

      <div className="rounded-input bg-amber-50/60 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          ระบบยังไม่ได้แสดงรายการเซสชันแยกตามอุปกรณ์ (Supabase Auth ยังไม่มี API
          ส่วนนี้) — แต่กดปุ่มด้านล่างเพื่อ <b>ออกจากระบบทุกอุปกรณ์อื่น</b>{" "}
          ได้ทันที (อุปกรณ์ปัจจุบันยังอยู่)
        </span>
      </div>

      {done && (
        <div className="rounded-input bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3.5 py-2.5 inline-flex items-center gap-2">
          <CheckCircle2 size={14} /> ออกจากระบบอุปกรณ์อื่นเรียบร้อย
        </div>
      )}
      {err && (
        <p className="text-xs text-red-600">{err}</p>
      )}

      <Button
        variant="danger"
        size="sm"
        iconLeft={<LogOut size={12} />}
        onClick={signOutOthers}
        disabled={pending}
      >
        {pending ? "กำลังออก..." : "ออกจากระบบทุกอุปกรณ์อื่น"}
      </Button>
    </div>
  );
}
