"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Copy,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateBackupCodes } from "@/lib/actions/account";

export function BackupCodesCard({
  status,
}: {
  status: {
    total: number;
    used: number;
    remaining: number;
    generated_at: string | null;
  } | null;
}) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    if (
      status &&
      status.total > 0 &&
      !confirm(
        "สร้าง backup codes ใหม่จะทำให้โค้ดชุดเดิมใช้ไม่ได้ทันที — ต่อหรือไม่?",
      )
    )
      return;
    startTransition(async () => {
      const r = await generateBackupCodes();
      if (r.ok) setCodes(r.codes);
    });
  }

  function copyAll() {
    if (!codes) return;
    navigator.clipboard.writeText(codes.join("\n"));
  }
  function download() {
    if (!codes) return;
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `easyspace-backup-codes-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 space-y-3">
      {status ? (
        <div className="flex items-center gap-3 rounded-input border border-line-soft bg-surface-subtle/40 p-3">
          <span className="text-[11px] text-ink-3 uppercase tracking-wider">
            สถานะ
          </span>
          <Badge
            tone={status.remaining > 3 ? "success" : "warning"}
            className="!text-[10px]"
          >
            เหลือ {status.remaining}/{status.total}
          </Badge>
          {status.generated_at && (
            <span className="text-[11px] text-ink-3 tabular-nums">
              สร้างเมื่อ{" "}
              {new Date(status.generated_at).toLocaleDateString("th-TH", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-input bg-amber-50/60 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          ยังไม่มี backup codes — กดสร้างเพื่อรับ 10 โค้ดสำรอง (ใช้ได้ครั้งเดียว)
        </div>
      )}

      {codes && codes.length > 0 && (
        <div className="rounded-input border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-900 mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} />
            บันทึก codes เหล่านี้ทันที — แสดงครั้งเดียว
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
            {codes.map((c) => (
              <code
                key={c}
                className="px-2 py-1.5 bg-white border border-amber-200 rounded-input text-ink-1 tabular-nums tracking-wider text-center"
              >
                {c}
              </code>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Copy size={12} />}
              onClick={copyAll}
            >
              คัดลอกทั้งหมด
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Download size={12} />}
              onClick={download}
            >
              ดาวน์โหลด .txt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<CheckCircle2 size={12} />}
              onClick={() => setCodes(null)}
              className="ml-auto"
            >
              บันทึกแล้ว
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        iconLeft={<Sparkles size={12} />}
        disabled={pending}
        onClick={generate}
      >
        {pending
          ? "สร้าง..."
          : status && status.total > 0
            ? "สร้างชุดใหม่"
            : "สร้าง backup codes"}
      </Button>
    </div>
  );
}
