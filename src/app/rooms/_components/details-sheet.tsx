"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CaretLeft, Minus, Plus, X } from "@phosphor-icons/react";
import { Spinner } from "./spinner";
import { cn } from "@/lib/cn";
import {
  durationLabel,
  formatBahtPlain,
  thaiDateLong,
  type PublicChannel,
  type quotePublic,
} from "@/lib/public-booking/shared";
import { submitPublicBooking } from "@/lib/actions/public-booking";
import { PriceLines, type FlowRoom } from "./booking-flow";
import type { BookingSuccess } from "./success-view";
import { useLiff } from "./liff";
import {
  amountDueNow,
  paymentModeLabel,
  type PublicPaymentInfo,
} from "@/lib/public-booking/payment";

const CONTACT_KEY = "easyspace.public.contact.v1";

interface Contact {
  name: string;
  phone: string;
  email: string;
  company: string;
}

function readContact(): Contact | null {
  try {
    const raw = window.localStorage.getItem(CONTACT_KEY);
    return raw ? (JSON.parse(raw) as Contact) : null;
  } catch {
    return null;
  }
}

function writeContact(c: Contact) {
  try {
    window.localStorage.setItem(CONTACT_KEY, JSON.stringify(c));
  } catch {
    // storage unavailable — fine
  }
}

