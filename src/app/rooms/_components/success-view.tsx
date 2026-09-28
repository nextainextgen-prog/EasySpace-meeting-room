"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { bkkDate, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import {
  durationLabel,
  formatBahtPlain,
  thaiDateLong,
  type PublicChannel,
} from "@/lib/public-booking/shared";
import { downloadIcs } from "./ics";
import { saveBooking } from "./my-bookings";
import { PaymentPanel, type SlipOutcome } from "./payment-panel";
import { LineLink } from "./line-link";
import {
  PAYMENT_STATUS_LABEL,
  type PaymentMode,
  type PublicPaymentInfo,
} from "@/lib/public-booking/payment";

export interface BookingSuccess {
  reference: string;
  token: string;
  startsAt: string;
  endsAt: string;
  totalAmount: number;
  packageName: string | null;
  holdExpiresAt: string;
  attendees: number;
  customerName: string;
  amountDue: number;
  paymentMode: PaymentMode | null;
  lineLinked: boolean;
}

export function SuccessView({
  success,
  room,
  config,
  channel,
  payment,
  onDone,
}: {
  success: BookingSuccess;
  room: { name: string; color: string; thumbnail_url: string | null };
  config: { line_url: string; line_id: string; phone: string; confirm_message: string };
  channel: PublicChannel;
  payment: PublicPaymentInfo;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState<SlipOutcome | null>(null);
  const awaitingPayment = success.amountDue > 0 && !paid;
  const statusHref = `/rooms/booking/${success.reference}?t=${success.token}&src=${channel}`;
  const minutes = Math.round(
    (new Date(success.endsAt).getTime() - new Date(success.startsAt).getTime()) / 60_000,
  );

  useEffect(() => {
    saveBooking({
      reference: success.reference,
      token: success.token,
      roomName: room.name,
      startsAt: success.startsAt,
      endsAt: success.endsAt,
    });
  }, [success, room.name]);

  function copyRef() {
    void navigator.clipboard?.writeText(success.reference).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-8 sm:pt-12">
      <div>
        <p className="es-rise text-[12px] font-medium tracking-tight text-ink-3 tabular-nums">
          {success.reference} · {awaitingPayment ? "รอชำระเงิน" : paid ? "ยืนยันแล้ว" : "รอยืนยัน"}
        </p>
        <h1 className="es-rise mt-1 text-[28px] font-bold leading-tight tracking-tightest">
          {awaitingPayment ? "กันห้องไว้ให้คุณแล้ว" : paid ? "การจองสำเร็จ" : "จองห้องเรียบร้อย"}
        </h1>
        <p className="es-rise mt-2 max-w-md text-[14px] leading-relaxed text-ink-2">
          {awaitingPayment
            ? "ชำระเงินและแนบสลิปภายในเวลาที่กำหนด ระบบจะยืนยันการจองให้ทันที"
            : paid
              ? `ได้รับชำระ ฿${formatBahtPlain(paid.amount)} แล้ว ห้องพร้อมสำหรับคุณตามเวลานัด`
              : "เรากันห้องไว้ให้คุณแล้ว · ทีมงานจะติดต่อกลับเพื่อยืนยัน"}
        </p>
      </div>

      {awaitingPayment && (
        <div className="es-rise mt-7">
          <PaymentPanel
            reference={success.reference}
            token={success.token}
            dueNow={success.amountDue}
            totalAmount={success.totalAmount}
            deadline={success.holdExpiresAt}
            mode={success.paymentMode}
            payment={payment}
            onPaid={(o) => {
              setPaid(o);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      )}

      <div className="es-rise mt-4">
        <LineLink reference={success.reference} token={success.token} linked={success.lineLinked} />
      </div>

      {/* Ticket */}
      <div className="es-rise mt-7 overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_48px_-24px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/[0.06]">
        <div className="relative h-24 overflow-hidden" style={{ background: room.color }}>
          {room.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={room.thumbnail_url} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 to-slate-950/20" />
          <div className="absolute inset-0 flex flex-col justify-center px-5 text-white">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
              EasySpace · Booking
            </p>
            <p className="text-[22px] font-bold tracking-tighter">{room.name}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-5 text-[13.5px]">
          <TicketRow label="วันที่" className="col-span-2">
            {thaiDateLong(bkkDate(success.startsAt))}
          </TicketRow>
          <TicketRow label="เวลา">
            {bkkTime(success.startsAt)} – {bkkTime(success.endsAt)} น.
          </TicketRow>
          <TicketRow label="ระยะเวลา">{durationLabel(minutes)}</TicketRow>
          <TicketRow label="ผู้เข้าร่วม">{success.attendees} ท่าน</TicketRow>
          <TicketRow label="ราคารวม">
            ฿{formatBahtPlain(success.totalAmount)}
            {success.packageName && (
              <span className="ml-1 text-[11.5px] font-medium text-emerald-700">
                ({success.packageName})
              </span>
            )}
          </TicketRow>
        </dl>

        {/* Perforation */}
        <div className="relative flex items-center">
          <span className="absolute -left-3 h-6 w-6 rounded-full bg-[#F6F7FB] ring-1 ring-slate-900/[0.06]" />
          <span className="mx-5 w-full border-t-2 border-dashed border-slate-900/10" />
          <span className="absolute -right-3 h-6 w-6 rounded-full bg-[#F6F7FB] ring-1 ring-slate-900/[0.06]" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <div>
            <p className="text-[11px] font-medium text-ink-3">รหัสการจอง</p>
            <button
              type="button"
              onClick={copyRef}
              className="mt-0.5 inline-flex items-center gap-2 font-mono text-[24px] font-bold tracking-tight text-ink-1"
            >
              {success.reference}
              <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-ink-2">
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="light" />}
              </span>
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-slate-900/[0.1] px-3 py-1.5 text-[12px] font-semibold text-ink-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", paid ? "bg-emerald-500" : "bg-slate-400")} />
            {paid ? (PAYMENT_STATUS_LABEL[paid.paymentStatus] ?? "ยืนยันแล้ว") : awaitingPayment ? "รอชำระเงิน" : "รอยืนยัน"}
          </span>
        </div>
      </div>

      {/* Progress */}
      <ol className="es-rise mt-6 space-y-0">
        {(success.amountDue > 0
          ? [
              { title: "จองห้องแล้ว", sub: "ห้องถูกกันไว้ให้คุณเรียบร้อย", done: true },
              {
                title: "ชำระเงินและตรวจสลิป",
                sub: paid
                  ? `ตรวจสลิปผ่าน · ${PAYMENT_STATUS_LABEL[paid.paymentStatus] ?? ""}`
                  : `ชำระภายใน ${bkkTime(success.holdExpiresAt)} น. (${bkkDateLabel(success.holdExpiresAt)}) มิฉะนั้นห้องจะถูกปล่อยอัตโนมัติ`,
                done: Boolean(paid),
              },
              { title: "เข้าใช้ห้องตามเวลานัด", sub: "มาถึงก่อนเวลาเล็กน้อยเพื่อเตรียมตัว", done: false },
            ]
          : [
              { title: "ส่งคำขอจองแล้ว", sub: "ห้องถูกกันไว้ให้คุณเรียบร้อย", done: true },
              { title: "ทีมงานยืนยันการจอง", sub: `${config.confirm_message}`, done: false },
              {
                title: "ชำระเงินและเข้าใช้ห้อง",
                sub: `กันห้องไว้ถึง ${bkkDateLabel(success.holdExpiresAt)} ${bkkTime(success.holdExpiresAt)} น. หากยังไม่ยืนยัน`,
                done: false,
              },
            ]
        ).map((s, i, arr) => (
          <li key={s.title} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < arr.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-slate-900/10" />
            )}
            <span
              className={cn(
                "relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                s.done ? "bg-ink-1 text-white" : "bg-white text-ink-3 ring-1 ring-slate-900/10",
              )}
            >
              {s.done ? <Check size={13} weight="bold" /> : i + 1}
            </span>
            <span className="pt-0.5">
              <span className="block text-[14px] font-semibold tracking-tight">{s.title}</span>
              <span className="block text-[12.5px] leading-relaxed text-ink-3">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Actions */}
      <div className="es-rise mt-7 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() =>
            downloadIcs({
              reference: success.reference,
              title: `ประชุม · ${room.name} (EasySpace)`,
              startsAt: success.startsAt,
              endsAt: success.endsAt,
              location: `${room.name} · EasySpace`,
              description: `รหัสการจอง ${success.reference}\nสถานะ: ${paid ? "ยืนยันแล้ว" : awaitingPayment ? "รอชำระเงิน" : "รอทีมงานยืนยัน"}\nติดต่อ LINE ${config.line_id} / ${config.phone}`,
            })
          }
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-pill border border-slate-900/[0.1] bg-white text-[14px] font-semibold tracking-tight hover:bg-slate-50"
        >
          เพิ่มลงปฏิทิน
        </button>
        <a
          href={config.line_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-[#06C755] text-[14px] font-semibold tracking-tight text-white hover:brightness-95"
        >
          แชท LINE
        </a>
        <Link
          href={statusHref}
          className="col-span-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-ink-1 text-[14px] font-semibold tracking-tight text-white hover:bg-slate-800"
        >
          ดูสถานะการจอง
        </Link>
      </div>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-3">
        บันทึกหน้าสถานะไว้เพื่อตรวจสอบหรือยกเลิกการจอง · สอบถาม{" "}
        <a href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`} className="font-medium text-ink-2 underline-offset-2 hover:underline">
          {config.phone}
        </a>
      </p>

      <button
        type="button"
        onClick={onDone}
        className="mx-auto mt-4 block text-[13px] font-semibold text-primary-600 hover:underline"
      >
        จองช่วงเวลาอื่นเพิ่ม
      </button>
    </div>
  );
}

function TicketRow({
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
      <dd className="mt-0.5 font-semibold tracking-tight text-ink-1 tabular-nums">{children}</dd>
    </div>
  );
}
