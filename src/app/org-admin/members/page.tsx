import { Users } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentMember, listMembersByOrg } from "@/lib/data/members";

export const metadata = { title: "สมาชิก — Org Admin" };

export default async function OrgMembersPage() {
  const ctx = (await getCurrentMember())!;
  const members = await listMembersByOrg(ctx.primaryOrgId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tighter text-ink-1">
          สมาชิกในองค์กร
        </h2>
        <p className="text-sm text-ink-3 mt-1">
          {members.length} คน · เห็นข้อมูลของสมาชิกทุกคนในองค์กรของคุณ
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-ink-3 text-[11px] uppercase tracking-[0.06em]">
              <tr>
                <th className="text-left px-5 py-3 font-medium">ชื่อ</th>
                <th className="text-left px-3 py-3 font-medium">ตำแหน่ง</th>
                <th className="text-left px-3 py-3 font-medium">อีเมล</th>
                <th className="text-left px-3 py-3 font-medium">โทรศัพท์</th>
                <th className="text-left px-5 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-line hover:bg-surface-subtle/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-pill bg-primary-100 text-primary-700 grid place-items-center font-semibold text-xs">
                        {m.full_name.slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-medium text-ink-1 tracking-tight">
                          {m.full_name}
                          {m.id === ctx.member.id && (
                            <Badge tone="primary" className="ml-2 !text-[9px]">
                              คุณ
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-2 tracking-tight">
                    {m.position ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-ink-2 font-mono text-[12px]">
                    {m.email}
                  </td>
                  <td className="px-3 py-3 text-ink-2 tabular-nums">
                    {m.phone ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    {m.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="muted">Disabled</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users
                      size={32}
                      strokeWidth={1.5}
                      className="mx-auto text-ink-3 mb-2"
                    />
                    <p className="text-sm text-ink-3">
                      ยังไม่มีสมาชิกในองค์กร — สร้างลิงก์เชิญเพื่อเริ่มต้น
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>หมายเหตุ</CardTitle>
        <CardSubtitle>
          การปิดสมาชิก หรือเปลี่ยน tier ต้องติดต่อแอดมินตึก
          (Phase 1 ยังไม่ให้ org-admin จัดการได้ในหน้านี้)
        </CardSubtitle>
      </Card>
    </div>
  );
}
