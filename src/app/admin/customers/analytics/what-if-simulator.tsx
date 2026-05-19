"use client";

import { useMemo, useState } from "react";
import { Sliders } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export interface WhatIfBaseline {
  champions: number;
  loyal: number;
  potential: number;
  atRisk: number;
  hibernating: number;
  avgClv: number;
}

export function WhatIfSimulator({ baseline }: { baseline: WhatIfBaseline }) {
  const [retain, setRetain] = useState(10); // % reduction in churn
  const [winback, setWinback] = useState(15); // % winback of at-risk
  const [upsell, setUpsell] = useState(10); // % ARPU lift on champions/loyal

  const projection = useMemo(() => {
    const saved =
      (baseline.atRisk + baseline.hibernating) *
      (retain / 100) *
      baseline.avgClv;
    const recovered =
      baseline.atRisk * (winback / 100) * baseline.avgClv;
    const lifted =
      (baseline.champions + baseline.loyal) *
      (upsell / 100) *
      baseline.avgClv;
    return Math.round(saved + recovered + lifted);
  }, [baseline, retain, winback, upsell]);

  const baselineTotal =
    (baseline.champions +
      baseline.loyal +
      baseline.potential +
      baseline.atRisk +
      baseline.hibernating) *
    baseline.avgClv;

  const liftPct =
    baselineTotal > 0 ? Math.round((projection / baselineTotal) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>What-if Simulation</CardTitle>
          <CardSubtitle>เลื่อน slider — เห็นผลลัพธ์รายได้ทันที</CardSubtitle>
        </div>
        <IconTile icon={Sliders} tone="primary" size="sm" />
      </CardHeader>

      <div className="space-y-5">
        <SliderRow
          label="Churn ลดลง"
          value={retain}
          onChange={setRetain}
          suffix="%"
          tone="emerald"
          hint={`รักษา ${Math.round(
            (baseline.atRisk + baseline.hibernating) * (retain / 100),
          )} ราย`}
        />
        <SliderRow
          label="Winback สำเร็จ"
          value={winback}
          onChange={setWinback}
          suffix="%"
          tone="blue"
          hint={`กลับมา ${Math.round(baseline.atRisk * (winback / 100))} ราย`}
        />
        <SliderRow
          label="Upsell Champions/Loyal"
          value={upsell}
          onChange={setUpsell}
          suffix="%"
          tone="violet"
          hint={`ARPU เพิ่ม ${upsell}%`}
        />
      </div>

      <div className="mt-6 rounded-card-sm bg-primary-50 border border-primary-100 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-primary-700 font-semibold">
              รายได้เพิ่มคาดการณ์ · 12 เดือน
            </p>
            <p className="text-3xl font-bold text-primary-700 tabular-nums mt-1">
              ฿{projection.toLocaleString("th-TH")}
            </p>
          </div>
          <span className="pill-success text-xs">
            +{liftPct}% vs baseline
          </span>
        </div>
      </div>
    </Card>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  suffix,
  tone,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  tone: "emerald" | "blue" | "violet";
  hint?: string;
}) {
  const toneClass = {
    emerald: "accent-emerald-500",
    blue: "accent-blue-500",
    violet: "accent-violet-500",
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <span className="text-xs font-bold tabular-nums text-ink-1">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${toneClass}`}
      />
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  );
}
