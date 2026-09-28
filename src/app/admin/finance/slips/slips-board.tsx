"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSlipImage, reviewSlipAction } from "@/lib/actions/online-payment";

export interface SlipRow {
  id: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  apiStatus: number | null;
  apiMessage: string | null;
  transRef: string | null;
  amount: number | null;
  expected: number | null;
  slipDate: string | null;
  slipType: string | null;
  senderBank: string | null;
  senderName: string | null;
  senderAccount: string | null;
  receiverBank: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  imagePath: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  customerName: string | null;
  company: string | null;
  phone: string | null;
  bookingRef: string | null;
  roomName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  total: number | null;
  paid: number | null;
}

type SortKey = "createdAt" | "status" | "transRef" | "receiver" | "customer" | "amount";
type Filter = "all" | "passed" | "review" | "failed";

const PASSED = ["verified", "approved"];
const REVIEW = ["amount_mismatch", "receiver_mismatch", "too_old", "api_error"];
const PAGE_SIZE = 20;

const TONE: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-slate-100 text-ink-2 ring-slate-200",
  amount_mismatch: "bg-amber-50 text-amber-700 ring-amber-200",
  receiver_mismatch: "bg-amber-50 text-amber-700 ring-amber-200",
  too_old: "bg-amber-50 text-amber-700 ring-amber-200",
  api_error: "bg-amber-50 text-amber-700 ring-amber-200",
  duplicate: "bg-rose-50 text-rose-700 ring-rose-200",
  not_slip: "bg-rose-50 text-rose-700 ring-rose-200",
  pending_bank: "bg-sky-50 text-sky-700 ring-sky-200",
};