export function DetailsSheet({
  room,
  date,
  selection,
  duration,
  quote,
  channel,
  payment,
  onClose,
  onSlotTaken,
  onSuccess,
}: {
  room: FlowRoom;
  date: string;
  selection: { start: string; end: string };
  duration: number;
  quote: ReturnType<typeof quotePublic>;
  channel: PublicChannel;
  payment: PublicPaymentInfo;
  onClose: () => void;
  onSlotTaken: (message: string) => void;
  onSuccess: (s: BookingSuccess) => void;
}) {
  const [contact, setContact] = useState<Contact>({ name: "", phone: "", email: "", company: "" });
  const [attendees, setAttendees] = useState(
    Math.max(1, Math.min(room.capacity_min ?? 2, room.capacity_max ?? 99)),
  );
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);
  const liff = useLiff();
  const dueNow = payment.ready ? amountDueNow(quote.total, payment.mode, payment.depositPercent) : 0;

  useEffect(() => {
    const saved = readContact();
    if (saved) setContact(saved);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    setTimeout(() => {
      if (!saved?.name) firstField.current?.focus();
    }, 250);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const maxAttendees = room.capacity_max ?? 200;

  function edit(field: keyof Contact, value: string) {
    setContact((c) => ({ ...c, [field]: value }));
    if (error?.field === field) setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (contact.name.trim().length < 2) {
      setError({ message: "กรุณากรอกชื่อ-นามสกุล", field: "name" });
      return;
    }
    if (contact.phone.replace(/\D/g, "").length < 9) {
      setError({ message: "กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้", field: "phone" });
      return;
    }
    startTransition(async () => {
      try {
        const r = await submitPublicBooking({
          roomId: room.id,
          date,
          startTime: selection.start,
          durationMinutes: duration,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
          attendees,
          note,
          channel,
          website: honeypot,
          lineAccessToken: liff.accessToken ?? undefined,
        });
        if (r.ok) {
          writeContact(contact);
          onSuccess({
            reference: r.reference,
            token: r.token,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            totalAmount: r.totalAmount,
            packageName: r.packageName,
            holdExpiresAt: r.holdExpiresAt,
            attendees,
            customerName: contact.name,
            amountDue: r.amountDue,
            paymentMode: r.paymentMode,
            lineLinked: r.lineLinked,
          });
          return;
        }
        if (r.error === "slot_taken") {
          onSlotTaken(r.message);
          return;
        }
        setError({ message: r.message, field: "field" in r ? r.field : undefined });
      } catch {
        setError({ message: "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="กรอกข้อมูลผู้จอง">
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] es-fade-in"
      />
      <form
        onSubmit={submit}
        className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-[520px] sm:rounded-[28px] es-sheet-up"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-900/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-slate-100 sm:hidden"
            aria-label="ย้อนกลับ"
          >
            <CaretLeft size={20} weight="light" />
          </button>
          <div className="flex-1 sm:pl-2">
            <p className="text-[12px] font-medium tracking-tight text-ink-3">
              ขั้นตอนที่ 2
            </p>
            <p className="text-[17px] font-bold tracking-tighter">ข้อมูลผู้จอง</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-slate-100 sm:grid"
            aria-label="ปิด"
          >
            <X size={18} weight="light" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-6">
          {/* Summary */}
          <div className="flex gap-3 rounded-[20px] border border-slate-900/[0.07] bg-slate-50/70 p-3">
            <div
              className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[14px]"
              style={{ background: room.color }}
            >
              {room.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold tracking-tight">{room.name}</p>
              <p className="text-[12.5px] text-ink-2">{thaiDateLong(date)}</p>
              <p className="text-[12.5px] font-semibold text-ink-1 tabular-nums">
                {selection.start} – {selection.end} น. · {durationLabel(duration)}
              </p>
            </div>
          </div>

          {/* Fields */}
          <div className="mt-5 space-y-3.5">
            <Field label="ชื่อ-นามสกุล" required invalid={error?.field === "name"}>
              <input
                ref={firstField}
                value={contact.name}
                onChange={(e) => edit("name", e.target.value)}
                autoComplete="name"
                placeholder="เช่น สมชาย ใจดี"
                className={inputCls(error?.field === "name")}
                maxLength={120}
              />
            </Field>
            <Field label="เบอร์โทรศัพท์" required invalid={error?.field === "phone"}>
              <input
                value={contact.phone}
                onChange={(e) => edit("phone", e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="081-234-5678"
                className={inputCls(error?.field === "phone")}
                maxLength={20}
              />
            </Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="อีเมล" hint="รับรายละเอียดการจอง" invalid={error?.field === "email"}>
                <input
                  value={contact.email}
                  onChange={(e) => edit("email", e.target.value)}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  className={inputCls(error?.field === "email")}
                  maxLength={160}
                />
              </Field>
              <Field label="บริษัท / หน่วยงาน" hint="ถ้ามี">
                <input
                  value={contact.company}
                  onChange={(e) => edit("company", e.target.value)}
                  autoComplete="organization"
                  placeholder="สำหรับออกใบเสร็จ"
                  className={inputCls(false)}
                  maxLength={160}
                />
              </Field>
            </div>

            <Field label="จำนวนผู้เข้าร่วม" hint={room.capacity_max ? `รองรับสูงสุด ${room.capacity_max} ท่าน` : undefined}>
              <div className="flex h-12 items-center justify-between rounded-[14px] border border-slate-900/[0.1] bg-white px-1.5">
                <button
                  type="button"
                  aria-label="ลดจำนวน"
                  onClick={() => setAttendees((n) => Math.max(1, n - 1))}
                  disabled={attendees <= 1}
                  className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-1 hover:bg-slate-100 disabled:text-ink-3/50"
                >
                  <Minus size={16} weight="bold" />
                </button>
                <span className="text-[16px] font-semibold tabular-nums">{attendees} ท่าน</span>
                <button
                  type="button"
                  aria-label="เพิ่มจำนวน"
                  onClick={() => setAttendees((n) => Math.min(maxAttendees, n + 1))}
                  disabled={attendees >= maxAttendees}
                  className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-1 hover:bg-slate-100 disabled:text-ink-3/50"
                >
                  <Plus size={16} weight="bold" />
                </button>
              </div>
            </Field>

            <Field label="หมายเหตุถึงทีมงาน" hint="ถ้ามี">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="เช่น ต้องการจัดโต๊ะแบบห้องเรียน / ขอใบกำกับภาษี"
                className={cn(inputCls(false), "h-auto min-h-[76px] resize-none py-3 leading-relaxed")}
              />
            </Field>

            {/* Honeypot: off-screen, skipped by keyboard and screen readers. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  name="website"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-slate-900/[0.07] p-4">
            <p className="text-[13px] font-semibold tracking-tight">สรุปค่าบริการ</p>
            <PriceLines room={room} duration={duration} quote={quote} payment={payment} />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 border-l-2 border-rose-600 pl-3 text-[13px] text-rose-700"
            >
              {error.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-900/[0.06] bg-white px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 sm:px-6 sm:pb-5">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-ink-1 text-[16px] font-semibold tracking-tight text-white transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-70"
          >
            {pending ? (
              <>
                <Spinner /> กำลังจองห้อง...
              </>
            ) : (
              <>
                {dueNow > 0
                  ? `ยืนยันและชำระเงิน · ฿${formatBahtPlain(dueNow)}`
                  : `ยืนยันการจอง · ฿${formatBahtPlain(quote.total)}`}
              </>
            )}
          </button>
          <p className="mt-2.5 text-center text-[11.5px] text-ink-3">
            {dueNow > 0
              ? `ขั้นตอนถัดไป: โอน${paymentModeLabel(payment.mode, payment.depositPercent)} และแนบสลิป`
              : "ยังไม่มีการเก็บเงิน · ข้อมูลใช้เพื่อยืนยันการจองเท่านั้น"}
          </p>
        </div>
      </form>
    </div>
  );
}

function inputCls(invalid: boolean) {
  return cn(
    "h-12 w-full rounded-[14px] border bg-white px-4 text-[16px] tracking-tight text-ink-1 placeholder:text-ink-3/80 transition focus:outline-none focus:ring-4",
    invalid
      ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
      : "border-slate-900/[0.1] focus:border-primary-600 focus:ring-primary-600/10",
  );
}

function Field({
  label,
  hint,
  required,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn("text-[13px] font-semibold tracking-tight", invalid ? "text-rose-600" : "text-ink-1")}>
          {label}
          {required && <span className="ml-0.5 text-ink-3">*</span>}
        </span>
        {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
