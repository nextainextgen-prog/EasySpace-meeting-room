"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cancelMemberBooking } from "@/lib/actions/members";

export function CancelBookingButton({
  bookingId,
  memberId,
}: {
  bookingId: string;
  memberId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        iconLeft={<Trash2 size={14} />}
        onClick={() => setOpen(true)}
      >
        ยกเลิกการจอง
      </Button>
    );
  }

  return (
    <div className="w-full rounded-card-sm border border-red-200 bg-red-50/60 p-4 space-y-3">
      <p className="text-sm font-semibold text-red-800 tracking-tight">
        ยืนยันยกเลิกการจอง?
      </p>
      <div>
        <Label className="!text-red-700">เหตุผล (จำเป็น)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น เลื่อนประชุม / ไม่ใช้แล้ว"
          className="!bg-white"
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setReason("");
          }}
        >
          ยกเลิก
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            if (!reason.trim()) {
              setError("ใส่เหตุผล");
              return;
            }
            startTransition(async () => {
              const res = await cancelMemberBooking({
                bookingId,
                memberId,
                reason: reason.trim(),
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
        </Button>
      </div>
    </div>
  );
}
