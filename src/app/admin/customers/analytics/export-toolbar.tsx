"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ExportToolbarProps {
  reportName: string;
}

export function ExportToolbar({ reportName }: ExportToolbarProps) {
  const [openSchedule, setOpenSchedule] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Printer size={14} strokeWidth={1.75} />}
        onClick={() => window.print()}
      >
        PDF Executive
      </Button>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<FileSpreadsheet size={14} strokeWidth={1.75} />}
        onClick={() => alert("Excel export — เตรียม CSV raw export ใน Phase 3")}
      >
        Excel Raw
      </Button>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<FileText size={14} strokeWidth={1.75} />}
        onClick={() => alert("คัดลอก link snapshot — ตั้งค่าใน /admin/settings")}
      >
        Snapshot Link
      </Button>
      <div className="relative">
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Mail size={14} strokeWidth={1.75} />}
          onClick={() => setOpenSchedule((v) => !v)}
        >
          Scheduled Email
        </Button>
        {openSchedule && (
          <div className="absolute right-0 mt-2 z-20 w-72 surface-card p-4 border border-line">
            <p className="text-xs font-semibold tracking-tight text-ink-1 mb-2">
              ส่ง {reportName} อัตโนมัติ
            </p>
            <p className="text-[11px] text-ink-3 mb-3">
              ส่งให้ admin ทุกคนที่ตั้ง email ใน /admin/users
            </p>
            <div className="space-y-1.5">
              {(["daily", "weekly", "monthly"] as const).map((freq) => (
                <button
                  key={freq}
                  className="w-full text-left text-xs px-3 py-2 rounded-card-sm hover:bg-surface-subtle"
                  onClick={() => {
                    setScheduled(freq);
                    setOpenSchedule(false);
                  }}
                >
                  {freq === "daily"
                    ? "ทุกวัน 08:00"
                    : freq === "weekly"
                      ? "ทุกวันจันทร์ 08:00"
                      : "ทุกวันที่ 1 ของเดือน"}
                </button>
              ))}
            </div>
          </div>
        )}
        {scheduled && (
          <span className="absolute -top-2 -right-2 pill-success text-[10px]">
            {scheduled}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<Download size={14} strokeWidth={1.75} />}
        onClick={() => alert("กำลังเตรียม snapshot — ใช้ภายใน 10 วินาที")}
      >
        Download all
      </Button>
    </div>
  );
}
