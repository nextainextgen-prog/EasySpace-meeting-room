"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { updatePublicConfig } from "@/lib/actions/online-payment";
import { estimatePrice, thb, type PricingConfig } from "@/lib/public-booking/pricing";
import { cn } from "@/lib/cn";

/** VAT / withholding / OT / quotation rules for online requests. */
export function PricingCard({ initial }: { initial: PricingConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PricingConfig>(k: K, v: PricingConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updatePublicConfig({ pricing: cfg });
      setMsg(r.ok ? { ok: true, text: "บันทึกการตั้งค่าราคาแล้ว" } : { ok: false, text: r.error });
    });
  }

  // Worked example so the admin sees what the customer will see.
  const ex = estimatePrice({ hourlyRate: 600, packages: [], startTime: "17:00", minutes: 180, cfg, withholding: true });

  return (
    <Card>
      <p className="font-semibold tracking-tight">ราคา ภาษี และใบเสนอราคา</p>
      <p className="mt-0.5 text-xs text-ink-3">
        ใช้คำนวณราคาเบื้องต้นที่ลูกค้าเห็นก่อนส่งคำขอ และเป็นค่าเริ่มต้นตอนออกใบเสนอราคา
      </p>

      <div className="mt-4 space-y-4">
        {/* Quotation flow */}
        <Toggle
          checked={cfg.quote_required}
          onChange={(v) => set("quote_required", v)}
          title="ต้องออกใบเสนอราคาก่อนชำระเงิน"
          sub="ลูกค้าส่งคำขอ → แอดมินตรวจสอบและออกใบเสนอราคา → ลูกค้ายืนยันและชำระ → ยืนยันการจอง · ปิด = ลูกค้าชำระได้ทันทีหลังจอง"
        />
        {cfg.quote_required && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>กันห้องระหว่างรอใบเสนอราคา</Label>
              <Select value={String(cfg.request_hold_hours)} onChange={(e) => set("request_hold_hours", Number(e.target.value))}>
                {[2, 4, 8, 12, 24, 48, 72].map((h) => (
                  <option key={h} value={h}>
                    {h < 24 ? `${h} ชั่วโมง` : `${h / 24} วัน`}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>ใบเสนอราคายืนราคา</Label>
              <Select value={String(cfg.quote_valid_hours)} onChange={(e) => set("quote_valid_hours", Number(e.target.value))}>
                {[6, 12, 24, 48, 72, 168].map((h) => (
                  <option key={h} value={h}>
                    {h < 24 ? `${h} ชั่วโมง` : `${h / 24} วัน`}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {/* VAT */}
        <div className="border-t border-line-soft pt-4">
          <Toggle checked={cfg.vat_enabled} onChange={(v) => set("vat_enabled", v)} title="คิดภาษีมูลค่าเพิ่ม (VAT)" sub="แสดงราคาก่อน VAT, VAT และราคารวม VAT" />
          {cfg.vat_enabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label>อัตรา VAT (%)</Label>
                <Input type="number" min={0} max={30} step={0.5} value={cfg.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))} />
              </div>
              <div>
                <Label>ราคาห้องที่ตั้งไว้</Label>
                <Select value={cfg.vat_inclusive ? "in" : "ex"} onChange={(e) => set("vat_inclusive", e.target.value === "in")}>
                  <option value="in">รวม VAT แล้ว</option>
                  <option value="ex">ยังไม่รวม VAT (บวกเพิ่ม)</option>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* WHT */}
        <div className="border-t border-line-soft pt-4">
          <Toggle
            checked={cfg.wht_enabled}
            onChange={(v) => set("wht_enabled", v)}
            title="ให้ลูกค้านิติบุคคลเลือกหักภาษี ณ ที่จ่าย"
            sub="คำนวณจากราคาก่อน VAT · ลูกค้าต้องกรอกเลขผู้เสียภาษี 13 หลัก"
          />
          {cfg.wht_enabled && (
            <div className="mt-3 max-w-[200px]">
              <Label>อัตราหัก ณ ที่จ่าย (%)</Label>
              <Input type="number" min={0} max={15} step={0.5} value={cfg.wht_rate} onChange={(e) => set("wht_rate", Number(e.target.value))} />
            </div>
          )}
        </div>

        {/* OT */}
        <div className="border-t border-line-soft pt-4">
          <Toggle checked={cfg.ot_enabled} onChange={(v) => set("ot_enabled", v)} title="คิดค่า OT" sub="ชั่วโมงที่ใช้หลังเวลาที่กำหนด คิดค่าบริการเพิ่ม" />
          {cfg.ot_enabled && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <Label>เริ่มคิด OT</Label>
                <Select value={cfg.ot_start} onChange={(e) => set("ot_start", e.target.value)}>
                  {["17:00", "17:30", "18:00", "18:30", "19:00", "20:00"].map((t) => (
                    <option key={t} value={t}>
                      {t} น.
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>คิดแบบ</Label>
                <Select value={cfg.ot_type} onChange={(e) => set("ot_type", e.target.value as PricingConfig["ot_type"])}>
                  <option value="per_hour">บาท / ชั่วโมง</option>
                  <option value="percent">% ของราคาห้อง/ชม.</option>
                </Select>
              </div>
              <div>
                <Label>{cfg.ot_type === "per_hour" ? "บาทต่อชั่วโมง" : "เปอร์เซ็นต์"}</Label>
                <Input type="number" min={0} value={cfg.ot_value} onChange={(e) => set("ot_value", Number(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {/* Example */}
        <div className="rounded-input border border-line bg-surface-subtle/60 px-4 py-3 text-xs">
          <p className="mb-1.5 font-semibold text-ink-1">ตัวอย่าง: ห้อง ฿600/ชม. จอง 17:00–20:00 (3 ชม.) นิติบุคคลหัก ณ ที่จ่าย</p>
          <div className="space-y-0.5 tabular-nums text-ink-2">
            {ex.lines.map((l) => (
              <Row key={l.label} k={l.label} v={thb(l.amount)} />
            ))}
            {ex.vatEnabled && <Row k="ราคาก่อน VAT" v={thb(ex.preVat)} />}
            {ex.vatEnabled && <Row k={`VAT ${ex.vatRate}%`} v={thb(ex.vat)} />}
            <Row k={ex.vatEnabled ? "ราคารวม VAT" : "ราคารวม"} v={thb(ex.grandTotal)} strong />
            {ex.withholding && <Row k={`หัก ณ ที่จ่าย ${ex.whtRate}%`} v={`−${thb(ex.wht)}`} />}
            {ex.withholding && <Row k="ลูกค้าโอนจริง" v={thb(ex.netPayable)} strong />}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {msg && <p className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>}
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "บันทึก..." : "บันทึกการตั้งค่าราคา"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Toggle({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium tracking-tight">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{sub}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-pill transition", checked ? "bg-ink-1" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "font-semibold text-ink-1")}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
