"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Loader2,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { bkkDate, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import {
  durationLabel,
  formatBahtPlain,
  thaiDateLong,
  type PublicChannel,
} from "@/lib/public-booking/shared";
import type { PublicBookingView } from "@/lib/server/public-booking";
import { cancelPublicBooking } from "@/lib/actions/public-booking";
import { downloadIcs } from "../../_components/ics";
import { forgetBooking } from "../../_components/my-bookings";
import { PaymentPanel } from "../../_components/payment-panel";
import { LineLink } from "../../_components/line-link";
import type { PublicPaymentInfo } from "@/lib/public-booking/payment";

const STATUS: Record<
  string,
  { label: string; tone: "amber" | "emerald" | "blue" | "slate" | "rose"; sub: string }
> = {
  pending: { label: "รอยืนยัน", tone: "amber", sub: "ห้องถูกกันไว้ให้คุณแล้ว ทีมงานจะติดต่อกลับเพื่อยืนยัน" },
  confirmed: { label: "ยืนยันแล้ว", tone: "emerald", sub: "การจองของคุณได้รับการยืนยันเรียบร้อย พบกันตามเวลานัด" },
  in_use: { label: "กำลังใช้งาน", tone: "blue", sub: "ขอให้การประชุมเป็นไปอย่างราบรื่น" },
  completed: { label: "เสร็จสิ้น", tone: "slate", sub: "ขอบคุณที่ใช้บริการ EasySpace" },
  cancelled: { label: "ยกเลิกแล้ว", tone: "rose", sub: "การจองนี้ถูกยกเลิก" },
  no_show: { label: "ไม่ได้เข้าใช้", tone: "slate", sub: "ไม่พบการเข้าใช้ห้องตามเวลาที่จอง" },
};

const TONE = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200 [--dot:theme(colors.amber.500)]",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200 [--dot:theme(colors.emerald.500)]",
  blue: "bg-primary-50 text-primary-700 ring-primary-200 [--dot:theme(colors.primary.600)]",
  slate: "bg-slate-100 text-ink-2 ring-slate-200 [--dot:theme(colors.slate.400)]",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 [--dot:theme(colors.rose.500)]",
};