const baht = (n: number | null) =>
  n == null ? "-" : `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SlipsBoard({ rows }: { rows: SlipRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<SlipRow | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      passed: rows.filter((r) => PASSED.includes(r.status)).length,
      review: rows.filter((r) => REVIEW.includes(r.status) && !r.reviewedAt).length,
      failed: rows.filter((r) => !PASSED.includes(r.status) && !REVIEW.includes(r.status)).length,
    }),
    [rows],
  );
  const receivedToday = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    return rows
      .filter(
        (r) =>
          PASSED.includes(r.status) &&
          new Date(r.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) === today,
      )
      .reduce((s, r) => s + (r.amount ?? 0), 0);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) =>
        filter === "all"
          ? true
          : filter === "passed"
            ? PASSED.includes(r.status)
            : filter === "review"
              ? REVIEW.includes(r.status)
              : !PASSED.includes(r.status) && !REVIEW.includes(r.status),
      )
      .filter((r) =>
        !needle
          ? true
          : [r.transRef, r.bookingRef, r.company, r.customerName, r.senderName, r.receiverName, r.phone]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
      )
      .sort((a, b) => {
        const val = (r: SlipRow): string | number => {
          switch (sort.key) {
            case "createdAt":
              return new Date(r.createdAt).getTime();
            case "status":
              return r.statusLabel;
            case "transRef":
              return r.transRef ?? "";
            case "receiver":
              return r.receiverName ?? "";
            case "customer":
              return r.company ?? r.customerName ?? "";
            case "amount":
              return r.amount ?? -1;
          }
        };
        const x = val(a);
        const y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, filter, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "createdAt" ? -1 : 1 }));
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "สลิปทั้งหมด", value: counts.all.toLocaleString() },
          { label: "ตรวจผ่าน", value: counts.passed.toLocaleString(), tone: "text-emerald-700" },
          { label: "รอตรวจสอบ", value: counts.review.toLocaleString(), tone: counts.review ? "text-amber-600" : "" },
          { label: "ยอดรับวันนี้", value: baht(receivedToday) },
        ].map((k) => (
          <div key={k.label} className="surface-card px-4 py-3.5">
            <p className="text-xs text-ink-3">{k.label}</p>
            <p className={cn("mt-0.5 text-[22px] font-bold tracking-tighter tabular-nums text-ink-1", k.tone)}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-pill bg-white p-1 ring-1 ring-line">
          {(
            [
              ["all", "ทั้งหมด", counts.all],
              ["passed", "ผ่าน", counts.passed],
              ["review", "ต้องตรวจสอบ", counts.review],
              ["failed", "ไม่ผ่าน", counts.failed],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setFilter(k);
                setPage(1);
              }}
              className={cn(
                "h-8 rounded-pill px-3.5 text-xs font-semibold tracking-tight transition",
                filter === k ? "bg-primary-600 text-white" : "text-ink-2 hover:bg-surface-subtle",
              )}
            >
              {label} <span className={filter === k ? "text-white/70" : "text-ink-3"}>{n}</span>
            </button>
          ))}
        </div>
        <label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-pill bg-white px-3.5 ring-1 ring-line">
          <Search size={15} className="text-ink-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหา เลขอ้างอิง / รหัสจอง / ชื่อ"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] font-semibold text-ink-2">
                <Th label="วันที่" k="createdAt" sort={sort} onSort={toggleSort} />
                <Th label="API Status" k="status" sort={sort} onSort={toggleSort} />
                <Th label="หมายเลข" k="transRef" sort={sort} onSort={toggleSort} />
                <Th label="ลูกค้า / บริษัท" k="customer" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3.5">บัญชีผู้โอน</th>
                <Th label="บัญชีรับเงิน" k="receiver" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3.5">ประเภทสลิป</th>
                <Th label="จำนวน" k="amount" sort={sort} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr className="bg-surface-subtle/70">
                  <td colSpan={8} className="px-4 py-5 text-ink-3">
                    -
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpen(r)}
                    className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-primary-50/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-2">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold ring-1",
                          TONE[r.status] ?? "bg-slate-100 text-ink-2 ring-slate-200",
                        )}
                      >
                        {r.statusLabel}
                        {r.apiStatus ? <span className="font-normal opacity-60">· {r.apiStatus}</span> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-1">{r.transRef ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold tracking-tight text-ink-1">{r.company || r.customerName || "-"}</p>
                      <p className="text-xs text-ink-3">
                        {[r.company ? r.customerName : null, r.bookingRef].filter(Boolean).join(" · ") || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-1">{r.senderName ?? "-"}</p>
                      <p className="text-xs text-ink-3">
                        {[r.senderBank, r.senderAccount].filter(Boolean).join(" · ") || ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-1">{r.receiverName ?? "-"}</p>
                      <p className="text-xs text-ink-3">
                        {[r.receiverBank, r.receiverAccount].filter(Boolean).join(" · ") || ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">{r.slipType ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <p className="font-bold tabular-nums text-ink-1">{baht(r.amount)}</p>
                      {r.expected != null && r.amount != null && Math.abs(r.amount - r.expected) > 0.009 && (
                        <p className="text-xs tabular-nums text-ink-3">ต้องชำระ {baht(r.expected)}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line bg-surface-subtle/50 px-4 py-3">
          <span className="text-sm text-ink-3">
            หน้า {current} ถึง {pages}
          </span>
          <button
            type="button"
            aria-label="ก่อนหน้า"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="grid h-9 w-9 place-items-center rounded-input border border-line bg-white text-ink-2 disabled:text-ink-3/50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="grid h-9 min-w-9 place-items-center rounded-input bg-primary-600 px-3 text-sm font-bold text-white">
            {current}
          </span>
          <button
            type="button"
            aria-label="ถัดไป"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
            className="grid h-9 w-9 place-items-center rounded-input border border-line bg-white text-ink-2 disabled:text-ink-3/50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {open && <SlipDrawer row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === k;
  return (
    <th className={cn("px-4 py-3.5", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1.5", align === "right" && "flex-row-reverse")}
      >
        {label}
        <span className="flex flex-col text-[8px] leading-[8px]">
          <span className={active && sort.dir === 1 ? "text-primary-600" : "text-ink-3/60"}>▲</span>
          <span className={active && sort.dir === -1 ? "text-primary-600" : "text-ink-3/60"}>▼</span>
        </span>
      </button>
    </th>
  );
}

function SlipDrawer({ row, onClose }: { row: SlipRow; onClose: () => void }) {
  const router = useRouter();
  const [img, setImg] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canReview = !["verified", "approved", "rejected"].includes(row.status) && !row.reviewedAt;

  useEffect(() => {
    if (!row.imagePath) return;
    let alive = true;
    void getSlipImage(row.imagePath).then((u) => alive && setImg(u ?? null));
    return () => {
      alive = false;
    };
  }, [row.imagePath]);

  function decide(decision: "approve" | "reject") {
    setErr(null);
    start(async () => {
      const r = await reviewSlipAction(row.id, decision, note);
      if (!r.ok) return setErr(r.message ?? "ไม่สำเร็จ");
      onClose();
      router.refresh();
    });
  }

  const details: Array<[string, string]> = [
    ["รหัสการจอง", row.bookingRef ?? "-"],
    ["ลูกค้า / บริษัท", [row.company, row.customerName].filter(Boolean).join(" · ") || "-"],
    ["เบอร์โทร", row.phone ?? "-"],
    ["ห้อง", row.roomName ?? "-"],
    [
      "เวลาใช้ห้อง",
      row.startsAt && row.endsAt
        ? `${fmtDate(row.startsAt)} – ${new Date(row.endsAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}`
        : "-",
    ],
    ["ยอดการจอง", `${baht(row.total)} · ชำระแล้ว ${baht(row.paid)}`],
    ["ยอดที่ต้องชำระ (ตอนแนบ)", baht(row.expected)],
    ["ยอดในสลิป", baht(row.amount)],
    ["เลขอ้างอิง", row.transRef ?? "-"],
    ["วันเวลาโอน", row.slipDate ? fmtDate(row.slipDate) : "-"],
    ["ผู้โอน", [row.senderName, row.senderBank, row.senderAccount].filter(Boolean).join(" · ") || "-"],
    ["ผู้รับ", [row.receiverName, row.receiverBank, row.receiverAccount].filter(Boolean).join(" · ") || "-"],
    ["ผล API", `${row.statusLabel}${row.apiMessage ? ` (${row.apiMessage})` : ""}`],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <aside className="relative flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-xs text-ink-3">สลิป · {fmtDate(row.createdAt)}</p>
            <p className="font-semibold tracking-tight">{row.company || row.customerName || "-"}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-subtle">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <div>
              {row.imagePath ? (
                img ? (
                  <a href={img} target="_blank" rel="noreferrer" className="group relative block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="สลิป" className="w-full rounded-input ring-1 ring-line" />
                    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink-2 opacity-0 transition group-hover:opacity-100">
                      <ExternalLink size={14} />
                    </span>
                  </a>
                ) : (
                  <div className="grid aspect-[3/5] place-items-center rounded-input bg-surface-subtle text-ink-3">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                )
              ) : (
                <div className="grid aspect-[3/5] place-items-center rounded-input bg-surface-subtle text-xs text-ink-3">
                  ไม่มีรูป
                </div>
              )}
            </div>
            <dl className="space-y-2.5 text-sm">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="font-medium text-ink-1">{v}</dd>
                </div>
              ))}
              {row.reviewNote && (
                <div>
                  <dt className="text-xs text-ink-3">บันทึกการตรวจ</dt>
                  <dd className="font-medium text-ink-1">{row.reviewNote}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        {canReview && (
          <div className="border-t border-line p-5">
            <p className="mb-2 text-xs text-ink-3">
              ตรวจแล้วว่าเงินเข้าจริง → อนุมัติ ระบบจะบันทึกการชำระ ยืนยันการจอง และส่งแจ้งลูกค้าทาง LINE
            </p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึก (ไม่บังคับ) เช่น เช็กยอดในแอปธนาคารแล้ว"
              className="mb-3 h-10 w-full rounded-input border border-line px-3 text-sm outline-none focus:border-primary-600"
            />
            {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("reject")}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-pill border border-line text-sm font-semibold text-ink-2 hover:bg-surface-subtle"
              >
                <XCircle size={16} /> ปฏิเสธ
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approve")}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-pill bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} อนุมัติการชำระ
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
