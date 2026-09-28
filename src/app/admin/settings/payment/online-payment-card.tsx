"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  PlugZap,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  saveSecret,
  savePromptPayId,
  testEasySlip,
  updatePublicConfig,
} from "@/lib/actions/online-payment";
import { cn } from "@/lib/cn";

interface Props {
  config: {
    payment_enabled: boolean;
    payment_mode: "deposit" | "full";
    deposit_percent: number;
    payment_hold_minutes: number;
  };
  promptpayId: string;
  easyslip: { masked: string | null; source: "env" | "db" | "none" };
  missing: string[];
  ready: boolean;
}

const HOLD_OPTIONS = [15, 30, 60, 120, 240, 1440];

export function OnlinePaymentCard({ config: initial, promptpayId: initialPp, easyslip, missing, ready }: Props) {
  const [cfg, setCfg] = useState(initial);
  const [pp, setPp] = useState(initialPp);
  const [key, setKey] = useState("");
  const [masked, setMasked] = useState(easyslip.masked);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [quota, setQuota] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flash(tone: "ok" | "err", text: string) {
    setMsg({ tone, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function saveAll() {
    start(async () => {
      const a = await updatePublicConfig(cfg);
      if (!a.ok) return flash("err", a.error);
      if (pp.replace(/\D/g, "") !== initialPp) {
        const b = await savePromptPayId(pp);
        if (!b.ok) return flash("err", b.error);
      }
      flash("ok", "บันทึกการตั้งค่าการชำระเงินแล้ว");
    });
  }

  function saveKey(clear = false) {
    start(async () => {
      const r = await saveSecret("easyslip", clear ? "" : key);
      if (!r.ok) return flash("err", r.error);
      setMasked(r.masked ?? null);
      setKey("");
      flash("ok", clear ? "ลบ API key แล้ว" : "บันทึก API key แล้ว (ทดสอบเชื่อมต่อผ่าน)");
    });
  }

  function test() {
    start(async () => {
      const r = await testEasySlip();
      if (!r.ok) {
        setQuota(null);
        return flash("err", r.message);
      }
      const d = r.data;
      setQuota(
        `${d.application} · ใช้ไป ${d.usedQuota}/${d.maxQuota ?? "ไม่จำกัด"} · เหลือ ${d.remainingQuota ?? "ไม่จำกัด"} สลิป · หมดอายุ ${new Date(d.expiredAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`,
      );
    });
  }

  const example = 1200;
  const due = cfg.payment_mode === "full" ? example : Math.ceil((example * cfg.deposit_percent) / 100);

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold tracking-tight">ชำระเงินออนไลน์ (แนบสลิป · EasySlip)</p>
          <p className="mt-0.5 text-xs text-ink-3">
            ลูกค้าจองจากหน้า /rooms แล้วโอนเงิน + แนบสลิป ระบบตรวจกับธนาคารและยืนยันการจองอัตโนมัติ
          </p>
        </div>
        <Badge tone={ready ? "success" : "warning"} className="!text-[10px]">
          {ready ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}
        </Badge>
      </div>

      {!ready && missing.length > 0 && (
        <div className="mb-3 rounded-input border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <p className="mb-1 inline-flex items-center gap-1 font-semibold">
            <AlertTriangle size={12} /> ยังเปิดรับชำระออนไลน์ไม่ได้
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700">ระหว่างนี้ลูกค้ายังจองได้ตามปกติ (ทีมงานโทรยืนยัน)</p>
        </div>
      )}

      <div className="space-y-3">
        <label className="flex items-start gap-2.5 rounded-input border border-line bg-white px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={cfg.payment_enabled}
            onChange={(e) => setCfg({ ...cfg, payment_enabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-primary-600"
          />
          <span>
            <span className="block font-medium tracking-tight">ให้ลูกค้าชำระเงินหลังจอง</span>
            <span className="mt-0.5 block text-xs text-ink-3">
              ปิด = ลูกค้าจองแล้วรอทีมงานโทรยืนยันแบบเดิม
            </span>
          </span>
        </label>

        <div>
          <Label>รูปแบบการชำระ</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["deposit", "มัดจำก่อน", "ส่วนที่เหลือชำระวันใช้ห้อง"],
                ["full", "ชำระเต็มจำนวน", "จ่ายครบตอนจอง"],
              ] as const
            ).map(([v, title, sub]) => (
              <button
                key={v}
                type="button"
                onClick={() => setCfg({ ...cfg, payment_mode: v })}
                className={cn(
                  "rounded-input border px-3 py-2.5 text-left transition",
                  cfg.payment_mode === v
                    ? "border-primary-600 bg-primary-50/60 ring-2 ring-primary-600/10"
                    : "border-line bg-white hover:border-primary-600/30",
                )}
              >
                <p className="text-sm font-semibold tracking-tight">{title}</p>
                <p className="text-xs text-ink-3">{sub}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>เปอร์เซ็นต์มัดจำ</Label>
            <Select
              value={String(cfg.deposit_percent)}
              disabled={cfg.payment_mode === "full"}
              onChange={(e) => setCfg({ ...cfg, deposit_percent: Number(e.target.value) })}
            >
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>เวลาให้ชำระหลังจอง</Label>
            <Select
              value={String(cfg.payment_hold_minutes)}
              onChange={(e) => setCfg({ ...cfg, payment_hold_minutes: Number(e.target.value) })}
            >
              {HOLD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} นาที` : m === 1440 ? "24 ชั่วโมง" : `${m / 60} ชั่วโมง`}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="-mt-1 text-xs text-ink-3">
          ตัวอย่าง: จองราคา ฿{example.toLocaleString()} → ลูกค้าโอน{" "}
          <b className="text-ink-1">฿{due.toLocaleString()}</b> · ไม่ชำระภายในเวลาที่กำหนด ห้องจะถูกปล่อยอัตโนมัติ
        </p>

        <div>
          <Label>พร้อมเพย์ (ไม่บังคับ)</Label>
          <Input
            value={pp}
            onChange={(e) => setPp(e.target.value)}
            inputMode="numeric"
            placeholder="เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก"
          />
          <p className="mt-1 text-xs text-ink-3">ใส่แล้วลูกค้าจะเห็น QR พร้อมเพย์ที่มียอดเงินขึ้นให้อัตโนมัติ</p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" iconLeft={<Save size={12} />} onClick={saveAll} disabled={pending}>
            บันทึกการตั้งค่าการชำระ
          </Button>
        </div>

        {/* EasySlip key */}
        <div className="rounded-input border border-line bg-surface-subtle/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <KeyRound size={14} className="text-ink-3" /> EasySlip API key
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <ShieldCheck size={12} /> เก็บฝั่งเซิร์ฟเวอร์ ไม่แสดงต่อสาธารณะ
            </span>
          </div>
          {easyslip.source === "env" ? (
            <p className="text-xs text-ink-2">
              ใช้ค่าจาก Environment variable <code className="font-mono">EASYSLIP_API_KEY</code> ({masked})
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-2">
                ปัจจุบัน: {masked ? <code className="font-mono text-ink-1">{masked}</code> : "ยังไม่ได้ตั้งค่า"}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="วาง API key ใหม่"
                  className="!h-9 flex-1 !text-sm"
                />
                <Button size="sm" onClick={() => saveKey()} disabled={pending || !key.trim()}>
                  บันทึก
                </Button>
                {masked && (
                  <Button size="sm" variant="ghost" onClick={() => saveKey(true)} disabled={pending}>
                    ลบ
                  </Button>
                )}
              </div>
            </>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" iconLeft={<PlugZap size={12} />} onClick={test} disabled={pending}>
              ทดสอบเชื่อมต่อ / ดูโควตา
            </Button>
            {quota && <span className="text-xs text-emerald-700">{quota}</span>}
          </div>
        </div>

        {msg && (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              msg.tone === "ok" ? "text-emerald-700" : "text-red-600",
            )}
          >
            {msg.tone === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {msg.text}
          </p>
        )}
      </div>
    </Card>
  );
}
