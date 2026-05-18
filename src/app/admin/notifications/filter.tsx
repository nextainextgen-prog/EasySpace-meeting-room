"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { NotificationCategory, NotificationLevel } from "@/lib/types";

interface Item {
  id: string;
  category: NotificationCategory;
  level: NotificationLevel;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationsFilter({
  counts,
  labels,
  items,
  renderItem,
  empty,
}: {
  counts: Record<string, number>;
  labels: Record<string, string>;
  items: Item[];
  renderItem: (n: Item) => React.ReactNode;
  empty: React.ReactNode;
}) {
  const [active, setActive] = useState<string>("all");
  const filters = [
    { key: "all", label: "ทั้งหมด", count: counts.all ?? 0 },
    { key: "time", label: labels.time, count: counts.time ?? 0 },
    { key: "finance", label: labels.finance, count: counts.finance ?? 0 },
    { key: "ai_digest", label: labels.ai_digest, count: counts.ai_digest ?? 0 },
    { key: "ai_insight", label: labels.ai_insight, count: counts.ai_insight ?? 0 },
    { key: "system", label: labels.system, count: counts.system ?? 0 },
  ];

  const filtered =
    active === "all" ? items : items.filter((n) => n.category === active);

  return (
    <>
      <Card className="!p-3">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`px-4 py-2 rounded-pill text-sm font-medium tracking-tight transition ${
                active === f.key
                  ? "bg-primary-600 text-white"
                  : "text-ink-2 hover:bg-surface-subtle"
              }`}
            >
              {f.label}
              <span className="ml-2 text-[11px] opacity-80 tabular-nums">
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {filtered.length === 0 ? empty : <ul className="space-y-3">{filtered.map(renderItem)}</ul>}
    </>
  );
}
