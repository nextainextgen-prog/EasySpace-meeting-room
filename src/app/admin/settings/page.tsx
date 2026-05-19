import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { IconTile } from "@/components/ui/icon-tile";
import { SettingsShell } from "./_shell";
import { SETTINGS_GROUPS } from "./_nav";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <AdminTopbar
        title="ตั้งค่าระบบ"
        subtitle="ทุกอย่างที่แอดมินปรับได้ — ไม่ hardcode"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ตั้งค่าระบบ"
          description="ห้อง · ราคา · เวลา · Telegram · ภาษี · ผู้ใช้ · AI · Branding · กดที่การ์ดเพื่อเปิดหน้าตั้งค่านั้น"
        >
          <div className="space-y-8">
            {SETTINGS_GROUPS.map((g) => (
              <section key={g.label}>
                <h3 className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                  {g.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      className="group surface-card !p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-start gap-3">
                        <IconTile icon={it.icon} tone="primary" />
                        <div className="min-w-0">
                          <p className="font-semibold tracking-tight text-ink-1">
                            {it.title}
                          </p>
                          <p className="text-xs text-ink-3 mt-1">{it.desc}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </SettingsShell>
      </div>
    </>
  );
}
