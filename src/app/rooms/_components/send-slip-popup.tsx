"use client";

import { useEffect, useState } from "react";
import { Check, Copy, X } from "@phosphor-icons/react";
import { BankLogo, bankDisplayName } from "@/components/bank-logo";
import { bkkDate, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import { formatBahtPlain, thaiDateShort } from "@/lib/public-booking/shared";
import {
  amountDueNow,
  paymentModeLabel,
  type PublicPaymentInfo,
} from "@/lib/public-booking/payment";

/**
 * Admin-confirms mode: after booking, ask the customer to transfer and send
 * the slip to the OA chat, where a person confirms it. The chat opens with
 * the booking reference already typed in.
 */

export interface SlipHandoff {
  reference: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  totalAmount: number;
  holdExpiresAt: string | null;
}

export function lineChatLink(lineOaId: string | null, fallbackUrl: string, text: string) {
  return lineOaId
    ? `https://line.me/R/oaMessage/${encodeURIComponent(lineOaId)}/?${encodeURIComponent(text)}`
    : fallbackUrl;
}

export function slipMessage(b: SlipHandoff) {
  return [
    `ส่งสลิปยืนยันการจอง ${b.reference}`,
    `${b.roomName} · ${thaiDateShort(bkkDate(b.startsAt))} ${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)} น.`,
  ].join("\n");
}

function SlipInstructions({
  booking,
  payment,
  chatUrl,
}: {
  booking: SlipHandoff;
  payment: PublicPaymentInfo;
  chatUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const due = amountDueNow(booking.totalAmount, payment.mode, payment.depositPercent);
  const copy = (text: string, key: string) =>
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <>
      <ol className="space-y-3 text-[14px] text-ink-1">
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-1 text-[12px] font-bold text-white">1</span>
          <span>
            โอน{due > 0 ? (
              <>
                {" "}
                <b className="tabular-nums">฿{formatBahtPlain(due)}</b>{" "}
                <span className="text-ink-3">
                  ({paymentModeLabel(payment.mode, payment.depositPercent)}
                  {payment.mode !== "full" && due < booking.totalAmount ? ` จากยอดรวม ฿${formatBahtPlain(booking.totalAmount)}` : ""})
                </span>
              </>
            ) : (
              "ตามยอดที่แอดมินแจ้ง"
            )}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-1 text-[12px] font-bold text-white">2</span>
          <span>
            ส่งสลิปพร้อมรหัสการจอง{" "}
            <button
              type="button"
              onClick={() => copy(booking.reference, "ref")}
              className="inline-flex items-center gap-1 font-mono font-bold underline decoration-slate-900/20 underline-offset-4"
            >
              {booking.reference}
              {copied === "ref" ? <Check size={13} weight="bold" /> : <Copy size={13} weight="light" />}
            </button>{" "}
            ให้แอดมินทาง LINE
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-1 text-[12px] font-bold text-white">3</span>
          <span>แอดมินตรวจสลิปและยืนยันการจองให้ในแชท</span>
        </li>
      </ol>

      {payment.banks.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {payment.banks.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-[16px] border border-slate-900/[0.08] p-3">
              <BankLogo bank={b.bank_name} size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-ink-3">{bankDisplayName(b.bank_name)}</p>
                <p className="whitespace-nowrap font-mono text-[16px] font-bold tabular-nums">{b.account_number}</p>
                <p className="truncate text-[12px] text-ink-2">{b.account_name}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(b.account_number.replace(/\D/g, ""), b.id)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-slate-100 px-3 text-[12px] font-semibold"
              >
                {copied === b.id ? <Check size={13} weight="bold" /> : <Copy size={13} weight="light" />}
                {copied === b.id ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-ink-3">แอดมินจะแจ้งเลขบัญชีสำหรับโอนในแชท LINE</p>
      )}

      {booking.holdExpiresAt && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          กันห้องไว้ให้ถึง {bkkDateLabel(booking.holdExpiresAt)} {bkkTime(booking.holdExpiresAt)} น.
        </p>
      )}

      <a
        href={chatUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-pill bg-[#06C755] text-[16px] font-semibold tracking-tight text-white hover:brightness-95"
      >
        เปิดแชท LINE ส่งสลิป
      </a>
    </>
  );
}

/** Opens by itself once, right after booking; can be reopened from a button. */
export function SendSlipPopup({
  booking,
  payment,
  lineOaId,
  lineUrl,
  open,
  onClose,
}: {
  booking: SlipHandoff;
  payment: PublicPaymentInfo;
  lineOaId: string | null;
  lineUrl: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const chatUrl = lineChatLink(lineOaId, lineUrl, slipMessage(booking));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="ส่งสลิปยืนยันการจอง">
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0 bg-slate-950/50 es-fade-in" />
      <div className="relative w-full max-w-[460px] overflow-hidden rounded-t-[28px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 shadow-2xl sm:rounded-[28px] es-sheet-up">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-ink-3">{booking.reference} · รอยืนยัน</p>
            <h2 className="mt-0.5 text-[22px] font-bold leading-tight tracking-tighter">ส่งสลิปเพื่อยืนยันการจอง</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-slate-100">
            <X size={18} weight="light" />
          </button>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
          เรากันห้องไว้ให้แล้ว การจองจะสมบูรณ์เมื่อแอดมินได้รับสลิปการโอน
        </p>
        <div className="mt-5">
          <SlipInstructions booking={booking} payment={payment} chatUrl={chatUrl} />
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-[13px] font-medium text-ink-3">
          ไว้ทีหลัง
        </button>
      </div>
    </div>
  );
}

/** Same instructions inline, for the booking status page. */
export function SendSlipCard(props: {
  booking: SlipHandoff;
  payment: PublicPaymentInfo;
  lineOaId: string | null;
  lineUrl: string;
}) {
  const chatUrl = lineChatLink(props.lineOaId, props.lineUrl, slipMessage(props.booking));
  return (
    <section className="rounded-[24px] border border-slate-900/[0.08] bg-white p-5">
      <h2 className="text-[17px] font-bold tracking-tight">ส่งสลิปเพื่อยืนยันการจอง</h2>
      <p className="mt-1 text-[13px] text-ink-2">การจองจะสมบูรณ์เมื่อแอดมินได้รับสลิปการโอน</p>
      <div className="mt-4">
        <SlipInstructions booking={props.booking} payment={props.payment} chatUrl={chatUrl} />
      </div>
    </section>
  );
}
