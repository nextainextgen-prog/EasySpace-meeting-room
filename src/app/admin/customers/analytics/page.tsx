import {
  Users,
  UserPlus,
  Repeat,
  TrendingDown,
  Brain,
  Sparkles,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { IconTile } from "@/components/ui/icon-tile";
import {
  rfmSegments,
  cohortRetention,
  customerKpis,
  listCustomers,
} from "@/lib/data";
import { formatBaht } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [segments, cohorts, kpis, customers] = await Promise.all([
    rfmSegments(),
    cohortRetention(5, 7),
    customerKpis(),
    listCustomers({ limit: 500 }),
  ]);

  const championCount =
    segments.find((s) => s.code === "555")?.count ?? 0;
  const atRiskCustomers = customers
    .filter((c) => c.churn_risk === "high")
    .sort((a, b) => Number(b.total_spent) - Number(a.total_spent))
    .slice(0, 3);
  const upsellCandidates = customers
    .filter((c) => c.tags.includes("VIP") || c.total_bookings >= 10)
    .slice(0, 3);

  return (
    <>
      <AdminTopbar
        title="วิเคราะห์ลูกค้า"
        subtitle="RFM · Cohort · Retention · Churn · AI Insights"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="Customer Analytics"
          description="วิเคราะห์เชิงลึก — เห็นว่าใครคุ้ม ใครเสี่ยง ใครต้องดูแล"
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="MAU"
            value={`${kpis.mau} ราย`}
            icon={Users}
          />
          <KpiCard
            label="ลูกค้าใหม่ (30d)"
            value={`${kpis.newCount} ราย`}
            icon={UserPlus}
            iconTone="success"
          />
          <KpiCard
            label="Returning %"
            value={`${kpis.returningPct}%`}
            icon={Repeat}
          />
          <KpiCard
            label="Churn rate"
            value={`${kpis.churnRate}%`}
            icon={TrendingDown}
            iconTone="warning"
          />
          <KpiCard
            label="CLV avg"
            value={formatBaht(kpis.clv)}
            icon={Brain}
            iconTone="primary"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>RFM Quadrant</CardTitle>
                <CardSubtitle>
                  8 segments · ตำแหน่ง = Recency × Monetary
                </CardSubtitle>
              </div>
              <IconTile icon={Brain} tone="primary" size="sm" />
            </CardHeader>
            <div className="relative h-64 rounded-card-sm bg-surface-subtle/70 border border-line-soft overflow-hidden">
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 text-[10px] text-ink-3">
                <span className="p-2">High M · Old</span>
                <span className="p-2 text-right">High M · New</span>
                <span className="p-2 self-end">Low M · Old</span>
                <span className="p-2 text-right self-end">Low M · New</span>
              </div>
              <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              {segments.map((s) => (
                <div
                  key={s.name}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${s.color} rounded-pill text-white text-[10px] font-semibold grid place-items-center shadow-card`}
                  style={{
                    left: `${s.x}%`,
                    top: `${100 - s.y}%`,
                    width: `${24 + Math.min(40, s.count * 1.5)}px`,
                    height: `${24 + Math.min(40, s.count * 1.5)}px`,
                  }}
                  title={`${s.name} · ${s.count} ราย`}
                >
                  {s.count}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {segments.map((s) => (
                <div key={s.code} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-pill ${s.color}`} />
                  <span className="flex-1 text-ink-2 truncate">{s.name}</span>
                  <span className="text-ink-3 tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cohort Retention</CardTitle>
                <CardSubtitle>% ที่กลับมาในเดือนต่อไป</CardSubtitle>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-ink-3 text-[10px] uppercase tracking-[0.06em]">
                    <th className="text-left font-semibold py-2 pr-2">Cohort</th>
                    <th className="font-semibold py-2 pr-2">Size</th>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <th key={i} className="font-semibold py-2 px-1">
                        M{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.key} className="border-t border-line-soft">
                      <td className="py-2 pr-2 font-medium">{c.label}</td>
                      <td className="py-2 pr-2 text-ink-3">{c.size}</td>
                      {c.retention.map((r, i) => (
                        <td key={i} className="py-1 px-1">
                          {r !== null ? (
                            <div
                              className="rounded text-white text-center py-1 font-semibold"
                              style={{
                                background: `rgba(45, 78, 245, ${
                                  0.15 + (r / 100) * 0.8
                                })`,
                              }}
                            >
                              {r}%
                            </div>
                          ) : (
                            <div className="rounded bg-surface-subtle py-1" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI Insights</CardTitle>
              <CardSubtitle>วิเคราะห์ pattern + แนะนำ action</CardSubtitle>
            </div>
            <IconTile icon={Sparkles} tone="primary" size="sm" />
          </CardHeader>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-card-sm border border-line bg-white">
              <p className="font-semibold text-sm tracking-tight">
                Champions {championCount} ราย
              </p>
              <p className="text-xs text-ink-3 mt-1.5">
                ลูกค้า RFM 5/5/5 — ส่งของขวัญและ personal call จะรักษาฐาน
                lifetime value
              </p>
            </div>
            <div className="p-4 rounded-card-sm border border-line bg-white">
              <p className="font-semibold text-sm tracking-tight">
                At Risk {atRiskCustomers.length} ราย
              </p>
              <p className="text-xs text-ink-3 mt-1.5">
                {atRiskCustomers
                  .map((c) => c.display_name)
                  .join(", ") || "—"}{" "}
                — โทรหา personal ก่อนหายไป
              </p>
            </div>
            <div className="p-4 rounded-card-sm border border-line bg-white">
              <p className="font-semibold text-sm tracking-tight">
                Upsell candidates {upsellCandidates.length} ราย
              </p>
              <p className="text-xs text-ink-3 mt-1.5">
                เสนอแพ็กเกจเต็มวันหรือ recurring — เห็นใช้บ่อยและเป็น VIP
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
