import { Clock, CheckCircle2 } from "lucide-react";
import fs from "node:fs/promises";
import path from "node:path";
import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function readVercelCrons(): Promise<
  Array<{ path: string; schedule: string }>
> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "vercel.json"),
      "utf-8",
    );
    const cfg = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> };
    return cfg.crons ?? [];
  } catch {
    return [];
  }
}

const CRON_LABELS: Record<string, string> = {
  "/api/cron/daily-brief": "AI Daily Brief (19:00)",
  "/api/cron/outstanding-alerts": "Outstanding Alerts (09:00)",
  "/api/cron/time-alerts": "Time Alerts (ทุก 5 นาที)",
};

export default async function CronPage() {
  const crons = await readVercelCrons();

  return (
    <>
      <AdminTopbar
        title="Cron Jobs"
        subtitle="Schedule จาก vercel.json"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Cron Jobs"
          description="งานที่รันตามเวลา · กำหนดที่ vercel.json (deploy ใหม่หลังแก้)"
        >
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="text-left py-2.5 px-3">ชื่องาน</th>
                  <th className="text-left py-2.5 px-3">Endpoint</th>
                  <th className="text-left py-2.5 px-3">Schedule</th>
                  <th className="text-left py-2.5 px-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {crons.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-ink-3">
                      ไม่มี cron ใน vercel.json
                    </td>
                  </tr>
                ) : (
                  crons.map((c) => (
                    <tr
                      key={c.path}
                      className="border-t border-line-soft hover:bg-primary-50/10"
                    >
                      <td className="py-2 px-3 font-medium tracking-tight inline-flex items-center gap-2">
                        <Clock size={12} className="text-primary-600" />
                        {CRON_LABELS[c.path] ?? c.path}
                      </td>
                      <td className="py-2 px-3">
                        <code className="text-[11px] text-ink-3 font-mono">
                          {c.path}
                        </code>
                      </td>
                      <td className="py-2 px-3">
                        <code className="text-[11px] font-mono text-ink-2">
                          {c.schedule}
                        </code>
                      </td>
                      <td className="py-2 px-3">
                        <Badge tone="success" className="!text-[10px]">
                          <CheckCircle2 size={9} /> active
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <Card className="mt-4 !bg-amber-50/60 !border-amber-200">
            <p className="text-sm font-semibold text-amber-900 tracking-tight mb-1">
              แก้ schedule
            </p>
            <p className="text-xs text-amber-800">
              แก้ <code>vercel.json</code> หัวข้อ <code>crons</code> แล้ว
              deploy ใหม่ — schedule ใช้ UTC, ปรับเวลาเองหากต้องการเวลาไทย
            </p>
          </Card>
        </SettingsShell>
      </div>
    </>
  );
}
