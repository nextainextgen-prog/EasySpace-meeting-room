"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import type { OverrideCase, SlotSuggestion } from "@/lib/server/overrides";
import {
  cancelCustomerAction,
  getSuggestions,
  moveDisplacedAction,
  resolveOverrideAction,
} from "@/lib/actions/overrides";

const when = (s: string, e: string) => `${bkkDateLabel(s)} · ${bkkTime(s)}–${bkkTime(e)} น.`;
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

const OUTCOME_LABEL: Record<OverrideCase["outcome"], string> = {
  relocated: "ย้ายห้องอัตโนมัติ",
  released: "ปล่อยคิวแล้ว — ต้องหาเวลาใหม่",
  restored: "คืนคิวอัตโนมัติ (ลูกค้าไม่ได้ใช้ช่วงนี้)",
  moved: "ย้ายไปช่วงใหม่แล้ว",
  member_rebook: "แจ้งสมาชิกให้เลือกเวลาเอง",
  acknowledged: "รับทราบแล้ว",
  customer_cancelled: "ยกเลิกการจองลูกค้า · คืนคิวแล้ว",
  auto_restored: "คืนคิวอัตโนมัติ",
};

type Filter = "open" | "all";

export function OverridesBoard({ cases, focus }: { cases: OverrideCase[]; focus: string | null }) {
  const [filter, setFilter] = useState<Filter>(focus ? "all" : "open");
  const stats = useMemo(
    () => ({
      open: cases.filter((c) => c.state === "open").length,
      released: cases.filter((c) => c.state === "open" && c.outcome === "released").length,
      relocated: cases.filter((c) => c.marker.action === "relocated").length,
      resolved: cases.filter((c) => c.state === "resolved").length,
    }),
    [cases],
  );
  const visible = cases
    .filter((c) => (filter === "open" ? c.state === "open" : true))
    .sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["รอจัดการ", stats.open],
          ["ต้องหาเวลาใหม่", stats.released],
          ["ย้ายห้องอัตโนมัติ (ทั้งหมด)", stats.relocated],
          ["จัดการแล้ว", stats.resolved],
        ].map(([k, v]) => (
          <div key={k} className="surface-card px-4 py-3.5">
            <p className="text-xs text-ink-3">{k}</p>
            <p className="mt-0.5 text-[22px] font-bold tracking-tighter tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-line bg-white px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <b className="text-ink-1">หลักการ:</b> ลูกค้าภายนอกได้สิทธิ์ห้องก่อน คิวภายใน (ใช้ฟรี) จะถูกย้ายไปห้องอื่นเวลาเดิมให้อัตโนมัติ
        ถ้าไม่มีห้องว่างจะถูกปล่อยคิว · ลูกค้ายังไม่ชำระ = ระบบคืนคิวให้เองเมื่อหมดเวลา ไม่ต้องรีบย้าย ·
        ลูกค้าชำระแล้ว = การทับคิวถาวร ควรย้ายคิวภายในไปช่วงที่แนะนำ
      </div>

      <div className="flex gap-1 rounded-pill bg-white p-1 ring-1 ring-line w-fit">
        {(
          [
            ["open", `รอจัดการ ${stats.open}`],
            ["all", `ทั้งหมด ${cases.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "h-8 rounded-pill px-4 text-xs font-semibold tracking-tight",
              filter === k ? "bg-ink-1 text-white" : "text-ink-2 hover:bg-surface-subtle",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border border-line bg-white px-5 py-10 text-center text-sm text-ink-3">
          {filter === "open" ? "ไม่มีคิวทับซ้อนที่รอจัดการ" : "ยังไม่เคยมีลูกค้าภายนอกจองทับคิวภายใน"}
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((c) => (
            <CaseCard key={c.id} c={c} highlighted={c.id === focus} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CaseCard({ c, highlighted }: { c: OverrideCase; highlighted: boolean }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<SlotSuggestion[] | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const open = c.state === "open";
  const cust = c.customer;
  const paid = Boolean(cust && cust.paidAmount > 0);
  const custActive = Boolean(cust && ["pending", "confirmed", "in_use"].includes(cust.status));

  useEffect(() => {
    if (open && c.outcome !== "restored") void getSuggestions(c.id).then(setSuggestions);
  }, [open, c.id, c.outcome]);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.message ?? "ไม่สำเร็จ" });
      setMsg({ ok: true, text: okText });
      router.refresh();
    });
  }

  const custLine = !cust
    ? "ไม่พบการจองของลูกค้า"
    : !custActive
      ? "ลูกค้ายกเลิกหรือหมดเวลาชำระแล้ว"
      : paid
        ? `ชำระแล้ว ${baht(cust.paidAmount)} จาก ${baht(cust.totalAmount)} — การจองยืนยัน การทับคิวเป็นการถาวร`
        : cust.holdExpiresAt
          ? `ยังไม่ชำระ · ถ้าไม่ชำระภายใน ${bkkDateLabel(cust.holdExpiresAt)} ${bkkTime(cust.holdExpiresAt)} น. ระบบคืนคิวภายในให้อัตโนมัติ`
          : "ยังไม่ชำระ · รอทีมงานยืนยันกับลูกค้า";

  return (
    <li
      id={c.id}
      className={cn(
        "overflow-hidden rounded-card border bg-white",
        highlighted ? "border-ink-1" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold",
              open ? "border-ink-1 text-ink-1" : "border-line text-ink-3",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-ink-1" : "bg-emerald-500")} />
            {open ? "รอจัดการ" : "จัดการแล้ว"}
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink-1">{OUTCOME_LABEL[c.outcome]}</span>
        </div>
        <span className="text-xs text-ink-3 tabular-nums">
          เกิดขึ้น {bkkDateLabel(c.marker.at)} {bkkTime(c.marker.at)} น.
        </span>
      </div>

      <div className="grid gap-px bg-line-soft md:grid-cols-2">
        <section className="bg-white px-5 py-4">
          <p className="text-xs font-medium text-ink-3">ลูกค้าภายนอก (ได้สิทธิ์ห้องก่อน)</p>
          {cust ? (
            <>
              <p className="mt-1 text-[15px] font-semibold tracking-tight">{cust.company || cust.name}</p>
              <p className="text-xs text-ink-3">
                {[cust.company ? cust.name : null, cust.reference, cust.channel === "line" ? "LINE" : "QR / เว็บ"].filter(Boolean).join(" · ")}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <Row k="ห้อง / เวลา" v={`${cust.roomName} · ${when(cust.startsAt, cust.endsAt)}`} />
                <Row k="ยอดการจอง" v={baht(cust.totalAmount)} />
                <Row k="การชำระ" v={custLine} />
              </dl>
              {cust.phone && (
                <a href={`tel:${cust.phone}`} className="mt-3 inline-block text-sm font-semibold text-ink-1 underline underline-offset-4">
                  โทรหาลูกค้า {cust.phone}
                </a>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-3">ไม่พบการจอง {c.marker.reference}</p>
          )}
        </section>

        <section className="bg-white px-5 py-4">
          <p className="text-xs font-medium text-ink-3">คิวภายในที่ได้รับผลกระทบ (ใช้ฟรี)</p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight">
            {[c.internal.orgName, c.internal.memberName].filter(Boolean).join(" · ") || "ผู้ใช้ภายใน"}
          </p>
          <p className="text-xs text-ink-3">
            {[c.internal.reference, c.internal.title, c.internal.attendees ? `${c.internal.attendees} ท่าน` : null].filter(Boolean).join(" · ")}
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="เดิม" v={`${c.internal.originalRoomName} · ${when(c.internal.originalStartsAt, c.internal.originalEndsAt)}`} />
            <Row
              k="ตอนนี้"
              v={
                ["pending", "confirmed", "in_use"].includes(c.internal.status)
                  ? `${c.internal.roomName} · ${when(c.internal.startsAt, c.internal.endsAt)}`
                  : "ไม่มีห้อง (ถูกปล่อยคิว)"
              }
            />
            {c.marker.resolution && (
              <Row
                k="การจัดการ"
                v={`${OUTCOME_LABEL[c.marker.resolution.kind]} · โดย ${c.marker.resolution.by ?? "-"}${c.marker.resolution.note ? ` · ${c.marker.resolution.note}` : ""}`}
              />
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {c.internal.memberPhone && (
              <a href={`tel:${c.internal.memberPhone}`} className="font-semibold text-ink-1 underline underline-offset-4">
                โทรหาสมาชิก {c.internal.memberPhone}
              </a>
            )}
            {c.internal.memberEmail && (
              <a href={`mailto:${c.internal.memberEmail}`} className="text-ink-2 underline underline-offset-4">
                {c.internal.memberEmail}
              </a>
            )}
          </div>
        </section>
      </div>

      {open && (
        <div className="border-t border-line-soft px-5 py-4">
          {c.outcome !== "restored" && (
            <>
              <p className="text-xs font-medium text-ink-3">
                ช่วงที่ว่างสำหรับคิวภายใน (ความยาวเท่าเดิม · ห้องรองรับจำนวนคน)
              </p>
              {suggestions === null ? (
                <p className="mt-2 text-sm text-ink-3">กำลังหาช่วงว่าง...</p>
              ) : suggestions.length === 0 ? (
                <p className="mt-2 text-sm text-ink-3">ไม่พบช่วงว่างวันนี้และพรุ่งนี้ — แนะนำให้สมาชิกเลือกเวลาเอง</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={`${s.roomId}-${s.startsAt}`}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            moveDisplacedAction({
                              internalId: c.id,
                              roomId: s.roomId,
                              startsAt: s.startsAt,
                              endsAt: s.endsAt,
                            }),
                          `ย้ายไป ${s.label} แล้ว — แจ้งสมาชิกแล้ว`,
                        )
                      }
                      className="rounded-pill border border-line px-3 py-1.5 text-left text-[13px] text-ink-1 transition hover:border-ink-1 disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึก / เหตุผล (ไม่บังคับ ยกเว้นยกเลิกลูกค้า)"
              className="h-9 min-w-[240px] flex-1 rounded-input border border-line px-3 text-sm outline-none focus:border-ink-1"
            />
            {c.outcome === "released" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => resolveOverrideAction(c.id, "member_rebook", note), "แจ้งสมาชิกให้เลือกเวลาใหม่แล้ว")}
                className="h-9 rounded-pill border border-line px-4 text-sm font-semibold text-ink-1 hover:border-ink-1 disabled:opacity-50"
              >
                ให้สมาชิกเลือกเวลาเอง
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => resolveOverrideAction(c.id, "acknowledged", note), "บันทึกว่ารับทราบแล้ว")}
              className="h-9 rounded-pill border border-line px-4 text-sm font-semibold text-ink-1 hover:border-ink-1 disabled:opacity-50"
            >
              รับทราบ / ปิดเคส
            </button>
            {custActive && !paid && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!note.trim()) return setMsg({ ok: false, text: "ระบุเหตุผลก่อนยกเลิกการจองลูกค้า" });
                  if (!confirm("ยกเลิกการจองของลูกค้าและคืนคิวภายใน?")) return;
                  run(() => cancelCustomerAction(c.id, note), "ยกเลิกการจองลูกค้าและคืนคิวภายในแล้ว");
                }}
                className="h-9 rounded-pill px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                ยกเลิกลูกค้า · คืนคิวภายใน
              </button>
            )}
          </div>
          {msg && <p className={cn("mt-2 text-sm", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        </div>
      )}
    </li>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink-1">{v}</dd>
    </div>
  );
}
