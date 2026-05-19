import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  accountant: "บัญชี",
  marketing: "Marketing",
  viewer: "Viewer",
  owner: "Owner",
};

export default async function AdminUsersPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, is_active, two_factor_enabled, last_login_at",
    )
    .order("role")
    .order("full_name");
  const profiles = (data ?? []) as unknown as Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    two_factor_enabled: boolean;
    last_login_at: string | null;
  }>;

  return (
    <>
      <AdminTopbar
        title="แอดมินระบบ"
        subtitle={`${profiles.length} บัญชี · จัดการเต็มที่หน้า "Users"`}
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="แอดมินระบบ"
          description="รายชื่อแอดมิน + บทบาท + 2FA · จัดการสิทธิ์เต็มรูปแบบที่ /admin/users"
          actions={
            <Link href="/admin/users">
              <Button variant="primary" size="sm" iconRight={<ArrowUpRight size={13} />}>
                เปิดหน้า Users
              </Button>
            </Link>
          }
        >
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="text-left py-2.5 px-3">ชื่อ</th>
                  <th className="text-left py-2.5 px-3">Email</th>
                  <th className="text-left py-2.5 px-3">บทบาท</th>
                  <th className="text-left py-2.5 px-3">2FA</th>
                  <th className="text-left py-2.5 px-3">สถานะ</th>
                  <th className="text-left py-2.5 px-3">Last login</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-xs text-ink-3"
                    >
                      ยังไม่มีบัญชี
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-line-soft hover:bg-primary-50/20"
                    >
                      <td className="py-2 px-3 font-medium">
                        {p.full_name ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-xs text-ink-3 font-mono">
                        {p.email}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          tone={
                            p.role === "super_admin" || p.role === "owner"
                              ? "primary"
                              : p.role === "admin"
                                ? "info"
                                : "muted"
                          }
                          className="!text-[10px]"
                        >
                          {ROLE_LABEL[p.role] ?? p.role}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {p.two_factor_enabled ? (
                          <Badge tone="success" className="!text-[10px]">
                            on
                          </Badge>
                        ) : (
                          <Badge tone="warning" className="!text-[10px]">
                            off
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {p.is_active ? (
                          <Badge tone="success" className="!text-[10px]">
                            active
                          </Badge>
                        ) : (
                          <Badge tone="danger" className="!text-[10px]">
                            disabled
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs text-ink-3 tabular-nums">
                        {p.last_login_at
                          ? new Date(p.last_login_at).toLocaleString("th-TH", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </SettingsShell>
      </div>
    </>
  );
}
