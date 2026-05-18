import {
  Users,
  UserPlus,
  Repeat,
  TrendingDown,
  TrendingUp,
  Brain,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { formatBaht } from "@/lib/format";

const rfmSegments = [
  { name: "Champions", code: "555", count: 24, color: "bg-primary-600", x: 80, y: 85 },
  { name: "Loyal", code: "543", count: 55, color: "bg-primary-400", x: 70, y: 70 },
  { name: "Potential Loyalist", code: "532", count: 38, color: "bg-emerald-500", x: 60, y: 50 },
  { name: "New Customers", code: "511", count: 12, color: "bg-blue-400", x: 85, y: 25 },
  { name: "Need Attention", code: "322", count: 18, color: "bg-amber-500", x: 40, y: 35 },
  { name: "At Risk", code: "213", count: 8, color: "bg-red-500", x: 25, y: 60 },
  { name: "Hibernating", code: "232", count: 15, color: "bg-slate-400", x: 20, y: 30 },
  { name: "Lost", code: "111", count: 5, color: "bg-slate-300", x: 10, y: 10 },
];

const cohorts = [
  { label: "ม.ค. 26", size: 50, retention: [100, 60, 45, 35, 30, 28, 25] },
  { label: "ก.พ. 26", size: 65, retention: [100, 55, 40, 32, 28, 25, null] },
  { label: "มี.ค. 26", size: 72, retention: [100, 62, 48, 40, 35, null, null] },
  { label: "เม.ย. 26", size: 80, retention: [100, 65, 50, 42, null, null, null] },
  { label: "พ.ค. 26", size: 95, retention: [100, 68, 55, null, null, null, null] },
];

export default function AnalyticsPage() {
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
          <KpiCard label="MAU" value="215 ราย" delta={{ value: 8 }} icon={Users} />
          <KpiCard
            label="ลูกค้าใหม่ (30d)"
            value="42 ราย"
            delta={{ value: 12 }}
            icon={UserPlus}
            iconTone="success"
          />
          <KpiCard
            label="Returning %"
            value="68%"
            delta={{ value: 4 }}
            icon={Repeat}
          />
          <KpiCard
            label="Churn Rate"
            value="15%"
            delta={{ value: -2 }}
            icon={TrendingDown}
            iconTone="warning"
          />
          <KpiCard label="CLV avg" value={formatBaht(18500)} icon={Brain} iconTone="primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>RFM Quadrant</CardTitle>
                <CardSubtitle>11 segments · ตำแหน่ง = Recency × Monetary</CardSubtitle>
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
              {rfmSegments.map((s) => (
                <div
                  key={s.name}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${s.color} rounded-pill text-white text-[10px] font-semibold grid place-items-center shadow-card`}
                  style={{
                    left: `${s.x}%`,
                    top: `${100 - s.y}%`,
                    width: `${24 + s.count / 2}px`,
                    height: `${24 + s.count / 2}px`,
                  }}
                  title={s.name}
                >
                  {s.count}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {rfmSegments.map((s) => (
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
                    <tr key={c.label} className="border-t border-line-soft">
                      <td className="py-2 pr-2 font-medium">{c.label}</td>
                      <td className="py-2 pr-2 text-ink-3">{c.size}</td>
                      {c.retention.map((r, i) => (
                        <td key={i} className="py-1 px-1">
                          {r !== null ? (
                            <div
                              className="rounded text-white text-center py-1 font-semibold"
                              style={{
                                background: `rgba(45, 78, 245, ${0.15 + (r / 100) * 0.8})`,
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
            {[
              {
                title: "Champions เพิ่ม 5 ราย",
                desc: "จาก Loyal segment — ส่งของขวัญ + Personal call",
                tone: "success",
              },
              {
                title: "บริษัท ก. ห่างหาย 95 วัน",
                desc: "เคยจองเดือนละ 2 ครั้ง — โทรหา personal",
                tone: "warning",
              },
              {
                title: "12 VIP มีโอกาส upsell",
                desc: "เสนอแพ็กเกจเต็มวัน — Expected +฿8K/เดือน",
                tone: "info",
              },
            ].map((i) => (
              <div
                key={i.title}
                className="p-4 rounded-card-sm border border-line bg-white"
              >
                <p className="font-semibold text-sm tracking-tight">
                  {i.title}
                </p>
                <p className="text-xs text-ink-3 mt-1.5">{i.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
