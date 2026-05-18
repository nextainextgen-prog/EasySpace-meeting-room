import { Plus, Tag, ArrowRight, Star, Sparkles } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { listPromotions, promotionsSummary } from "@/lib/data";
import { formatBaht, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  draft: "muted",
  scheduled: "info",
  active: "success",
  paused: "warning",
  expired: "muted",
} as const;

const STATUS_LABEL = {
  draft: "ร่าง",
  scheduled: "ตั้งเวลา",
  active: "Active",
  paused: "หยุด",
  expired: "หมดอายุ",
} as const;

export default async function PromotionsPage() {
  const [promos, summary] = await Promise.all([
    listPromotions(),
    promotionsSummary(),
  ]);

  return (
    <>
      <AdminTopbar
        title="โปรโมชั่น"
        subtitle="สร้างโปร · Coupon · Auto-apply · ROI tracking"
        actions={<Button iconLeft={<Plus size={16} />}>สร้างโปรโมชั่น</Button>}
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="Promotions"
          description="ขับเคลื่อนยอดด้วยส่วนลด · เห็น ROI ของทุกแคมเปญ"
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Active", value: String(summary.active) },
            { label: "Scheduled", value: String(summary.scheduled) },
            {
              label: "Total Discount Given",
              value: formatBaht(summary.totalSaving),
            },
            {
              label: "Promo Revenue",
              value: formatBaht(summary.totalRevenue),
            },
          ].map((s) => (
            <Card key={s.label} className="!p-5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                {s.label}
              </p>
              <p className="text-2xl font-bold tracking-tighter tabular-nums">
                {s.value}
              </p>
            </Card>
          ))}
        </div>

        {promos.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="ยังไม่มีโปรโมชั่น"
            description="สร้างโปรโมชั่นเพื่อกระตุ้นยอดจอง · ผูกกับ Rules Builder, Promo Code, Auto-apply"
            action={<Button iconLeft={<Plus size={16} />}>สร้างโปรโมชั่น</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {promos.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <IconTile icon={Tag} tone="primary" />
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <CardSubtitle>
                        Code:{" "}
                        <span className="font-mono">{p.code ?? "—"}</span>
                      </CardSubtitle>
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[p.status]}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </CardHeader>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">ส่วนลด</span>
                    <span className="font-semibold tabular-nums">
                      {p.discount_type === "percentage"
                        ? `${p.discount_value}%`
                        : p.discount_type === "fixed"
                          ? formatBaht(p.discount_value)
                          : p.discount_type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">ใช้แล้ว</span>
                    <span className="font-semibold tabular-nums">
                      {p.uses_count}
                      {p.total_quota ? ` / ${p.total_quota}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">Saving รวม</span>
                    <span className="font-semibold tabular-nums">
                      {formatBaht(p.total_saving)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">ROI</span>
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          strokeWidth={1.5}
                          fill={i < Math.round(p.roi) ? "#F59E0B" : "none"}
                          className={
                            i < Math.round(p.roi)
                              ? "text-amber-500"
                              : "text-line"
                          }
                        />
                      ))}
                      <span className="ml-1 text-xs font-semibold tabular-nums">
                        {p.roi.toFixed(1)}x
                      </span>
                    </span>
                  </div>
                  {p.ends_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">สิ้นสุด</span>
                      <span className="font-medium">
                        {formatDate(p.ends_at)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-5 border-t border-line-soft flex justify-between">
                  <Button variant="ghost" size="sm">
                    {p.status === "active" ? "Pause" : "Activate"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconRight={<ArrowRight size={14} />}
                  >
                    ดูรายละเอียด
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
