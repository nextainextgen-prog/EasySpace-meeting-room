import Link from "next/link";
import {
  Users,
  UserPlus,
  Repeat,
  TrendingDown,
  Brain,
  Sparkles,
  AlertTriangle,
  Activity,
  Flame,
  Calendar,
  Megaphone,
  Target,
  Phone,
  MessageCircle,
  Mail,
  Crown,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Clock,
  TrendingUp,
  Zap,
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
import { Badge } from "@/components/ui/badge";
import { getDeepAnalytics, cohortRetention } from "@/lib/data";
import { formatBaht, formatCompactBaht } from "@/lib/format";
import { WhatIfSimulator } from "./what-if-simulator";
import { ExportToolbar } from "./export-toolbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "วิเคราะห์ลูกค้า — EasySpace" };

const DOW_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export default async function AnalyticsPage() {
  const [deep, cohorts] = await Promise.all([
    getDeepAnalytics(),
    cohortRetention(6, 7),
  ]);

  const {
    kpis,
    rfm,
    retentionCurve,
    sankey,
    churnRisk,
    heatmap,
    segmentRooms,
    sources,
    anomalies,
    clvPredict,
    nextBestActions,
    highlights,
  } = deep;

  const highlightItems = highlights.filter((h) => h.type === "highlight");
  const alertItems = highlights.filter((h) => h.type === "alert");
  const recommendItems = highlights.filter((h) => h.type === "recommend");

  const championsCount = rfm.find((s) => s.key === "champions")?.count ?? 0;
  const loyalCount = rfm.find((s) => s.key === "loyal")?.count ?? 0;
  const potentialCount = rfm.find((s) => s.key === "potential")?.count ?? 0;
  const atRiskCount = rfm.find((s) => s.key === "at_risk")?.count ?? 0;
  const hibernatingCount = rfm.find((s) => s.key === "hibernating")?.count ?? 0;

  const maxHeat = Math.max(1, ...heatmap.map((c) => c.count));
  const heatByDow: Record<number, Record<number, number>> = {};
  for (const cell of heatmap) {
    (heatByDow[cell.dow] = heatByDow[cell.dow] ?? {})[cell.hour] = cell.count;
  }
  const hours = Array.from(new Set(heatmap.map((c) => c.hour))).sort(
    (a, b) => a - b,
  );

  return (
    <>
      <AdminTopbar
        title="วิเคราะห์ลูกค้า"
        subtitle="RFM 11-segment · Cohort · Retention · Churn · AI Daily Brief"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="Customer Analytics"
          description="วิเคราะห์เชิงลึก — เห็นใครคุ้ม ใครเสี่ยง ใครต้องดูแล · ทำเอง ไม่ต้องรอ data team"
          actions={<ExportToolbar reportName="Customer Analytics" />}
        />

        {/* === KPI Cards === */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="MAU (30d)"
            value={`${kpis.mau} ราย`}
            delta={{ value: kpis.mauDelta, suffix: "vs เดือนก่อน" }}
            icon={Users}
          />
          <KpiCard
            label="ลูกค้าใหม่ (30d)"
            value={`${kpis.newCount} ราย`}
            delta={{ value: kpis.newDelta, suffix: "vs เดือนก่อน" }}
            icon={UserPlus}
            iconTone="success"
          />
          <KpiCard
            label="Returning"
            value={`${kpis.returningPct}%`}
            icon={Repeat}
            iconTone="primary"
            hint="ลูกค้าที่จองมากกว่า 1 ครั้ง"
          />
          <KpiCard
            label="Churn rate"
            value={`${kpis.churnRate}%`}
            delta={{ value: kpis.churnDelta, suffix: "delta" }}
            icon={TrendingDown}
            iconTone="warning"
          />
          <KpiCard
            label="CLV เฉลี่ย"
            value={formatBaht(kpis.clv)}
            icon={Brain}
            iconTone="primary"
            hint="Customer Lifetime Value"
          />
        </div>

        {/* === AI Daily Brief === */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI Daily Brief</CardTitle>
              <CardSubtitle>
                สรุปสั้น — Highlights / Alerts / Recommendations · อัปเดตทุกเช้า 08:00
              </CardSubtitle>
            </div>
            <IconTile icon={Sparkles} tone="primary" size="sm" />
          </CardHeader>

          <div className="grid md:grid-cols-3 gap-4">
            <BriefColumn
              title="Highlights"
              tone="success"
              icon={TrendingUp}
              items={highlightItems.map((h) => h.text)}
            />
            <BriefColumn
              title="Alerts"
              tone="warning"
              icon={AlertTriangle}
              items={alertItems.map((h) => h.text)}
            />
            <BriefColumn
              title="Recommendations"
              tone="primary"
              icon={Lightbulb}
              items={recommendItems.map((h) => h.text)}
            />
          </div>
        </Card>

        {/* === RFM Quadrant (11) + Retention Curve === */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7">
            <CardHeader>
              <div>
                <CardTitle>RFM Quadrant · 11 Segments</CardTitle>
                <CardSubtitle>
                  ตำแหน่ง = Recency × Monetary · ขนาด = จำนวนลูกค้า
                </CardSubtitle>
              </div>
              <IconTile icon={Target} tone="primary" size="sm" />
            </CardHeader>
            <div className="relative h-80 rounded-card-sm bg-surface-subtle/70 border border-line-soft overflow-hidden">
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 text-[10px] text-ink-3">
                <span className="p-2">High M · Old</span>
                <span className="p-2 text-right">High M · New</span>
                <span className="p-2 self-end">Low M · Old</span>
                <span className="p-2 text-right self-end">Low M · New</span>
              </div>
              <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              {rfm.map((s) => {
                if (s.count === 0) return null;
                const size = 22 + Math.min(50, s.count * 1.6);
                return (
                  <Link
                    key={s.key}
                    href={`/admin/customers?segment=${s.key}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${s.color} rounded-pill text-white text-[10px] font-semibold grid place-items-center shadow-card hover:scale-110 transition`}
                    style={{
                      left: `${s.x}%`,
                      top: `${100 - s.y}%`,
                      width: `${size}px`,
                      height: `${size}px`,
                    }}
                    title={`${s.name} · ${s.count} ราย`}
                  >
                    {s.count}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
              {rfm.map((s) => (
                <Link
                  key={s.key}
                  href={`/admin/customers?segment=${s.key}`}
                  className="flex items-center gap-2 hover:bg-surface-subtle rounded-pill px-1.5 py-0.5"
                >
                  <span className={`w-2 h-2 rounded-pill ${s.color}`} />
                  <span className="flex-1 text-ink-2 truncate">{s.name}</span>
                  <span className="text-ink-3 tabular-nums">{s.count}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <div>
                <CardTitle>Retention Curve</CardTitle>
                <CardSubtitle>
                  % ลูกค้าที่กลับมาใน Day 0/7/30/60/90/180/365
                </CardSubtitle>
              </div>
              <IconTile icon={Activity} tone="success" size="sm" />
            </CardHeader>

            <RetentionCurveChart points={retentionCurve} />

            <div className="mt-4 space-y-1">
              {retentionCurve.map((p) => (
                <div
                  key={p.day}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-ink-2 w-14">{p.label}</span>
                  <div className="flex-1 mx-2 h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-ink-1 font-semibold w-10 text-right">
                    {p.pct}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* === Sankey (Active vs Dormant) + Cohort Retention === */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-5">
            <CardHeader>
              <div>
                <CardTitle>Active vs Dormant Flow</CardTitle>
                <CardSubtitle>
                  การเปลี่ยนสถานะลูกค้า เดือนนี้ vs เดือนก่อน
                </CardSubtitle>
              </div>
              <IconTile icon={ArrowRight} tone="info" size="sm" />
            </CardHeader>
            <SankeyFlow data={sankey} />
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader>
              <div>
                <CardTitle>Cohort Retention</CardTitle>
                <CardSubtitle>
                  % กลุ่มลูกค้าใหม่ในแต่ละเดือนที่กลับมา
                </CardSubtitle>
              </div>
              <IconTile icon={Calendar} tone="primary" size="sm" />
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

        {/* === Behavior Heatmap === */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Behavior Heatmap</CardTitle>
              <CardSubtitle>
                จองช่วงไหนมากที่สุด · day × hour (07:00–21:00)
              </CardSubtitle>
            </div>
            <IconTile icon={Flame} tone="warning" size="sm" />
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="text-xs tabular-nums mx-auto">
              <thead>
                <tr>
                  <th className="w-10" />
                  {hours.map((h) => (
                    <th
                      key={h}
                      className="px-1 text-[10px] text-ink-3 font-medium tracking-tighter w-7 text-center"
                    >
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW_LABELS.map((label, dow) => (
                  <tr key={dow}>
                    <td className="text-right pr-2 text-ink-2 text-[11px] font-medium">
                      {label}
                    </td>
                    {hours.map((h) => {
                      const v = heatByDow[dow]?.[h] ?? 0;
                      const intensity = v / maxHeat;
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            className="w-7 h-7 rounded-md grid place-items-center text-[9px] font-semibold"
                            style={{
                              background:
                                v === 0
                                  ? "var(--bg-subtle)"
                                  : `rgba(45, 78, 245, ${0.12 + intensity * 0.78})`,
                              color: intensity > 0.5 ? "white" : "var(--ink-2)",
                            }}
                            title={`${label} ${h}:00 · ${v} จอง`}
                          >
                            {v > 0 ? v : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-ink-3 text-center">
            สีเข้ม = จองเยอะ · ใช้วางแผนแคมเปญส่งโปรเฉพาะช่วงที่ห้องว่าง
          </p>
        </Card>

        {/* === Churn Prediction & Next Best Action === */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7">
            <CardHeader>
              <div>
                <CardTitle>Churn Prediction · Top 10</CardTitle>
                <CardSubtitle>
                  ลูกค้าเสี่ยงเสียมากสุด — โทรหา/ส่งโปรภายในสัปดาห์นี้
                </CardSubtitle>
              </div>
              <IconTile icon={AlertTriangle} tone="danger" size="sm" />
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-3 text-[10px] uppercase tracking-[0.06em] border-b border-line-soft">
                    <th className="text-left font-semibold py-2 pr-2">ลูกค้า</th>
                    <th className="font-semibold py-2 px-2 text-right">
                      ห่างนาน
                    </th>
                    <th className="font-semibold py-2 px-2 text-right">
                      รายได้
                    </th>
                    <th className="font-semibold py-2 px-2 text-right">
                      Score
                    </th>
                    <th className="text-left font-semibold py-2 pl-2">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {churnRisk.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-3">
                        ยังไม่มีข้อมูลพอจะประเมิน
                      </td>
                    </tr>
                  ) : (
                    churnRisk.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-line-soft hover:bg-surface-subtle/50"
                      >
                        <td className="py-2 pr-2">
                          <Link
                            href={`/admin/customers/${row.id}`}
                            className="font-medium text-ink-1 hover:text-primary-600"
                          >
                            {row.name}
                          </Link>
                          <p className="text-[10px] text-ink-3">
                            {row.totalBookings} จอง
                          </p>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-ink-2">
                          {row.daysSinceLast}d
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {formatCompactBaht(row.totalSpent)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-14 h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                              <div
                                className={
                                  row.churnScore >= 70
                                    ? "h-full bg-red-500"
                                    : row.churnScore >= 50
                                      ? "h-full bg-amber-500"
                                      : "h-full bg-emerald-500"
                                }
                                style={{ width: `${row.churnScore}%` }}
                              />
                            </div>
                            <span className="tabular-nums font-bold w-7 text-right">
                              {row.churnScore}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pl-2 text-ink-2 text-[11px]">
                          {row.action}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <div>
                <CardTitle>Next Best Action</CardTitle>
                <CardSubtitle>
                  คิวงานสำหรับทีม — เรียงตาม urgency
                </CardSubtitle>
              </div>
              <IconTile icon={Zap} tone="primary" size="sm" />
            </CardHeader>
            <div className="space-y-2">
              {nextBestActions.length === 0 && (
                <p className="text-xs text-ink-3">ยังไม่มีลูกค้าให้ดำเนินการ</p>
              )}
              {nextBestActions.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/customers/${row.id}`}
                  className="flex items-center gap-3 p-3 rounded-card-sm border border-line hover:border-primary-200 hover:bg-primary-50/30 transition"
                >
                  <ChannelIcon channel={row.channel} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-1 truncate">
                      {row.name}
                    </p>
                    <p className="text-[11px] text-ink-3 truncate">
                      {row.segmentLabel} · {row.action}
                    </p>
                  </div>
                  <Badge
                    tone={
                      row.urgency === "high"
                        ? "danger"
                        : row.urgency === "med"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {row.urgency === "high"
                      ? "เร่งด่วน"
                      : row.urgency === "med"
                        ? "กลาง"
                        : "ปกติ"}
                  </Badge>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* === Source Performance + Popular rooms per segment === */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7">
            <CardHeader>
              <div>
                <CardTitle>Source Performance</CardTitle>
                <CardSubtitle>
                  ช่องทางไหนคุ้มที่สุด · CLV · Churn · ROI
                </CardSubtitle>
              </div>
              <IconTile icon={Megaphone} tone="info" size="sm" />
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-3 text-[10px] uppercase tracking-[0.06em] border-b border-line-soft">
                    <th className="text-left font-semibold py-2 pr-2">Source</th>
                    <th className="font-semibold py-2 px-2 text-right">
                      ลูกค้า
                    </th>
                    <th className="font-semibold py-2 px-2 text-right">จอง</th>
                    <th className="font-semibold py-2 px-2 text-right">
                      Revenue
                    </th>
                    <th className="font-semibold py-2 px-2 text-right">CLV</th>
                    <th className="font-semibold py-2 px-2 text-right">Churn</th>
                    <th className="font-semibold py-2 px-2 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-3">
                        ยังไม่มีข้อมูล source
                      </td>
                    </tr>
                  ) : (
                    sources.map((row) => (
                      <tr key={row.source} className="border-t border-line-soft">
                        <td className="py-2 pr-2 font-medium">{row.label}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.customers}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-ink-3">
                          {row.bookings}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">
                          {formatCompactBaht(row.revenue)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {formatCompactBaht(row.clv)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span
                            className={
                              row.churnPct >= 15
                                ? "pill-danger text-[10px]"
                                : row.churnPct >= 8
                                  ? "pill-warning text-[10px]"
                                  : "pill-success text-[10px]"
                            }
                          >
                            {row.churnPct}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span
                            className={
                              row.roi >= 100
                                ? "text-emerald-600 font-bold tabular-nums"
                                : row.roi >= 0
                                  ? "text-ink-1 font-semibold tabular-nums"
                                  : "text-red-600 font-semibold tabular-nums"
                            }
                          >
                            {row.roi >= 0 ? "+" : ""}
                            {row.roi}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] text-ink-3">
              * ROI ประมาณการณ์โดยใช้ acquisition cost: LINE ฿80 · BNI ฿250 ·
              Facebook ฿350 · Google ฿420 · Email ฿60 (ปรับใน
              /admin/settings/marketing ภายหลัง)
            </p>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <div>
                <CardTitle>ห้องที่นิยม · per segment</CardTitle>
                <CardSubtitle>
                  รู้ว่าแต่ละกลุ่มชอบห้องไหน — เสนอที่ตรงใจ
                </CardSubtitle>
              </div>
              <IconTile icon={Crown} tone="warning" size="sm" />
            </CardHeader>
            <div className="space-y-1.5">
              {segmentRooms.length === 0 && (
                <p className="text-xs text-ink-3">ยังไม่มีข้อมูล</p>
              )}
              {segmentRooms.map((row) => (
                <div
                  key={row.segment}
                  className="flex items-center gap-3 px-3 py-2 rounded-card-sm bg-surface-subtle/50"
                >
                  <span
                    className="w-2 h-8 rounded-pill"
                    style={{ background: row.topRoomColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-1 truncate">
                      {row.segmentLabel}
                    </p>
                    <p className="text-[10px] text-ink-3 truncate">
                      {row.topRoom} · {row.topRoomCount}/{row.totalBookings} จอง
                    </p>
                  </div>
                  <span className="text-[10px] tabular-nums text-ink-2 font-semibold">
                    {row.totalBookings > 0
                      ? Math.round(
                          (row.topRoomCount / row.totalBookings) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* === CLV Prediction + What-if Simulator + Anomalies === */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-5">
            <CardHeader>
              <div>
                <CardTitle>CLV Prediction · 12m</CardTitle>
                <CardSubtitle>
                  คาดการณ์รายได้รวม 12 เดือนต่อ segment
                </CardSubtitle>
              </div>
              <IconTile icon={Brain} tone="primary" size="sm" />
            </CardHeader>
            <div className="space-y-1.5">
              {clvPredict.slice(0, 8).map((row) => {
                const maxClv = Math.max(...clvPredict.map((r) => r.predicted12m));
                return (
                  <div
                    key={row.segment}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-28 truncate text-ink-2">{row.label}</span>
                    <div className="flex-1 h-2 rounded-pill bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full bg-primary-500"
                        style={{
                          width: `${maxClv > 0 ? (row.predicted12m / maxClv) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-20 text-right tabular-nums font-semibold">
                      {formatCompactBaht(row.predicted12m)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-ink-3">
              สูตร: avg CLV × (1 + retention assumption ต่อ segment)
            </p>
          </Card>

          <div className="lg:col-span-4">
            <WhatIfSimulator
              baseline={{
                champions: championsCount,
                loyal: loyalCount,
                potential: potentialCount,
                atRisk: atRiskCount,
                hibernating: hibernatingCount,
                avgClv: kpis.clv,
              }}
            />
          </div>

          <Card className="lg:col-span-3">
            <CardHeader>
              <div>
                <CardTitle>Anomaly</CardTitle>
                <CardSubtitle>ปริมาณ + churn ผิดปกติ</CardSubtitle>
              </div>
              <IconTile icon={Clock} tone="warning" size="sm" />
            </CardHeader>
            <div className="space-y-2.5">
              {anomalies.map((a, i) => (
                <div
                  key={i}
                  className="p-3 rounded-card-sm border border-line bg-white"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        a.level === "danger"
                          ? "dot dot-danger mt-1.5"
                          : a.level === "warning"
                            ? "dot dot-warning mt-1.5"
                            : "dot dot-info mt-1.5"
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-1 tracking-tight">
                        {a.title}
                      </p>
                      <p className="text-[10px] text-ink-3 mt-0.5 leading-relaxed">
                        {a.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function BriefColumn({
  title,
  tone,
  icon: Icon,
  items,
}: {
  title: string;
  tone: "primary" | "success" | "warning";
  icon: typeof TrendingUp;
  items: string[];
}) {
  const headerClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-primary-700";
  return (
    <div className="p-4 rounded-card-sm border border-line bg-white">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} strokeWidth={1.75} className={headerClass} />
        <p className={`font-semibold text-sm tracking-tight ${headerClass}`}>
          {title}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((text, i) => (
            <li key={i} className="text-xs text-ink-2 leading-relaxed">
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RetentionCurveChart({
  points,
}: {
  points: { day: number; label: string; pct: number }[];
}) {
  const w = 100;
  const h = 56;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((p) => h - (p.pct / 100) * h);
  const path = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <div className="relative h-32 rounded-card-sm bg-emerald-50/40 border border-emerald-100 p-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <path d={area} fill="rgba(16, 185, 129, 0.2)" />
        <path
          d={path}
          fill="none"
          stroke="#059669"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.day}
            cx={xs[i]}
            cy={ys[i]}
            r="1.2"
            fill="#059669"
          />
        ))}
      </svg>
    </div>
  );
}

interface SankeyData {
  fromActive: number;
  fromDormant: number;
  becameActive: number;
  becameDormant: number;
  stayedActive: number;
  stayedDormant: number;
  newlyAcquired: number;
}

function SankeyFlow({ data }: { data: SankeyData }) {
  const totalLeft = data.fromActive + data.fromDormant + data.newlyAcquired;
  if (totalLeft === 0) {
    return (
      <p className="text-xs text-ink-3 py-6 text-center">
        ยังไม่มีข้อมูลพอ — ต้องมีลูกค้าอย่างน้อย 2 เดือน
      </p>
    );
  }
  const activeNow = data.stayedActive + data.becameActive + data.newlyAcquired;
  const dormantNow = data.stayedDormant + data.becameDormant;

  const lActivePct = (data.fromActive / totalLeft) * 100;
  const lDormantPct = (data.fromDormant / totalLeft) * 100;
  const lNewPct = (data.newlyAcquired / totalLeft) * 100;
  const rActivePct = (activeNow / (activeNow + dormantNow || 1)) * 100;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <p className="text-ink-3 uppercase tracking-[0.06em] font-semibold">
          เดือนก่อน
        </p>
        <p className="text-ink-3 uppercase tracking-[0.06em] font-semibold text-right">
          เดือนนี้
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <FlowBar
            label="Active"
            value={data.fromActive}
            pct={lActivePct}
            tone="emerald"
          />
          <FlowBar
            label="Dormant"
            value={data.fromDormant}
            pct={lDormantPct}
            tone="slate"
          />
          <FlowBar
            label="ใหม่"
            value={data.newlyAcquired}
            pct={lNewPct}
            tone="blue"
          />
        </div>
        <div className="space-y-1">
          <FlowBar
            label="Active"
            value={activeNow}
            pct={rActivePct}
            tone="emerald"
          />
          <FlowBar
            label="Dormant"
            value={dormantNow}
            pct={100 - rActivePct}
            tone="slate"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-line-soft space-y-1.5 text-xs">
        <FlowItem
          label="Stayed Active"
          value={data.stayedActive}
          tone="success"
        />
        <FlowItem
          label="Became Active (winback)"
          value={data.becameActive}
          tone="info"
        />
        <FlowItem
          label="Became Dormant"
          value={data.becameDormant}
          tone="warning"
        />
        <FlowItem
          label="New customers"
          value={data.newlyAcquired}
          tone="primary"
        />
      </div>
    </div>
  );
}

function FlowBar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "emerald" | "slate" | "blue";
}) {
  const bg =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "blue"
        ? "bg-blue-500"
        : "bg-slate-400";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 text-ink-2 truncate">{label}</span>
      <div className="flex-1 h-3 rounded-pill bg-surface-subtle overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums font-semibold">{value}</span>
    </div>
  );
}

function FlowItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "warning" | "primary";
}) {
  const Icon =
    tone === "warning" ? ArrowDownRight : tone === "success" ? Repeat : ArrowUpRight;
  return (
    <div className="flex items-center gap-2">
      <Badge tone={tone}>
        <Icon size={11} strokeWidth={1.75} /> {value}
      </Badge>
      <span className="text-ink-2 text-[11px]">{label}</span>
    </div>
  );
}

function ChannelIcon({
  channel,
}: {
  channel: "call" | "line" | "email" | "campaign";
}) {
  if (channel === "call") return <IconTile icon={Phone} tone="danger" size="sm" />;
  if (channel === "email") return <IconTile icon={Mail} tone="info" size="sm" />;
  if (channel === "campaign")
    return <IconTile icon={Megaphone} tone="warning" size="sm" />;
  return <IconTile icon={MessageCircle} tone="success" size="sm" />;
}
