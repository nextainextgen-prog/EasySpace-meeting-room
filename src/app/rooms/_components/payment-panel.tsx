"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "@phosphor-icons/react";
import { Spinner } from "./spinner";
import { cn } from "@/lib/cn";
import { bkkTime } from "@/lib/time/bkk";
import {
  paymentModeLabel,
  promptPayPayload,
  type PaymentMode,
  type PublicPaymentInfo,
} from "@/lib/public-booking/payment";
import { formatBahtPlain } from "@/lib/public-booking/shared";

export interface SlipOutcome {
  amount: number;
  paymentStatus: string;
}

/** Keep uploads well under EasySlip's 4 MB cap without hurting the QR. */
async function prepareImage(file: File): Promise<Blob> {
  const small = file.size <= 3_500_000 && /image\/(jpeg|png)/.test(file.type);
  if (small) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // let the server / EasySlip say what's wrong
  }
}

function useCountdown(deadline: string | null) {
  // Null until mounted: the server and the browser would never agree on the
  // current second, and a mismatch throws away the hydrated tree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  if (now === null) return { expired: false, label: "--:--" };
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return { expired: true, label: "หมดเวลา" };
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { expired: false, label: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}` };
}

export function PaymentPanel({
  reference,
  token,
  dueNow,
  totalAmount,
  deadline,
  mode,
  payment,
  onPaid,
}: {
  reference: string;
  token: string;
  dueNow: number;
  totalAmount: number;
  deadline: string | null;
  mode: PaymentMode | null;
  payment: PublicPaymentInfo;
  onPaid: (o: SlipOutcome) => void;
}) {
  const hasPromptPay = Boolean(payment.promptpayId);
  const [tab, setTab] = useState<"promptpay" | "bank">(hasPromptPay ? "promptpay" : "bank");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const countdown = useCountdown(deadline);

  const payload = useMemo(
    () => (payment.promptpayId ? promptPayPayload(payment.promptpayId, dueNow) : null),
    [payment.promptpayId, dueNow],
  );
  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, { margin: 1, width: 560, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [payload]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function copy(text: string, key: string) {
    void navigator.clipboard?.writeText(text.replace(/\D/g, "") || text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function upload() {
    if (!file) return;
    setState("checking");
    setMessage(null);
    try {
      const blob = await prepareImage(file);
      const form = new FormData();
      form.append("reference", reference);
      form.append("token", token);
      form.append("file", blob, blob === file ? file.name : "slip.jpg");
      const res = await fetch("/api/rooms/slip", { method: "POST", body: form });
      const json = (await res.json()) as
        | { ok: true; amount: number; paymentStatus: string; message: string }
        | { ok: false; status: string; message: string };
      if (json.ok) {
        onPaid({ amount: json.amount, paymentStatus: json.paymentStatus });
        return;
      }
      setState("error");
      setMessage(json.message);
    } catch {
      setState("error");
      setMessage("อัปโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
    }
  }

  const expired = countdown?.expired;

  return (
    <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-900/[0.07] shadow-[0_24px_48px_-28px_rgba(15,23,42,0.25)]">
      {/* Amount */}
      <div className="bg-ink-1 px-5 pb-5 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold tracking-tight text-white/60">ขั้นตอนที่ 3 · ชำระเงิน</p>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-tightest tabular-nums">
              ฿{formatBahtPlain(dueNow)}
            </p>
            <p className="mt-1.5 text-[12.5px] text-white/70">
              {paymentModeLabel(mode, payment.depositPercent)}
              {mode !== "full" && dueNow < totalAmount && (
                <> · ส่วนที่เหลือ ฿{formatBahtPlain(totalAmount - dueNow)} ชำระในวันใช้ห้อง</>
              )}
            </p>
          </div>
          {countdown && (
            <div
              className={cn(
                "shrink-0 rounded-[14px] px-3 py-2 text-right",
                expired ? "bg-white/5" : "bg-white/10",
              )}
            >
              <p className="text-[11px] text-white/60">ชำระภายใน</p>
              <p className="text-[18px] font-bold tabular-nums tracking-tight">{countdown.label}</p>
              {deadline && !expired && (
                <p className="text-[10.5px] text-white/50 tabular-nums">ถึง {bkkTime(deadline)} น.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {expired ? (
        <div className="p-5 text-[13.5px] text-ink-2">
          หมดเวลาชำระเงินแล้ว ห้องถูกปล่อยให้ผู้อื่นจอง หากโอนเงินไปแล้วกรุณาติดต่อทีมงานทาง LINE พร้อมรหัสการจอง{" "}
          <span className="font-mono font-semibold text-ink-1">{reference}</span>
        </div>
      ) : (
        <div className="p-5">
          {/* How to pay */}
          {hasPromptPay && payment.banks.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-pill bg-slate-100 p-1">
              {(
                [
                  ["promptpay", "พร้อมเพย์"],
                  ["bank", "โอนเข้าบัญชี"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-1.5 rounded-pill text-[13.5px] font-semibold tracking-tight transition",
                    tab === key ? "bg-white text-ink-1 shadow-card" : "text-ink-3",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === "promptpay" && hasPromptPay ? (
            <div className="text-center">
              <div className="mx-auto w-[220px] rounded-[20px] border border-slate-900/[0.08] bg-white p-3">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR พร้อมเพย์" className="h-auto w-full" />
                ) : (
                  <div className="grid aspect-square place-items-center text-ink-3">
                    <Spinner className="h-5 w-5" />
                  </div>
                )}
              </div>
              <p className="mt-3 text-[13px] text-ink-2">
                สแกนด้วยแอปธนาคาร ยอด <b className="text-ink-1">฿{formatBahtPlain(dueNow)}</b> จะขึ้นให้อัตโนมัติ
              </p>
              {qr && (
                <a
                  href={qr}
                  download={`promptpay-${reference}.png`}
                  className="mt-2 inline-block text-[12.5px] font-semibold text-ink-1 underline underline-offset-4"
                >
                  บันทึกรูป QR
                </a>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {payment.banks.map((b) => (
                <li key={b.id} className="rounded-[18px] border border-slate-900/[0.08] p-4">
                  <p className="text-[12px] font-medium text-ink-3">{b.bank_name}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="font-mono text-[19px] font-bold tracking-tight tabular-nums">{b.account_number}</p>
                    <button
                      type="button"
                      onClick={() => copy(b.account_number, b.id)}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-slate-100 px-3 text-[12px] font-semibold text-ink-1"
                    >
                      {copied === b.id ? <Check size={14} weight="bold" /> : <Copy size={14} weight="light" />}
                      {copied === b.id ? "คัดลอกแล้ว" : "คัดลอก"}
                    </button>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-2">{b.account_name}</p>
                </li>
              ))}
            </ul>
          )}

          {/* Slip */}
          <div className="mt-5">
            <p className="text-[13.5px] font-semibold tracking-tight">แนบสลิปการโอน</p>
            <p className="text-[12px] text-ink-3">ระบบตรวจสลิปกับธนาคารและยืนยันการจองให้ทันที</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setState("idle");
                  setMessage(null);
                }
                e.target.value = "";
              }}
            />
            {file && preview ? (
              <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-slate-900/[0.08] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="สลิป" className="h-20 w-16 shrink-0 rounded-[10px] object-cover ring-1 ring-slate-900/[0.06]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{file.name}</p>
                  <p className="text-[12px] text-ink-3">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  <button
                    type="button"
                    disabled={state === "checking"}
                    onClick={() => inputRef.current?.click()}
                    className="mt-1 text-[12.5px] font-semibold text-ink-1 underline underline-offset-4 disabled:opacity-50"
                  >
                    เปลี่ยนรูป
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 flex w-full flex-col items-center justify-center gap-1 rounded-[18px] border border-dashed border-slate-900/20 px-4 py-6 text-center transition hover:border-ink-1"
              >
                <span className="text-[14px] font-semibold tracking-tight underline decoration-slate-900/20 underline-offset-4">
                  เลือกรูปสลิป
                </span>
                <span className="text-[12px] text-ink-3">ถ่ายภาพหรือเลือกจากคลังรูป · เห็น QR บนสลิปชัดเจน</span>
              </button>
            )}

            {state === "error" && message && (
              <p role="alert" className="mt-3 border-l-2 border-rose-600 pl-3 text-[13px] text-rose-700">
                {message}
              </p>
            )}

            <button
              type="button"
              disabled={!file || state === "checking"}
              onClick={upload}
              className="mt-4 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-ink-1 text-[16px] font-semibold tracking-tight text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-ink-3"
            >
              {state === "checking" ? (
                <>
                  <Spinner /> กำลังตรวจสอบสลิปกับธนาคาร...
                </>
              ) : (
                "ยืนยันการชำระเงิน"
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
