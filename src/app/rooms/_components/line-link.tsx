"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { Spinner } from "./spinner";
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
      <div className="flex items-center justify-center gap-2 py-2 text-[13px] font-medium text-ink-2">
        <Check size={15} weight="bold" className="text-[#06C755]" />
        {note ?? "ส่งรายละเอียดการจองเข้า LINE ของคุณแล้ว"}
      </div>
    );
  }

  if (busy) {
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 text-[13px] text-ink-3">
        <Spinner /> กำลังเชื่อมกับ LINE...
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
          : "flex w-full items-center gap-3 rounded-[18px] border border-slate-900/[0.08] bg-white p-4 text-left transition hover:border-slate-900/20"
      }
    >
      {compact ? (
        "รับการยืนยันทาง LINE"
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-tight">รับการยืนยันทาง LINE</span>
            <span className="block text-[12px] text-ink-3">รายละเอียดการจองและใบยืนยันการชำระเงินจะส่งเข้าแชทของคุณ</span>
          </span>
          <span className="shrink-0 rounded-pill bg-[#06C755] px-3 py-1.5 text-[12px] font-semibold text-white">เปิดใน LINE</span>
        </>
      )}
    </button>
  );
}
