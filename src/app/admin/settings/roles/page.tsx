import { Check, X } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const ROLES = [
  { id: "super_admin", label: "Super Admin", rank: 5 },
  { id: "admin", label: "Admin", rank: 4 },
  { id: "staff", label: "Staff", rank: 3 },
  { id: "accountant", label: "บัญชี", rank: 2 },
  { id: "marketing", label: "Marketing", rank: 1 },
  { id: "viewer", label: "Viewer", rank: 0 },
];

const PERMISSIONS = [
  { id: "booking.view", label: "ดูข้อมูลการจอง", min: 0 },
  { id: "booking.create", label: "สร้างการจอง", min: 1 },
  { id: "booking.edit", label: "แก้ไขการจอง", min: 3 },
  { id: "booking.cancel", label: "ยกเลิกการจอง", min: 3 },
  { id: "payment.view", label: "ดูการเงิน", min: 2 },
  { id: "payment.record", label: "บันทึกการชำระ", min: 3 },
  { id: "expense.manage", label: "จัดการรายจ่าย", min: 2 },
  { id: "customer.manage", label: "จัดการลูกค้า", min: 3 },
  { id: "promotion.manage", label: "จัดการโปรโมชั่น", min: 1 },
  { id: "rooms.edit", label: "แก้ห้อง / แพ็กเกจ", min: 4 },
  { id: "users.manage", label: "จัดการแอดมิน", min: 4 },
  { id: "settings.write", label: "แก้ตั้งค่าทั้งหมด", min: 5 },
];

export default function RolesPage() {
  return (
    <>
      <AdminTopbar title="Roles & Permissions" subtitle="6 บทบาท · permission matrix" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Roles & Permissions"
          description="แสดงสิทธิ์ของแต่ละบทบาท — แก้ rank ของบทบาทได้ที่ src/lib/auth (ROLE_RANK)"
        >
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="text-left py-2.5 px-3 sticky left-0 bg-surface-subtle">
                    Permission
                  </th>
                  {ROLES.map((r) => (
                    <th key={r.id} className="text-center py-2.5 px-3">
                      <div>{r.label}</div>
                      <div className="text-[9px] text-ink-3 normal-case tracking-normal">
                        rank {r.rank}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-line-soft hover:bg-primary-50/10"
                  >
                    <td className="py-2 px-3">
                      <div className="font-medium tracking-tight">
                        {p.label}
                      </div>
                      <code className="text-[10px] text-ink-3 font-mono">
                        {p.id}
                      </code>
                    </td>
                    {ROLES.map((r) => {
                      const allowed = r.rank >= p.min;
                      return (
                        <td
                          key={r.id}
                          className={cn(
                            "py-2 px-3 text-center",
                            allowed ? "text-emerald-600" : "text-ink-3",
                          )}
                        >
                          {allowed ? (
                            <Check size={14} className="mx-auto" />
                          ) : (
                            <X size={14} className="mx-auto opacity-40" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="mt-4 !bg-amber-50/60 !border-amber-200">
            <p className="text-sm font-semibold tracking-tight text-amber-900 mb-1">
              Custom roles
            </p>
            <p className="text-xs text-amber-800">
              ตอนนี้ระบบใช้ 6 บทบาทมาตรฐาน + 1 owner ขององค์กร · custom role
              จะเปิดในเฟสถัดไป (ตาราง <code>permissions</code>{" "}
              + RBAC join)
            </p>
            <p className="text-[11px] text-amber-700 mt-2">
              <Badge tone="muted" className="!text-[9px]">
                เร็ว ๆ นี้
              </Badge>
            </p>
          </Card>
        </SettingsShell>
      </div>
    </>
  );
}
