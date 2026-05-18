import {
  Plus,
  Tag,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Star,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { promotions } from "@/lib/mocks";
import { formatBaht, formatDate } from "@/lib/format";

export default function PromotionsPage() {
  return (
    <>
      <AdminTopbar
        title="โปรโมชั่น"
        subtitle="สร้างโปร · Coupon · Auto-apply · ROI tracking"
        actions={
          <Button iconLeft={<Plus size={16} />}>สร้างโปรโมชั่น</Button>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="Promotions"
          description="ขับเคลื่อนยอดด้วยส่วนลด · เห็น ROI ของทุกแคมเปญ"
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Active", value: "3", tone: "success" as const },
            { label: "Scheduled", value: "1", tone: "info" as const },
            { label: "Total Discount Given", value: formatBaht(8500), tone: "warning" as const },
            { label: "Incremental Revenue", value: formatBaht(42000), tone: "success" as const },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {promotions.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <IconTile icon={Tag} tone="primary" />
                  <div>
                    <CardTitle>{p.name}</CardTitle>
                    <CardSubtitle>
                      Code: <span className="font-mono">{p.code}</span>
                    </CardSubtitle>
                  </div>
                </div>
                <Badge tone="success">Active</Badge>
              </CardHeader>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">ส่วนลด</span>
                  <span className="font-semibold tabular-nums">
                    {p.discountType === "percentage"
                      ? `${p.value}%`
                      : formatBaht(p.value)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">ใช้แล้ว</span>
                  <span className="font-semibold tabular-nums">
                    {p.used}
                    {p.quota ? ` / ${p.quota}` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">Saving รวม</span>
                  <span className="font-semibold tabular-nums">
                    {formatBaht(p.saving)}
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
                {p.endsAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">สิ้นสุด</span>
                    <span className="font-medium">{formatDate(p.endsAt)}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-5 border-t border-line-soft flex justify-between">
                <Button variant="ghost" size="sm">
                  Pause
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
      </div>
    </>
  );
}
