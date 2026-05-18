import { History } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAuditLog } from "@/lib/data/audit-log";
import { requireRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "บันทึกการใช้งาน — EasySpace" };

const ROLE_LABEL: Record<Role, string> = {
  owner: "เจ้าของระบบ",
  super_admin: "Super Admin",
  admin: "แอดมิน",
  staff: "พนักงาน",
  accountant: "บัญชี",
  marketing: "การตลาด",
  viewer: "ผู้ดู",
};

const ACTION_STYLE: Record<string, { tone: string; label: string }> = {
  created: { tone: "pill-success", label: "สร้าง" },
  updated: { tone: "pill-info", label: "แก้ไข" },
  cancelled: { tone: "pill-warning", label: "ยกเลิก" },
  paid: { tone: "pill-success", label: "ชำระเงิน" },
  refunded: { tone: "pill-warning", label: "คืนเงิน" },
  login_success: { tone: "pill-info", label: "เข้าระบบ" },
  login_failed: { tone: "pill-danger", label: "เข้าระบบล้มเหลว" },
  role_changed: { tone: "pill-warning", label: "เปลี่ยน Role" },
  settings_changed: { tone: "pill-info", label: "เปลี่ยนการตั้งค่า" },
  restored: { tone: "pill-success", label: "กู้คืน" },
};

function formatThaiDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default async function AuditLogPage() {
  await requireRole("admin");
  const rows = await listAuditLog({ limit: 200 });

  return (
    <>
      <AdminTopbar
        title="บันทึกการใช้งาน"
        subtitle="ทุกการเปลี่ยนแปลงสำคัญในระบบ"
      />
      <div className="px-6 lg:px-10 py-6 lg:py-8">
        <PageHeader
          title="บันทึกการใช้งาน"
          description={`ทุกการเปลี่ยนแปลงสำคัญในระบบ · แสดง ${rows.length.toLocaleString("th-TH")} รายการล่าสุด`}
        />

        {rows.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-primary-50 text-primary-600 grid place-items-center mx-auto mb-3">
              <History size={26} strokeWidth={1.75} />
            </div>
            <p className="text-sm text-ink-2 font-medium">
              ยังไม่มีบันทึกการใช้งาน
            </p>
            <p className="text-xs text-ink-3 mt-1">
              ระบบจะบันทึกเมื่อมีการสร้าง / แก้ไข / ลบข้อมูลสำคัญ
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
                    <th className="text-left px-3 py-3 font-medium">การกระทำ</th>
                    <th className="text-left px-3 py-3 font-medium">เป้าหมาย</th>
                    <th className="text-left px-3 py-3 font-medium">IP</th>
                    <th className="text-left px-5 py-3 font-medium">เหตุผล</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const styled =
                      ACTION_STYLE[r.action] ?? {
                        tone: "pill-muted",
                        label: r.action,
                      };
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-line hover:bg-surface-subtle/60"
                      >
                        <td className="px-5 py-3 text-ink-2 tabular-nums whitespace-nowrap">
                          {formatThaiDateTime(r.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-ink-1 font-medium tracking-tight">
                            {r.actor_name ?? "ระบบ"}
                          </p>
                          {r.actor_role && (
                            <p className="text-[11px] text-ink-3">
                              {ROLE_LABEL[r.actor_role]}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={styled.tone}>{styled.label}</Badge>
                        </td>
                        <td className="px-3 py-3 text-ink-2 tracking-tight">
                          <span className="text-[11px] text-ink-3 uppercase mr-1">
                            {r.target_type}
                          </span>
                          {r.target_id && (
                            <span className="font-mono text-[11px] text-ink-3">
                              {r.target_id.slice(0, 8)}…
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-3 font-mono text-[11px]">
                          {r.ip_address ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-ink-2 max-w-sm truncate">
                          {r.reason ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
