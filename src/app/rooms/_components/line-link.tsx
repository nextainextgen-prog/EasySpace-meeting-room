"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { linkLineAccount } from "@/lib/actions/public-booking";
import { useLiff } from "./liff";

/**
 * "Get updates in LINE".
 *  - Already inside LINE (LIFF): links silently and says so.
 *  - Anywhere else: one tap hands the booking page over to LINE via LIFF,
 *    where this same component links it on arrival.
 * Renders nothing when LIFF isn't configured.
 */
export function LineLink({
  reference,
  token,
  linked: initiallyLinked,
  compact,
}: {
  reference: string;
  token: string;
  linked: boolean;
  compact?: boolean;
}) {
  const liff = useLiff();
  const [linked, setLinked] = useState(initiallyLinked);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (linked || tried.current || !liff.ready || !liff.accessToken) return;
    tried.current = true;
    setBusy(true);
    linkLineAccount(reference, token, liff.accessToken)
      .then((r) => {
        if (r.ok) {
          setLinked(true);
          if (!r.pushed && r.message) {
            setNote("เพิ่มเพื่อน LINE OA ของเราก่อน เพื่อรับข้อความยืนยัน");
          }
        }
      })
      .finally(() => setBusy(false));
  }, [linked, liff.ready, liff.accessToken, reference, token]);

  if (!liff.liffId) return null;

  if (linked) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-pill bg-[#06C755]/10 px-4 py-2.5 text-[13px] font-semibold text-[#05A847]">
        <Check size={16} strokeWidth={2.25} />
        {note ?? "ส่งรายละเอียดการจองเข้า LINE ของคุณแล้ว"}
      </div>
    );
  }

  if (busy) {
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 text-[13px] text-ink-3">
        <Loader2 size={16} className="animate-spin" /> กำลังเชื่อมกับ LINE...
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => liff.openInLine(`booking/${reference}?t=${token}&src=line`)}
      className={
        compact
          ? "inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-pill bg-[#06C755] text-[14px] font-semibold tracking-tight text-white hover:brightness-95"
          : "flex w-full items-center gap-3 rounded-[18px] border border-[#06C755]/25 bg-[#06C755]/[0.06] p-3.5 text-left transition hover:bg-[#06C755]/10"
      }
    >
      {compact ? (
        <>
          <MessageCircle size={16} strokeWidth={2} /> รับการยืนยันทาง LINE
        </>
      ) : (
        <>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#06C755] text-white">
            <MessageCircle size={18} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-tight">รับการยืนยันทาง LINE</span>
            <span className="block text-[12px] text-ink-3">รายละเอียดการจองและใบยืนยันการชำระเงินจะส่งเข้าแชทของคุณ</span>
          </span>
        </>
      )}
    </button>
  );
}
