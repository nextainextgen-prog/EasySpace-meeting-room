"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import { thb, totalsFromLines, type PricingConfig } from "@/lib/public-booking/pricing";
import type { RequestRow } from "@/lib/server/quotations";
import { issueQuotationAction, rejectRequestAction } from "@/lib/actions/quotations";

type Tab = "requested" | "quoted" | "accepted" | "confirmed" | "all";

const STAGE_LABEL: Record<string, string> = {
  requested: "รอออกใบเสนอราคา",
  quoted: "รอลูกค้ายืนยัน",
  accepted: "รอชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  cancelled: "ยกเลิก",
};

function stageOf(r: RequestRow): string {
  if (["cancelled", "no_show"].includes(r.booking_status)) return "cancelled";
  if (["confirmed", "in_use", "completed"].includes(r.booking_status)) return "confirmed";
  return r.metadata?.public?.stage ?? "requested";
}

const when = (s: string, e: string) => `${bkkDateLabel(s)} · ${bkkTime(s)}–${bkkTime(e)} น.`;

export function RequestsBoard({ rows, focus, pricing }: { rows: RequestRow[]; focus: string | null; pricing: PricingConfig }) {
  const [tab, setTab] = useState<Tab>(focus ? "all" : "requested");
  const counts = useMemo(() => {
    const c: Record<string, number> = { requested: 0, quoted: 0, accepted: 0, confirmed: 0 };
    for (const r of rows) c[stageOf(r)] = (c[stageOf(r)] ?? 0) + 1;
    return c;
  }, [rows]);
  const visible = rows
    .filter((r) => tab === "all" || stageOf(r) === tab)
    .sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-white px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        ลูกค้าเลือกห้อง → เลือกวันเวลา → ระบบเช็กห้องว่าง → คำนวณราคาเบื้องต้น → ส่งคำขอ →
        <b className="text-ink-1"> แอดมินตรวจสอบและออกใบเสนอราคา</b> → ลูกค้ายืนยันและชำระเงิน → ยืนยันการจอง
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-pill bg-white p-1 ring-1 ring-line">
        {(
          [
            ["requested", `รอออกใบเสนอราคา ${counts.requested}`],
            ["quoted", `รอลูกค้ายืนยัน ${counts.quoted}`],
            ["accepted", `รอชำระเงิน ${counts.accepted}`],
            ["confirmed", `ยืนยันแล้ว ${counts.confirmed}`],
            ["all", `ทั้งหมด ${rows.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "h-8 rounded-pill px-4 text-xs font-semibold tracking-tight",
              tab === k ? "bg-ink-1 text-white" : "text-ink-2 hover:bg-surface-subtle",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border border-line bg-white px-5 py-10 text-center text-sm text-ink-3">ไม่มีรายการ</div>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => (
            <RequestCard key={r.id} r={r} pricing={pricing} highlighted={r.id === focus} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface EditLine {
  label: string;
  qty: number;
  unitPrice: number;
}

function RequestCard({ r, pricing, highlighted }: { r: RequestRow; pricing: PricingConfig; highlighted: boolean }) {
  const router = useRouter();
  const pub = r.metadata?.public;
  const stage = stageOf(r);
  const est = pub?.pricing;
  const doc = pub?.doc ?? null;
  const canQuote = ["requested", "quoted"].includes(stage) && Number(r.paid_amount) === 0;
  const [editing, setEditing] = useState(stage === "requested" && highlighted);
  const initialLines: EditLine[] = (pub?.quote?.lines ?? est?.lines ?? []).map((l) => ({
    label: l.label,
    qty: Number((l as { qty?: number }).qty ?? 1),
    unitPrice: Number((l as { unitPrice?: number }).unitPrice ?? l.amount),
  }));
  const [lines, setLines] = useState<EditLine[]>(initialLines.length ? initialLines : [{ label: "ค่าห้องประชุม", qty: 1, unitPrice: Number(r.total_amount) }]);
  const [discount, setDiscount] = useState(pub?.quote?.breakdown.discount ?? 0);
  const [withholding, setWithholding] = useState(Boolean(doc?.withholding && doc.taxId));
  const [validHours, setValidHours] = useState(pricing.quote_valid_hours);
  const [note, setNote] = useState(pub?.quote?.note ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const totals = totalsFromLines(
    lines.filter((l) => l.label.trim() && l.qty > 0).map((l) => ({ ...l, amount: Math.round(l.qty * l.unitPrice * 100) / 100 })),
    discount,
    pricing,
    withholding && Boolean(doc?.taxId),
  );

  function setLine(i: number, patch: Partial<EditLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function issue() {
    setMsg(null);
    start(async () => {
      const res = await issueQuotationAction({ bookingId: r.id, lines, discount, withholding, validHours, note });
      if (!res.ok) return setMsg({ ok: false, text: res.message ?? "ไม่สำเร็จ" });
      setMsg({ ok: true, text: `ออกใบเสนอราคา ${"number" in res ? res.number : ""} แล้ว — ส่งให้ลูกค้าแล้ว` });
      setEditing(false);
      router.refresh();
    });
  }

  function reject() {
    if (!reason.trim()) return setMsg({ ok: false, text: "ระบุเหตุผลที่จะแจ้งลูกค้าก่อน" });
    if (!confirm("ปฏิเสธคำขอนี้และปล่อยห้อง?")) return;
    start(async () => {
      const res = await rejectRequestAction(r.id, reason);
      if (!res.ok) return setMsg({ ok: false, text: res.message ?? "ไม่สำเร็จ" });
      router.refresh();
    });
  }

  const customerUrl = pub?.token ? `/rooms/booking/${r.reference_code}?t=${pub.token}` : null;

  return (
    <li className={cn("overflow-hidden rounded-card border bg-white", highlighted ? "border-ink-1" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", stage === "confirmed" ? "bg-emerald-500" : stage === "cancelled" ? "bg-rose-500" : "bg-ink-1")} />
            {STAGE_LABEL[stage] ?? stage}
          </span>
          <span className="font-mono text-sm font-semibold">{r.reference_code}</span>
          {pub?.quote && <span className="font-mono text-xs text-ink-3">{pub.quote.number}</span>}
        </div>
        <span className="text-xs text-ink-3 tabular-nums">
          ส่งคำขอ {bkkDateLabel(r.created_at)} {bkkTime(r.created_at)} น.
          {r.hold_expires_at && r.booking_status === "pending" ? ` · กันห้องถึง ${bkkDateLabel(r.hold_expires_at)} ${bkkTime(r.hold_expires_at)} น.` : ""}
        </span>
      </div>

      <div className="grid gap-px bg-line-soft md:grid-cols-3">
        <section className="bg-white px-5 py-4 text-sm">
          <p className="text-xs font-medium text-ink-3">ลูกค้า</p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight">{doc?.company || pub?.company || r.customer?.display_name}</p>
          <p className="text-ink-2">{r.customer?.display_name}</p>
          <p className="text-ink-2">{[r.customer?.phone, r.customer?.email].filter(Boolean).join(" · ")}</p>
          {doc && (
            <div className="mt-2 text-xs text-ink-2">
              {doc.taxId && <p>เลขผู้เสียภาษี {doc.taxId} {doc.branch ? `· ${doc.branch}` : ""}</p>}
              {doc.address && <p>{doc.address}</p>}
              <p>หัก ณ ที่จ่าย: {doc.withholding ? "ใช่" : "ไม่หัก"}</p>
            </div>
          )}
          {r.notes && <p className="mt-2 border-l-2 border-line pl-2 text-xs text-ink-2">{r.notes}</p>}
        </section>
        <section className="bg-white px-5 py-4 text-sm">
          <p className="text-xs font-medium text-ink-3">การใช้ห้อง</p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight">{r.room?.name}</p>
          <p className="text-ink-2">{when(r.starts_at, r.ends_at)}</p>
          <p className="text-ink-2">{r.attendees_count ? `${r.attendees_count} ท่าน` : ""}</p>
          {(pub?.displaced?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs text-ink-2">ทับคิวภายใน {pub!.displaced.length} รายการ — ดูที่เมนู คิวทับซ้อน</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {customerUrl && (
              <a href={customerUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink-1 underline underline-offset-4">
                เปิดหน้าลูกค้า
              </a>
            )}
            {pub?.quote && pub.token && (
              <a href={`/rooms/quote/${r.reference_code}?t=${pub.token}`} target="_blank" rel="noreferrer" className="text-ink-2 underline underline-offset-4">
                พิมพ์ใบเสนอราคา
              </a>
            )}
          </div>
        </section>
        <section className="bg-white px-5 py-4 text-sm">
          <p className="text-xs font-medium text-ink-3">{pub?.quote ? "ตามใบเสนอราคา" : "ราคาประเมินที่ลูกค้าเห็น"}</p>
          {(pub?.quote?.breakdown ?? est) ? (
            <dl className="mt-1 space-y-1 tabular-nums">
              {(() => {
                const b = pub?.quote?.breakdown ?? est!;
                return (
                  <>
                    {b.vatEnabled && <Line k={`ก่อน VAT / VAT ${b.vatRate}%`} v={`${thb(b.preVat)} / ${thb(b.vat)}`} />}
                    <Line k={b.vatEnabled ? "รวม VAT" : "รวม"} v={thb(b.grandTotal)} strong />
                    {b.withholding && <Line k={`หัก ณ ที่จ่าย ${b.whtRate}%`} v={`−${thb(b.wht)}`} />}
                    {b.withholding && <Line k="ลูกค้าโอนจริง" v={thb(b.netPayable)} strong />}
                    <Line k="ชำระแล้ว" v={thb(Number(r.paid_amount))} />
                  </>
                );
              })()}
            </dl>
          ) : (
            <p className="mt-1 text-ink-3">-</p>
          )}
        </section>
      </div>

      {canQuote && r.booking_status === "pending" && (
        <div className="border-t border-line-soft px-5 py-4">
          {!editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-9 rounded-pill bg-ink-1 px-4 text-sm font-semibold text-white"
              >
                {pub?.quote ? "แก้ไข / ออกใบเสนอราคาใหม่" : "ออกใบเสนอราคา"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th className="pb-1 font-medium">รายการ</th>
                    <th className="w-20 pb-1 text-right font-medium">จำนวน</th>
                    <th className="w-32 pb-1 text-right font-medium">ราคา/หน่วย</th>
                    <th className="w-28 pb-1 text-right font-medium">รวม</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <input value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} className="h-9 w-full rounded-input border border-line px-2.5 outline-none focus:border-ink-1" />
                      </td>
                      <td className="py-1 pl-1">
                        <input type="number" min={0} step={0.5} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className="h-9 w-full rounded-input border border-line px-2 text-right outline-none focus:border-ink-1" />
                      </td>
                      <td className="py-1 pl-1">
                        <input type="number" min={0} step={1} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className="h-9 w-full rounded-input border border-line px-2 text-right outline-none focus:border-ink-1" />
                      </td>
                      <td className="py-1 text-right tabular-nums">{thb(Math.round(l.qty * l.unitPrice * 100) / 100)}</td>
                      <td className="py-1 text-right">
                        <button type="button" aria-label="ลบรายการ" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface-subtle hover:text-rose-600">
                          <Trash size={15} weight="light" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => setLines((ls) => [...ls, { label: "", qty: 1, unitPrice: 0 }])} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-1">
                <Plus size={14} weight="bold" /> เพิ่มรายการ (เช่น อาหารว่าง, อุปกรณ์เพิ่ม)
              </button>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-xs text-ink-3">
                  ส่วนลด (บาท)
                  <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="mt-1 h-9 w-full rounded-input border border-line px-2.5 text-sm text-ink-1 outline-none focus:border-ink-1" />
                </label>
                <label className="text-xs text-ink-3">
                  ยืนราคา
                  <select value={validHours} onChange={(e) => setValidHours(Number(e.target.value))} className="mt-1 h-9 w-full rounded-input border border-line bg-white px-2 text-sm text-ink-1">
                    {[6, 12, 24, 48, 72, 168].map((h) => (
                      <option key={h} value={h}>
                        {h < 24 ? `${h} ชั่วโมง` : `${h / 24} วัน`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm text-ink-1">
                  <input type="checkbox" checked={withholding} disabled={!doc?.taxId} onChange={(e) => setWithholding(e.target.checked)} className="h-4 w-4 accent-[#0F172A]" />
                  หัก ณ ที่จ่าย {pricing.wht_rate}%{!doc?.taxId ? " (ไม่มีเลขผู้เสียภาษี)" : ""}
                </label>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="หมายเหตุในใบเสนอราคา (ไม่บังคับ) เช่น เงื่อนไขการยกเลิก, รวมน้ำดื่ม" className="w-full rounded-input border border-line px-3 py-2 text-sm outline-none focus:border-ink-1" />

              <div className="ml-auto max-w-sm space-y-1 rounded-input bg-surface-subtle px-4 py-3 text-sm tabular-nums">
                {totals.discount > 0 && <Line k="ส่วนลด" v={`−${thb(totals.discount)}`} />}
                {totals.vatEnabled && <Line k="ราคาก่อน VAT" v={thb(totals.preVat)} />}
                {totals.vatEnabled && <Line k={`VAT ${totals.vatRate}%${totals.vatInclusive ? " (รวมในราคา)" : ""}`} v={thb(totals.vat)} />}
                <Line k={totals.vatEnabled ? "ราคารวม VAT" : "ราคารวม"} v={thb(totals.grandTotal)} strong />
                {totals.withholding && <Line k={`หัก ณ ที่จ่าย ${totals.whtRate}%`} v={`−${thb(totals.wht)}`} />}
                {totals.withholding && <Line k="ลูกค้าโอนจริง" v={thb(totals.netPayable)} strong />}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-pill px-4 text-sm text-ink-2">
                  ยกเลิก
                </button>
                <button type="button" disabled={pending} onClick={issue} className="h-9 rounded-pill bg-ink-1 px-5 text-sm font-semibold text-white disabled:opacity-60">
                  {pending ? "กำลังส่ง..." : "ออกใบเสนอราคาและส่งให้ลูกค้า"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลหากต้องการปฏิเสธคำขอ (จะแจ้งลูกค้า)" className="h-9 min-w-[260px] flex-1 rounded-input border border-line px-3 text-sm outline-none focus:border-ink-1" />
            <button type="button" disabled={pending} onClick={reject} className="h-9 rounded-pill px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              ปฏิเสธคำขอ
            </button>
          </div>
          {msg && <p className={cn("mt-2 text-sm", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        </div>
      )}
      {!canQuote && msg && <p className={cn("px-5 pb-4 text-sm", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </li>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold text-ink-1" : "text-ink-2"}>{k}</dt>
      <dd className={strong ? "font-bold text-ink-1" : "text-ink-1"}>{v}</dd>
    </div>
  );
}
