"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Tag,
  Star,
  ArrowRight,
  Copy,
  Play,
  Pause,
  Trash2,
  Send,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { formatBaht, formatDate } from "@/lib/format";
import {
  duplicatePromotion,
  setPromotionStatus,
  deletePromotion,
} from "@/lib/actions/promotions";
import type { PromotionWithMetrics } from "@/lib/data/promotions";

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

export function PromotionCard({
  promo,
  conflict,
}: {
  promo: PromotionWithMetrics;
  conflict?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "error");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <IconTile icon={Tag} tone="primary" />
          <div className="min-w-0">
            <CardTitle className="truncate">{promo.name}</CardTitle>
            <CardSubtitle>
              Code: <span className="font-mono">{promo.code ?? "—"}</span>
            </CardSubtitle>
          </div>
        </div>
        <Badge tone={STATUS_TONE[promo.status]}>
          {STATUS_LABEL[promo.status]}
        </Badge>
      </CardHeader>

      <div className="space-y-3 text-sm">
        <Row label="ส่วนลด">
          <span className="font-semibold tabular-nums">
            {promo.discount_type === "percentage"
              ? `${promo.discount_value}%`
              : promo.discount_type === "fixed"
                ? formatBaht(promo.discount_value)
                : promo.discount_type}
          </span>
        </Row>
        <Row label="ใช้แล้ว">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
              <div
                className="h-full bg-primary-500"
                style={{
                  width: promo.total_quota
                    ? `${Math.min(100, (promo.uses_count / promo.total_quota) * 100)}%`
                    : "100%",
                }}
              />
            </div>
            <span className="font-semibold tabular-nums">
              {promo.uses_count}
              {promo.total_quota ? ` / ${promo.total_quota}` : ""}
            </span>
          </div>
        </Row>
        <Row label="Saving">
          <span className="font-semibold tabular-nums">
            {formatBaht(promo.total_saving)}
          </span>
        </Row>
        <Row label="ROI">
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={12}
                strokeWidth={1.5}
                fill={i < Math.round(promo.roi) ? "#F59E0B" : "none"}
                className={
                  i < Math.round(promo.roi) ? "text-amber-500" : "text-line"
                }
              />
            ))}
            <span className="ml-1 text-xs font-semibold tabular-nums">
              {promo.roi.toFixed(1)}x
            </span>
          </span>
        </Row>
        {promo.ends_at && (
          <Row label="สิ้นสุด">
            <span className="font-medium">{formatDate(promo.ends_at)}</span>
          </Row>
        )}
      </div>

      {conflict && (
        <div className="mt-4 rounded-card-sm border border-amber-200 bg-amber-50 p-2.5 flex items-start gap-2">
          <AlertTriangle
            size={14}
            strokeWidth={1.75}
            className="text-amber-700 shrink-0 mt-0.5"
          />
          <p className="text-[11px] text-amber-800 leading-relaxed">{conflict}</p>
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-line-soft flex justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={
              promo.status === "active" ? (
                <Pause size={14} strokeWidth={1.75} />
              ) : (
                <Play size={14} strokeWidth={1.75} />
              )
            }
            disabled={isPending}
            onClick={() =>
              act(() =>
                setPromotionStatus(
                  promo.id,
                  promo.status === "active" ? "paused" : "active",
                ),
              )
            }
          >
            {promo.status === "active" ? "Pause" : "Activate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Copy size={14} strokeWidth={1.75} />}
            disabled={isPending}
            onClick={() => act(() => duplicatePromotion(promo.id))}
            aria-label="duplicate"
          >
            Duplicate
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (confirm(`ลบ "${promo.name}" จริงหรือไม่?`)) {
                act(() => deletePromotion(promo.id));
              }
            }}
            aria-label="delete"
            iconLeft={<Trash2 size={14} strokeWidth={1.75} />}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-3">{label}</span>
      {children}
    </div>
  );
}
