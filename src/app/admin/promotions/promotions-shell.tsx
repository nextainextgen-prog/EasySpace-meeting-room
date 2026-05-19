"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Tag,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
  Megaphone,
  Filter,
  Wand2,
  CalendarCheck,
  Gift,
  Repeat,
  Crown,
  AlertTriangle,
  Users,
  Send,
  Activity,
  TrendingUp,
  ShieldAlert,
  Lightbulb,
  Bot,
  Percent,
  CircleDollarSign,
  PackageCheck,
  Clock,
  Ticket,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatBaht, formatCompactBaht, formatDate } from "@/lib/format";
import { PromotionCard } from "./promotion-card";
import { PromotionWizard, type WizardRoom } from "./promotion-wizard";
import { bulkSendPromotion } from "@/lib/actions/promotions";
import type { PromotionWithMetrics } from "@/lib/data/promotions";
import type {
  PromotionDeep,
  AbuseSignal,
  AutoPromoRow,
  AbTestRow,
  AiSuggestion,
  PromotionFunnelRow,
} from "@/lib/data/promotions-deep";

interface Props {
  initialPromos: PromotionWithMetrics[];
  rooms: WizardRoom[];
  summary: {
    active: number;
    scheduled: number;
    totalSaving: number;
    totalRevenue: number;
  };
  deep: PromotionDeep;
  currentUserId: string | null;
}

type SidebarFilter =
  | "all"
  | "active"
  | "scheduled"
  | "draft"
  | "paused"
  | "expired"
  | "top"
  | "underperform"
  | "mine"
  | "needs_attention";

const TYPE_FILTERS = [
  { id: "all", label: "ทุกประเภท", icon: Tag },
  { id: "percentage", label: "ส่วนลด %", icon: Percent },
  { id: "fixed", label: "เงินคงที่", icon: CircleDollarSign },
  { id: "package_upgrade", label: "Package", icon: PackageCheck },
  { id: "free_addon", label: "Add-on", icon: Gift },
  { id: "bogo", label: "BOGO", icon: Repeat },
  { id: "voucher", label: "Voucher", icon: Ticket },
] as const;

const TARGET_FILTERS = [
  { id: "all", label: "ทุกกลุ่ม" },
  { id: "vip", label: "VIP" },
  { id: "new", label: "ลูกค้าใหม่" },
  { id: "hibernating", label: "Hibernating" },
  { id: "segment", label: "Segment-based" },
] as const;