export function BookingStatus({
  view,
  token,
  channel,
  config,
  payment,
}: {
  view: PublicBookingView;
  token: string;
  channel: PublicChannel;
  payment: PublicPaymentInfo;
  config: { line_url: string; line_id: string; phone: string; confirm_message: string };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const awaitingPayment = view.dueNow > 0 && view.status === "pending";
  const st = awaitingPayment
    ? { label: "รอชำระเงิน", tone: "amber" as const, sub: "ห้องถูกกันไว้ให้คุณแล้ว ชำระเงินและแนบสลิปเพื่อยืนยันการจอง" }
    : (STATUS[view.status] ?? STATUS.pending);
  const minutes = Math.round(
    (new Date(view.endsAt).getTime() - new Date(view.startsAt).getTime()) / 60_000,
  );
  const upcoming = new Date(view.endsAt).getTime() > Date.now();
  const active = ["pending", "confirmed"].includes(view.status) && upcoming;

  const steps = [
    { title: "ส่งคำขอจอง", done: true },
    {
      title: view.paymentMode ? "ชำระเงิน" : "ทีมงานยืนยัน",
      done: ["confirmed", "in_use", "completed"].includes(view.status),
    },
    {
      title: "เข้าใช้ห้อง",
      done: ["in_use", "completed"].includes(view.status),
    },
  ];

  function cancel() {
    setError(null);
    startTransition(async () => {
      const r = await cancelPublicBooking(view.reference, token);
      if (r.ok) {
        forgetBooking(view.reference);
        setConfirming(false);
        router.refresh();
      } else {
        setError(r.message ?? "ยกเลิกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-6 sm:pt-10">
      <Link
        href={view.roomSlug ? `/rooms/${view.roomSlug}?src=${channel}` : `/rooms?src=${channel}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> กลับไปหน้าห้อง
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-ink-3">สถานะการจอง</p>
          <h1 className="mt-1 font-mono text-[28px] font-bold tracking-tight">{view.reference}</h1>
        </div>
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-semibold ring-1",
            TONE[st.tone],
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--dot)]" />
          {st.label}
        </span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
        {view.status === "cancelled" && view.cancelledReason ? view.cancelledReason : st.sub}
      </p>

      {/* Progress */}
      {view.status !== "cancelled" && view.status !== "no_show" && (
        <div className="mt-5 flex items-center">
          {steps.map((s, i) => (
            <div key={s.title} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold",
                    s.done ? "bg-emerald-500 text-white" : "bg-white text-ink-3 ring-1 ring-slate-900/10",
                  )}
                >
                  {s.done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap text-[11.5px] font-medium", s.done ? "text-ink-1" : "text-ink-3")}>
                  {s.title}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span className={cn("mx-2 mb-5 h-px flex-1", steps[i + 1].done ? "bg-emerald-400" : "bg-slate-900/10")} />
              )}
            </div>
          ))}
        </div>
      )}

      {view.dueNow > 0 && payment.ready && (
        <div className="mt-6">
          <PaymentPanel
            reference={view.reference}
            token={token}
            dueNow={view.dueNow}
            totalAmount={view.totalAmount}
            deadline={view.status === "pending" ? view.holdExpiresAt : null}
            mode={view.paymentMode}
            payment={payment}
            onPaid={() => router.refresh()}
          />
        </div>
      )}

      {!["cancelled", "no_show", "completed"].includes(view.status) && (
        <div className="mt-4">
          <LineLink reference={view.reference} token={token} linked={view.lineLinked} />
        </div>
      )}

      {/* Card */}
      <div className="mt-6 overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-900/[0.06] shadow-[0_24px_48px_-28px_rgba(15,23,42,0.25)]">
        <div className="relative h-28" style={{ background: view.roomColor }}>
          {view.roomThumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.roomThumbnail} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 to-slate-950/10" />
          <p className="absolute bottom-4 left-5 text-[22px] font-bold tracking-tighter text-white">
            {view.roomName}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 text-[13.5px]">
          <Row label="วันที่" className="col-span-2">{thaiDateLong(bkkDate(view.startsAt))}</Row>
          <Row label="เวลา">
            {bkkTime(view.startsAt)} – {bkkTime(view.endsAt)} น.
          </Row>
          <Row label="ระยะเวลา">{durationLabel(minutes)}</Row>
          <Row label="ผู้จอง">{view.company || view.customerName}</Row>
          <Row label="ผู้เข้าร่วม">{view.attendees ? `${view.attendees} ท่าน` : "-"}</Row>
          <Row label="ราคารวม">฿{formatBahtPlain(view.totalAmount)}</Row>
          {view.paidAmount > 0 && <Row label="ชำระแล้ว">฿{formatBahtPlain(view.paidAmount)}</Row>}
          <Row label="การชำระเงิน">
            {view.paymentStatus === "paid"
              ? "ชำระแล้ว"
              : view.paymentStatus === "deposit"
                ? "ชำระมัดจำแล้ว"
                : view.paymentStatus === "free"
                  ? "ไม่มีค่าใช้จ่าย"
                  : "รอแจ้งช่องทางชำระ"}
          </Row>
        </dl>
        {view.status === "pending" && view.holdExpiresAt && !awaitingPayment && (
          <p className="border-t border-slate-900/[0.06] bg-amber-50/50 px-5 py-3 text-[12.5px] text-amber-800">
            กันห้องไว้ให้ถึง {bkkDateLabel(view.holdExpiresAt)} {bkkTime(view.holdExpiresAt)} น. — {config.confirm_message}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {active && (
          <button
            type="button"
            onClick={() =>
              downloadIcs({
                reference: view.reference,
                title: `ประชุม · ${view.roomName} (EasySpace)`,
                startsAt: view.startsAt,
                endsAt: view.endsAt,
                location: `${view.roomName} · EasySpace`,
                description: `รหัสการจอง ${view.reference}`,
              })
            }
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-pill border border-slate-900/[0.1] bg-white text-[14px] font-semibold hover:bg-slate-50"
          >
            <CalendarPlus size={16} strokeWidth={1.75} /> ลงปฏิทิน
          </button>
        )}
        <a
          href={config.line_url}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-[#06C755] text-[14px] font-semibold text-white hover:brightness-95",
            !active && "col-span-2",
          )}
        >
          <MessageCircle size={16} strokeWidth={2} /> แชท LINE
        </a>
        <a
          href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}
          className="col-span-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-ink-1 text-[14px] font-semibold text-white hover:bg-slate-800"
        >
          <Phone size={16} strokeWidth={1.75} /> โทร {config.phone}
        </a>
      </div>

      {view.canCancel && (
        <div className="mt-6 rounded-[20px] border border-slate-900/[0.07] bg-white p-4">
          {confirming ? (
            <>
              <p className="text-[14px] font-semibold tracking-tight">ยืนยันยกเลิกการจองนี้?</p>
              <p className="mt-1 text-[12.5px] text-ink-3">ห้องจะถูกปล่อยให้ผู้อื่นจองได้ทันที</p>
              {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-11 rounded-pill border border-slate-900/[0.1] text-[13.5px] font-semibold"
                >
                  ไม่ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={cancel}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-pill bg-rose-600 text-[13.5px] font-semibold text-white disabled:opacity-70"
                >
                  {pending ? <Loader2 size={16} className="animate-spin" /> : <X size={16} strokeWidth={2} />}
                  ยกเลิกการจอง
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full text-center text-[13px] font-semibold text-rose-600"
            >
              ต้องการยกเลิกการจอง
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-semibold tracking-tight tabular-nums">{children}</dd>
    </div>
  );
}
