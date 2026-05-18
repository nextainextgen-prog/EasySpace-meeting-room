import { Copy, Mail, Link as LinkIcon } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentMember } from "@/lib/data/members";
import { listInvitesByOrg } from "@/lib/data/org-invites";

export const metadata = { title: "ลิงก์เชิญ — Org Admin" };

const LINK_TYPE_LABEL: Record<string, string> = {
  public: "เปิดให้สมัครได้",
  verified: "ตรวจอีเมล",
  token: "ใช้รหัสครั้งเดียว",
  time_limited: "จำกัดเวลา",
  quota_limited: "จำกัดจำนวน",
};

export default async function OrgInvitesPage() {
  const ctx = (await getCurrentMember())!;
  const invites = await listInvitesByOrg(ctx.primaryOrgId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tighter text-ink-1">
          ลิงก์เชิญสมาชิก
        </h2>
        <p className="text-sm text-ink-3 mt-1">
          แชร์ลิงก์เหล่านี้กับคนในองค์กรเพื่อให้สมัครเข้าระบบ — ลิงก์ที่ปิดอยู่จะใช้งานไม่ได้
        </p>
      </div>

      <div className="space-y-3">
        {invites.length === 0 ? (
          <Card className="p-10 text-center">
            <Mail size={32} strokeWidth={1.5} className="mx-auto text-ink-3 mb-2" />
            <p className="text-sm text-ink-2 font-medium">ยังไม่มีลิงก์เชิญ</p>
            <p className="text-xs text-ink-3 mt-1">
              ติดต่อแอดมินตึกเพื่อสร้างลิงก์เชิญสำหรับองค์กรของคุณ
            </p>
          </Card>
        ) : (
          invites.map((inv) => {
            const url = `/book/${inv.code}`;
            const expired =
              inv.expires_at && new Date(inv.expires_at) < new Date();
            const quotaFull =
              inv.quota_total !== null && inv.quota_used >= inv.quota_total;
            const usableStatus = !inv.enabled
              ? { label: "ปิดอยู่", tone: "muted" as const }
              : expired
                ? { label: "หมดอายุ", tone: "warning" as const }
                : quotaFull
                  ? { label: "เต็มโควต้า", tone: "warning" as const }
                  : { label: "ใช้งานได้", tone: "success" as const };

            return (
              <Card key={inv.id}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-card-sm bg-primary-50 text-primary-600 grid place-items-center shrink-0">
                    <LinkIcon size={18} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={usableStatus.tone}>
                        {usableStatus.label}
                      </Badge>
                      <Badge tone="muted">
                        {LINK_TYPE_LABEL[inv.link_type] ?? inv.link_type}
                      </Badge>
                      {inv.email_domains && inv.email_domains.length > 0 && (
                        <Badge tone="info">
                          @{inv.email_domains.join(", @")}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2 bg-surface-subtle border border-line-soft rounded-input px-3 py-2 font-mono text-[12px] text-ink-2">
                      <span className="truncate flex-1">{url}</span>
                      <CopyButton text={url} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
                      <Info label="ใช้ไปแล้ว">
                        {inv.quota_used}
                        {inv.quota_total !== null && ` / ${inv.quota_total}`}
                      </Info>
                      <Info label="หมดอายุ">
                        {inv.expires_at
                          ? new Date(inv.expires_at).toLocaleDateString("th-TH")
                          : "ไม่จำกัด"}
                      </Info>
                      <Info label="สร้างเมื่อ">
                        {new Date(inv.created_at).toLocaleDateString("th-TH")}
                      </Info>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Card className="bg-primary-50 border-primary-100">
        <CardTitle>ต้องการลิงก์เพิ่ม?</CardTitle>
        <CardSubtitle>
          ติดต่อแอดมินตึก หรือ super admin
          เพื่อขอสร้างลิงก์เชิญใหม่ — Phase 1 ยังไม่เปิดให้ org-admin สร้างเอง
        </CardSubtitle>
      </Card>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold">
        {label}
      </p>
      <p className="mt-0.5 text-ink-1 tracking-tight font-medium tabular-nums">
        {children}
      </p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  // Server component → no interactivity. We render an anchor that opens the URL
  // and a button that's a no-op fallback. Real copy happens in client wrapper
  // below if we need it; for Phase 1 the URL display + open suffice.
  return (
    <a
      href={text}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary-600 hover:underline text-[11px] font-medium"
    >
      <Copy size={12} strokeWidth={2} />
      เปิด
    </a>
  );
}