export function PromotionsShell({
  initialPromos,
  rooms,
  summary,
  deep,
  currentUserId,
}: Props) {
  const [view, setView] = useState<"card" | "table">("card");
  const [tab, setTab] = useState<"list" | "analytics" | "automation">("list");
  const [filter, setFilter] = useState<SidebarFilter>("all");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["id"]>(
    "all",
  );
  const [targetFilter, setTargetFilter] = useState<
    (typeof TARGET_FILTERS)[number]["id"]
  >("all");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);

  const conflictMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of deep.conflicts) m.set(c.promotionId, c.message);
    return m;
  }, [deep.conflicts]);

  const promos = useMemo(() => {
    return initialPromos.filter((p) => {
      if (search.trim()) {
        const hay = `${p.name} ${p.code ?? ""}`.toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      if (filter === "active" && p.status !== "active") return false;
      if (filter === "scheduled" && p.status !== "scheduled") return false;
      if (filter === "draft" && p.status !== "draft") return false;
      if (filter === "paused" && p.status !== "paused") return false;
      if (filter === "expired" && p.status !== "expired") return false;
      if (filter === "top") {
        if (p.roi < 2) return false;
      }
      if (filter === "underperform") {
        if (p.uses_count > 0 && p.roi >= 1.5) return false;
      }
      if (filter === "needs_attention") {
        if (!conflictMap.has(p.id) && p.status !== "draft") return false;
      }
      if (typeFilter !== "all" && p.discount_type !== typeFilter) return false;
      if (
        targetFilter === "vip" &&
        !p.applicable_tags.includes("VIP")
      )
        return false;
      if (
        targetFilter === "new" &&
        !p.applicable_segments.includes("new")
      )
        return false;
      if (
        targetFilter === "hibernating" &&
        !p.applicable_segments.includes("hibernating")
      )
        return false;
      if (
        targetFilter === "segment" &&
        p.applicable_segments.length === 0
      )
        return false;
      return true;
    });
  }, [initialPromos, filter, typeFilter, targetFilter, search, conflictMap]);

  const sidebarCounts = useMemo(
    () => ({
      all: initialPromos.length,
      active: initialPromos.filter((p) => p.status === "active").length,
      scheduled: initialPromos.filter((p) => p.status === "scheduled").length,
      draft: initialPromos.filter((p) => p.status === "draft").length,
      paused: initialPromos.filter((p) => p.status === "paused").length,
      expired: initialPromos.filter((p) => p.status === "expired").length,
      top: initialPromos.filter((p) => p.roi >= 2).length,
      underperform: initialPromos.filter(
        (p) => p.uses_count > 0 && p.roi < 1.5,
      ).length,
      mine: initialPromos.length,
      needs_attention: conflictMap.size,
    }),
    [initialPromos, conflictMap],
  );

  return (
    <>
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiTile
            icon={Sparkles}
            tone="primary"
            label="Active"
            value={String(summary.active)}
            hint={`${summary.scheduled} scheduled`}
          />
          <KpiTile
            icon={Tag}
            tone="info"
            label="ทั้งหมด"
            value={String(initialPromos.length)}
            hint={`${sidebarCounts.draft} ร่าง`}
          />
          <KpiTile
            icon={TrendingUp}
            tone="success"
            label="Promo Revenue"
            value={formatCompactBaht(summary.totalRevenue)}
            hint={`${deep.totalRedemptions} redemptions`}
          />
          <KpiTile
            icon={CircleDollarSign}
            tone="warning"
            label="Total Discount"
            value={formatCompactBaht(summary.totalSaving)}
            hint={`AOV ${formatCompactBaht(deep.averageAov)}`}
          />
          <KpiTile
            icon={ShieldAlert}
            tone={deep.abuse.length > 0 ? "danger" : "muted"}
            label="Abuse signals"
            value={String(deep.abuse.length)}
            hint={
              deep.abuse.length > 0
                ? "ตรวจสอบโดยด่วน"
                : "ปกติ"
            }
          />
        </div>

        {/* Tabs + Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-subtle">
            {(
              [
                { id: "list", label: "รายการ", icon: ListIcon },
                { id: "analytics", label: "Analytics", icon: Activity },
                { id: "automation", label: "Automation", icon: Bot },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-9 px-4 rounded-pill text-xs font-medium transition flex items-center gap-1.5",
                    tab === t.id
                      ? "bg-white shadow-card text-ink-1"
                      : "text-ink-3 hover:text-ink-1",
                  )}
                >
                  <Icon size={13} strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Wand2 size={14} strokeWidth={1.75} />}
              onClick={() => {
                const first = deep.suggestions[0];
                if (first) {
                  setAiSuggestion(first);
                  setWizardOpen(true);
                } else {
                  alert("ยังไม่มีคำแนะนำเพิ่มเติม");
                }
              }}
            >
              AI Suggest
            </Button>
            <Button
              size="sm"
              iconLeft={<Plus size={14} strokeWidth={1.75} />}
              onClick={() => {
                setAiSuggestion(null);
                setWizardOpen(true);
              }}
            >
              สร้างโปรโมชั่น
            </Button>
          </div>
        </div>

        {tab === "list" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Sidebar */}
            <aside className="lg:col-span-3 space-y-4">
              <Card className="!p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                  Status
                </p>
                <SidebarList
                  items={[
                    { id: "all", label: "ทั้งหมด", count: sidebarCounts.all },
                    {
                      id: "active",
                      label: "Active",
                      count: sidebarCounts.active,
                    },
                    {
                      id: "scheduled",
                      label: "Scheduled",
                      count: sidebarCounts.scheduled,
                    },
                    {
                      id: "draft",
                      label: "Draft",
                      count: sidebarCounts.draft,
                    },
                    {
                      id: "paused",
                      label: "Paused",
                      count: sidebarCounts.paused,
                    },
                    {
                      id: "expired",
                      label: "Expired",
                      count: sidebarCounts.expired,
                    },
                  ]}
                  value={filter}
                  onChange={(v) => setFilter(v as SidebarFilter)}
                />
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mt-4 mb-2">
                  Performance
                </p>
                <SidebarList
                  items={[
                    { id: "top", label: "Top performers", count: sidebarCounts.top },
                    {
                      id: "underperform",
                      label: "Underperforming",
                      count: sidebarCounts.underperform,
                    },
                    {
                      id: "needs_attention",
                      label: "Needs attention",
                      count: sidebarCounts.needs_attention,
                    },
                  ]}
                  value={filter}
                  onChange={(v) => setFilter(v as SidebarFilter)}
                />
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mt-4 mb-2">
                  Mine
                </p>
                <SidebarList
                  items={[
                    {
                      id: "mine",
                      label: "My promotions",
                      count: sidebarCounts.mine,
                    },
                  ]}
                  value={filter}
                  onChange={(v) => setFilter(v as SidebarFilter)}
                />
              </Card>

              <Card className="!p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                  Type
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_FILTERS.map((t) => {
                    const Icon = t.icon;
                    const active = typeFilter === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTypeFilter(t.id)}
                        className={cn(
                          "px-2.5 h-8 rounded-pill text-[11px] font-medium border transition flex items-center gap-1",
                          active
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-line hover:bg-surface-subtle text-ink-2",
                        )}
                      >
                        <Icon size={11} strokeWidth={1.75} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mt-4 mb-2">
                  Target
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TARGET_FILTERS.map((t) => {
                    const active = targetFilter === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTargetFilter(t.id)}
                        className={cn(
                          "px-2.5 h-8 rounded-pill text-[11px] font-medium border transition",
                          active
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-line hover:bg-surface-subtle text-ink-2",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* AI Suggestions */}
              {deep.suggestions.length > 0 && (
                <Card className="!p-4 bg-primary-50/60 border-primary-100">
                  <div className="flex items-center gap-2 mb-3">
                    <IconTile icon={Lightbulb} tone="primary" size="sm" />
                    <p className="text-xs font-bold tracking-tight text-primary-700">
                      AI Suggestions
                    </p>
                  </div>
                  <div className="space-y-2">
                    {deep.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setAiSuggestion(s);
                          setWizardOpen(true);
                        }}
                        className="w-full text-left p-2.5 rounded-card-sm bg-white border border-line hover:border-primary-200"
                      >
                        <p className="text-xs font-semibold text-ink-1 tracking-tight">
                          {s.title}
                        </p>
                        <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">
                          {s.rationale}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                          <span className="pill-info">
                            +{s.suggestedDiscount}%
                          </span>
                          <span className="text-ink-3">
                            ~{s.estimatedReach} ราย
                          </span>
                          <span className="text-emerald-700 font-semibold ml-auto">
                            {formatCompactBaht(s.estimatedRevenue)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </aside>

            {/* Main */}
            <main className="lg:col-span-9 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  iconLeft={<Search size={14} strokeWidth={1.75} />}
                  placeholder="ค้นหาโปรโมชั่น / โค้ด"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="!h-9 max-w-sm"
                />
                <span className="text-xs text-ink-3 ml-auto">
                  พบ {promos.length} โปรโมชั่น
                </span>
                <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-subtle">
                  <button
                    onClick={() => setView("card")}
                    className={cn(
                      "w-8 h-8 grid place-items-center rounded-pill transition",
                      view === "card"
                        ? "bg-white shadow-card text-ink-1"
                        : "text-ink-3",
                    )}
                    aria-label="Card view"
                  >
                    <LayoutGrid size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => setView("table")}
                    className={cn(
                      "w-8 h-8 grid place-items-center rounded-pill transition",
                      view === "table"
                        ? "bg-white shadow-card text-ink-1"
                        : "text-ink-3",
                    )}
                    aria-label="Table view"
                  >
                    <ListIcon size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {promos.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="ยังไม่มีโปรโมชั่น"
                  description="สร้างโปรโมชั่นเพื่อกระตุ้นยอดจอง · ผูกกับ Rules Builder, Promo Code, Auto-apply"
                  action={
                    <Button
                      iconLeft={<Plus size={14} strokeWidth={1.75} />}
                      onClick={() => setWizardOpen(true)}
                    >
                      สร้างโปรโมชั่น
                    </Button>
                  }
                />
              ) : view === "card" ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {promos.map((p) => (
                    <PromotionCard
                      key={p.id}
                      promo={p}
                      conflict={conflictMap.get(p.id)}
                    />
                  ))}
                </div>
              ) : (
                <PromotionTable
                  promos={promos}
                  conflicts={conflictMap}
                  onBroadcast={(id) =>
                    bulkSendPromotion({
                      promotionId: id,
                      channel: "line",
                      segment: "all",
                    }).then(() => alert("คิวส่ง LINE สำเร็จ"))
                  }
                />
              )}
            </main>
          </div>
        )}

        {tab === "analytics" && (
          <PromotionAnalytics deep={deep} promos={initialPromos} />
        )}

        {tab === "automation" && (
          <PromotionAutomation
            autoPromos={deep.autoPromos}
            abuse={deep.abuse}
            abTests={deep.abTests}
          />
        )}
      </div>

      <PromotionWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setAiSuggestion(null);
        }}
        rooms={rooms}
        suggestion={
          aiSuggestion
            ? {
                title: aiSuggestion.title,
                promotionType: aiSuggestion.promotionType,
                suggestedDiscount: aiSuggestion.suggestedDiscount,
              }
            : undefined
        }
      />
    </>
  );
}

function KpiTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Tag;
  tone: "primary" | "success" | "warning" | "danger" | "info" | "muted";
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="!p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          {label}
        </span>
        <IconTile icon={Icon} tone={tone} size="sm" />
      </div>
      <p className="text-2xl font-bold tracking-tighter tabular-nums text-ink-1">
        {value}
      </p>
      {hint && <p className="text-[11px] text-ink-3 mt-1">{hint}</p>}
    </Card>
  );
}

function SidebarList({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: string; label: string; count: number }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-pill text-xs transition",
            value === item.id
              ? "bg-primary-50 text-primary-700 font-semibold"
              : "text-ink-2 hover:bg-surface-subtle",
          )}
        >
          <span>{item.label}</span>
          <span className="tabular-nums text-[11px] text-ink-3">
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function PromotionTable({
  promos,
  conflicts,
  onBroadcast,
}: {
  promos: PromotionWithMetrics[];
  conflicts: Map<string, string>;
  onBroadcast: (id: string) => void;
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-subtle">
            <tr className="text-ink-3 text-[10px] uppercase tracking-[0.06em]">
              <th className="text-left py-2.5 pl-4 pr-2 font-semibold">โปรโมชั่น</th>
              <th className="text-left py-2.5 px-2 font-semibold">Code</th>
              <th className="text-right py-2.5 px-2 font-semibold">ส่วนลด</th>
              <th className="text-right py-2.5 px-2 font-semibold">ใช้</th>
              <th className="text-right py-2.5 px-2 font-semibold">Saving</th>
              <th className="text-right py-2.5 px-2 font-semibold">ROI</th>
              <th className="text-left py-2.5 px-2 font-semibold">สิ้นสุด</th>
              <th className="text-left py-2.5 px-2 font-semibold">Status</th>
              <th className="py-2.5 pr-4" />
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr
                key={p.id}
                className="border-t border-line-soft hover:bg-surface-subtle/40"
              >
                <td className="py-2 pl-4 pr-2">
                  <p className="font-medium text-ink-1">{p.name}</p>
                  {conflicts.has(p.id) && (
                    <p className="text-[10px] text-amber-700 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={10} strokeWidth={1.75} />
                      {conflicts.get(p.id)}
                    </p>
                  )}
                </td>
                <td className="py-2 px-2 font-mono text-[11px]">
                  {p.code ?? "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {p.discount_type === "percentage"
                    ? `${p.discount_value}%`
                    : p.discount_type === "fixed"
                      ? formatBaht(p.discount_value)
                      : p.discount_type}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {p.uses_count}
                  {p.total_quota ? ` / ${p.total_quota}` : ""}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatBaht(p.total_saving)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold">
                  {p.roi.toFixed(1)}x
                </td>
                <td className="py-2 px-2 text-ink-2">
                  {p.ends_at ? formatDate(p.ends_at) : "—"}
                </td>
                <td className="py-2 px-2">
                  <Badge
                    tone={
                      p.status === "active"
                        ? "success"
                        : p.status === "scheduled"
                          ? "info"
                          : p.status === "paused"
                            ? "warning"
                            : "muted"
                    }
                  >
                    {p.status}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  <button
                    className="text-ink-3 hover:text-primary-600"
                    onClick={() => onBroadcast(p.id)}
                    title="ส่ง LINE/Email"
                  >
                    <Send size={14} strokeWidth={1.75} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PromotionAnalytics({
  deep,
  promos,
}: {
  deep: PromotionDeep;
  promos: PromotionWithMetrics[];
}) {
  const top = [...deep.funnel].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <IconTile icon={Activity} tone="primary" size="sm" />
          <div>
            <p className="font-semibold tracking-tight">Funnel by promotion</p>
            <p className="text-xs text-ink-3">
              Reach → View → Redemption → Revenue · AOV
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-ink-3 text-[10px] uppercase tracking-[0.06em]">
              <tr>
                <th className="text-left py-2 pr-2">โปรโมชั่น</th>
                <th className="text-right py-2 px-2">Reachable</th>
                <th className="text-right py-2 px-2">Views</th>
                <th className="text-right py-2 px-2">Redemptions</th>
                <th className="text-right py-2 px-2">Conv %</th>
                <th className="text-right py-2 px-2">Revenue</th>
                <th className="text-right py-2 px-2">AOV</th>
              </tr>
            </thead>
            <tbody>
              {top.map((f) => (
                <tr key={f.promotionId} className="border-t border-line-soft">
                  <td className="py-2 pr-2 font-medium">{f.name}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {f.reachable}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {f.views}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">
                    {f.redemptions}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span
                      className={
                        f.conversionPct >= 20
                          ? "pill-success text-[10px]"
                          : f.conversionPct >= 8
                            ? "pill-info text-[10px]"
                            : "pill-muted text-[10px]"
                      }
                    >
                      {f.conversionPct}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">
                    {formatBaht(f.revenue)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatBaht(f.aov)}
                  </td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-3">
                    ยังไม่มี redemption
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <IconTile icon={TrendingUp} tone="success" size="sm" />
            <div>
              <p className="font-semibold tracking-tight">Top performer</p>
              <p className="text-xs text-ink-3">
                โปรที่ทำรายได้มากสุด
              </p>
            </div>
          </div>
          {deep.topPerformer ? (
            <div className="surface-subtle p-4">
              <p className="font-semibold text-ink-1">
                {deep.topPerformer.name}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <Metric
                  label="Revenue"
                  value={formatBaht(deep.topPerformer.revenue)}
                />
                <Metric
                  label="Redemptions"
                  value={String(deep.topPerformer.redemptions)}
                />
                <Metric
                  label="AOV"
                  value={formatBaht(deep.topPerformer.aov)}
                />
                <Metric
                  label="Conv"
                  value={`${deep.topPerformer.conversionPct}%`}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-3">ยังไม่มีข้อมูล</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-3">
            <IconTile icon={ShieldAlert} tone="danger" size="sm" />
            <div>
              <p className="font-semibold tracking-tight">Abuse Detection</p>
              <p className="text-xs text-ink-3">
                ลูกค้าที่ใช้เกิน quota / multi-account
              </p>
            </div>
          </div>
          {deep.abuse.length === 0 ? (
            <p className="text-xs text-ink-3">ไม่พบความผิดปกติ</p>
          ) : (
            <div className="space-y-1.5">
              {deep.abuse.slice(0, 6).map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-card-sm bg-red-50/60 border border-red-100"
                >
                  <span
                    className={cn(
                      "dot mt-0.5",
                      a.severity === "high"
                        ? "dot-danger"
                        : a.severity === "medium"
                          ? "dot-warning"
                          : "dot-info",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink-1 truncate">
                      {a.customerName ?? "หลายบัญชี"}
                    </p>
                    <p className="text-[10px] text-ink-3 truncate">
                      {a.promotionName} · {a.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PromotionAutomation({
  autoPromos,
  abuse,
  abTests,
}: {
  autoPromos: AutoPromoRow[];
  abuse: AbuseSignal[];
  abTests: AbTestRow[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <IconTile icon={Bot} tone="primary" size="sm" />
          <div>
            <p className="font-semibold tracking-tight">Auto-promotions</p>
            <p className="text-xs text-ink-3">
              Birthday / Welcome / Winback / Anniversary — สร้างให้อัตโนมัติ
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {autoPromos.map((row) => (
            <div
              key={row.trigger}
              className="flex items-center gap-3 p-3 rounded-card-sm border border-line"
            >
              <IconTile
                icon={
                  row.trigger === "birthday"
                    ? Gift
                    : row.trigger === "welcome"
                      ? CalendarCheck
                      : row.trigger === "hibernating"
                        ? Repeat
                        : Crown
                }
                tone={row.enabled ? "primary" : "muted"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-1 tracking-tight">
                  {row.label}
                </p>
                <p className="text-[11px] text-ink-3 leading-relaxed">
                  {row.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold tabular-nums">
                  {row.matches}
                </p>
                <p className="text-[10px] text-ink-3">{row.defaultDiscount}</p>
              </div>
              <Badge tone={row.enabled ? "success" : "muted"}>
                {row.enabled ? "active" : "idle"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <IconTile icon={Activity} tone="info" size="sm" />
          <div>
            <p className="font-semibold tracking-tight">A/B Test Builder</p>
            <p className="text-xs text-ink-3">
              เปรียบเทียบสองโปรที่ชื่อใกล้เคียง (A vs B)
            </p>
          </div>
        </div>
        {abTests.length === 0 ? (
          <p className="text-xs text-ink-3">
            สร้างโปรชื่อ &quot;ABC A&quot; กับ &quot;ABC B&quot; แล้วระบบจะจับคู่อัตโนมัติ
          </p>
        ) : (
          <div className="space-y-3">
            {abTests.map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-card-sm border border-line"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold tracking-tight">
                    {t.variantA} <span className="text-ink-3">vs</span>{" "}
                    {t.variantB}
                  </p>
                  <Badge
                    tone={
                      t.winner === "tie"
                        ? "muted"
                        : t.winner === "A"
                          ? "success"
                          : "info"
                    }
                  >
                    {t.winner === "tie" ? "เสมอ" : `Winner ${t.winner}`}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-card-sm bg-emerald-50/60 p-2">
                    <p className="text-ink-3">Variant A</p>
                    <p className="font-bold tabular-nums">
                      {t.redemptionsA} ใช้ · {formatBaht(t.revenueA)}
                    </p>
                  </div>
                  <div className="rounded-card-sm bg-blue-50/60 p-2">
                    <p className="text-ink-3">Variant B</p>
                    <p className="font-bold tabular-nums">
                      {t.redemptionsB} ใช้ · {formatBaht(t.revenueB)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <div className="flex items-center gap-3 mb-4">
          <IconTile icon={Send} tone="success" size="sm" />
          <div>
            <p className="font-semibold tracking-tight">Bulk send</p>
            <p className="text-xs text-ink-3">
              ส่งโปรไปยังกลุ่มเป้าหมายผ่าน LINE Official / Email · เลือกที่ตาราง
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-3 leading-relaxed">
          ใช้ปุ่ม{" "}
          <Send
            size={12}
            strokeWidth={1.75}
            className="inline mx-0.5 text-primary-600"
          />{" "}
          ในมุมมอง Table — ระบบจะคิว broadcast ผ่าน LINE Official และส่งอีเมลผ่าน Resend
          พร้อมบันทึก activity ที่ /admin/customers
        </p>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-3 text-[10px] uppercase tracking-[0.06em]">
        {label}
      </p>
      <p className="font-bold tabular-nums text-ink-1">{value}</p>
    </div>
  );
}
