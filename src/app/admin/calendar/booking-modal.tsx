"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X,
  FileText,
  CreditCard,
  History,
  Paperclip,
  Lock,
  Save,
  Plus,
  Upload,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatBaht } from "@/lib/format";
import {
  getBookingDetail,
  addBookingPayment,
  updateBookingInfo,
  acquireBookingLock,
  releaseBookingLock,
  setBookingStatus,
  setPaymentStatus,
} from "@/lib/actions/calendar";
import { cancelBooking } from "@/lib/actions/bookings";

interface Props {
  bookingId: string;
  onClose: () => void;
  onSaved?: (b: { id: string } & Record<string, unknown>) => void;
}

type Tab = "info" | "payment" | "history" | "files";

type Detail = Awaited<ReturnType<typeof getBookingDetail>>;

export function BookingModal({ bookingId, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("info");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<
    | { kind: "mine" }
    | { kind: "locked"; by: string; until: string }
    | { kind: "none" }
  >({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const d = await getBookingDetail(bookingId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "โหลดข้อมูลการจองไม่สำเร็จ",
          );
      }
      // Lock is best-effort — never block the modal on its failure
      try {
        const lockRes = await acquireBookingLock(bookingId);
        if (!cancelled) {
          if (lockRes.ok) setLockStatus({ kind: "mine" });
          else if (lockRes.error === "locked_by_other")
            setLockStatus({
              kind: "locked",
              by: lockRes.lockedBy ?? "ผู้ใช้อื่น",
              until: lockRes.until ?? "",
            });
        }
      } catch {
        // ignore — modal stays editable
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      void releaseBookingLock(bookingId).catch(() => {});
    };
  }, [bookingId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
        <div className="w-full max-w-3xl surface-card !p-6 flex items-center gap-3">
          <span className="inline-block w-4 h-4 rounded-pill border-2 border-primary-200 border-t-primary-600 animate-spin" />
          <p className="text-sm text-ink-2">กำลังโหลดข้อมูลการจอง...</p>
          <button
            onClick={onClose}
            className="ml-auto text-ink-3 hover:text-ink-1 text-xs"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  if (loadError || !detail || !detail.booking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
        <div className="w-full max-w-md surface-card !p-6">
          <p className="text-sm font-semibold tracking-tight mb-1">
            เปิดข้อมูลการจองไม่สำเร็จ
          </p>
          <p className="text-xs text-ink-3 mb-4">
            {loadError ?? "ไม่พบข้อมูลการจองนี้ — อาจถูกลบหรือยังไม่ sync"}
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              ปิด
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                getBookingDetail(bookingId)
                  .then((d) => {
                    setDetail(d);
                    setLoading(false);
                  })
                  .catch((e) => {
                    setLoadError(
                      e instanceof Error ? e.message : "โหลดไม่สำเร็จ",
                    );
                    setLoading(false);
                  });
              }}
            >
              ลองอีกครั้ง
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4 print:p-0 print:bg-white">
      <div className="w-full max-w-3xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0">
          <Header
            detail={detail}
            lockStatus={lockStatus}
            onClose={onClose}
          />
        </div>

        <div className="shrink-0 px-5 border-b border-line bg-surface-subtle/30 flex gap-1 print:hidden">
          {(
            [
              ["info", "ข้อมูล", FileText],
              ["payment", "การชำระเงิน", CreditCard],
              ["history", "ประวัติ", History],
              ["files", "ไฟล์แนบ", Paperclip],
            ] as Array<[Tab, string, typeof FileText]>
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px",
                tab === id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-ink-2 hover:text-ink-1",
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "info" && (
            <InfoTab
              detail={detail}
              readonly={lockStatus.kind === "locked"}
              onSaved={(patch) => {
                setDetail((prev) => {
                  if (!prev) return prev;
                  const merged =
                    prev.booking && typeof prev.booking === "object"
                      ? ({
                          ...(prev.booking as Record<string, unknown>),
                          ...patch,
                        } as typeof prev.booking)
                      : prev.booking;
                  return { ...prev, booking: merged };
                });
                onSaved?.({ id: bookingId, ...patch });
              }}
            />
          )}
          {tab === "payment" && (
            <PaymentTab
              detail={detail}
              readonly={lockStatus.kind === "locked"}
              onAdded={async () => {
                const fresh = await getBookingDetail(bookingId);
                setDetail(fresh);
                if (fresh.booking)
                  onSaved?.({
                    id: bookingId,
                    paid_amount: (fresh.booking as Record<string, unknown>)
                      .paid_amount as number,
                    payment_status: (fresh.booking as Record<string, unknown>)
                      .payment_status as string,
                  });
              }}
            />
          )}
          {tab === "history" && <HistoryTab detail={detail} />}
          {tab === "files" && <FilesTab detail={detail} />}
        </div>

        <div className="shrink-0">
          <Footer
            detail={detail}
            readonly={lockStatus.kind === "locked"}
            onClose={onClose}
            onCancelled={() => {
              onSaved?.({ id: bookingId, booking_status: "cancelled" });
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  detail,
  lockStatus,
  onClose,
}: {
  detail: Detail;
  lockStatus:
    | { kind: "mine" }
    | { kind: "locked"; by: string; until: string }
    | { kind: "none" };
  onClose: () => void;
}) {
  const b = detail.booking as unknown as Record<string, unknown>;
  const customer = (b.customer ?? {}) as Record<string, unknown>;
  const room = (b.room ?? {}) as Record<string, unknown>;
  const member = (b.member ?? null) as Record<string, unknown> | null;
  const org = (b.org ?? null) as Record<string, unknown> | null;
  const status = (b.payment_status as string) ?? "unpaid";
  const headerName =
    (customer.display_name as string) ??
    (member?.full_name as string) ??
    (b.internal_title as string) ??
    "—";
  const headerSub = org
    ? `${(org.short_name as string) ?? (org.name as string)} · สมาชิก`
    : (b.source as string) === "internal"
      ? "จองภายใน"
      : null;

  return (
    <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <code className="font-mono font-bold text-primary-700">
            {b.reference_code as string}
          </code>
          <Badge
            tone={
              status === "paid"
                ? "success"
                : status === "deposit"
                  ? "warning"
                  : status === "free"
                    ? "muted"
                    : "danger"
            }
            className="!text-[10px]"
          >
            {status}
          </Badge>
          {lockStatus.kind === "locked" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-50 border border-amber-200 text-amber-700 text-[10px]">
              <Lock size={10} /> ล็อกโดย {lockStatus.by}
            </span>
          )}
          {lockStatus.kind === "mine" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">
              <Lock size={10} /> ล็อกโดยคุณ
            </span>
          )}
        </div>
        <p className="font-bold tracking-tight text-lg">{headerName}</p>
        {headerSub && (
          <p className="text-[11px] text-primary-700 font-medium mt-0.5">
            {headerSub}
          </p>
        )}
        <p className="text-xs text-ink-3 mt-0.5">
          {(room.name as string) ?? "—"} ·{" "}
          {new Date(b.starts_at as string).toLocaleString("th-TH", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" – "}
          {new Date(b.ends_at as string).toLocaleString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <button onClick={onClose} className="text-ink-3 hover:text-ink-1">
        <X size={18} />
      </button>
    </div>
  );
}

/* ───────── Info Tab ───────── */
function InfoTab({
  detail,
  readonly,
  onSaved,
}: {
  detail: Detail;
  readonly: boolean;
  onSaved: (patch: Record<string, unknown>) => void;
}) {
  const b = detail.booking as unknown as Record<string, unknown>;
  const customer = (b.customer ?? {}) as Record<string, unknown>;
  const room = (b.room ?? {}) as Record<string, unknown>;
  const pkg = (b.package ?? null) as Record<string, unknown> | null;
  const member = (b.member ?? null) as Record<string, unknown> | null;
  const org = (b.org ?? null) as Record<string, unknown> | null;
  const department = (b.department as string | null) ?? null;
  const memberTier = (b.member_tier as string | null) ?? null;
  const isInternal = (b.source as string) === "internal";
  const addons = detail.addons as Array<{
    addon: { name: string } | null;
    quantity: number;
    unit_price: number;
  }>;

  const [attendees, setAttendees] = useState(
    (b.attendees_count as number) ?? 0,
  );
  const [notes, setNotes] = useState((b.notes as string) ?? "");
  const [internalTitle, setInternalTitle] = useState(
    (b.internal_title as string) ?? "",
  );
  const [internalAgenda, setInternalAgenda] = useState(
    (b.internal_agenda as string) ?? "",
  );
  const [saving, startTransition] = useTransition();
  const [savedHint, setSavedHint] = useState(false);

  function save() {
    startTransition(async () => {
      const r = await updateBookingInfo({
        bookingId: b.id as string,
        attendees,
        notes,
        internalTitle,
        internalAgenda,
      });
      if (r.ok) {
        setSavedHint(true);
        onSaved({
          attendees_count: attendees,
          notes,
          internal_title: internalTitle,
          internal_agenda: internalAgenda,
        });
        setTimeout(() => setSavedHint(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-4">
      <BookingStatusBar
        bookingId={b.id as string}
        currentStatus={(b.booking_status as BookingStatusKey) ?? "pending"}
        currentPayment={(b.payment_status as PaymentStatusKey) ?? "unpaid"}
        readonly={readonly}
        onChanged={(patch) => onSaved(patch)}
      />

      {isInternal && (member || org) && (
        <div className="rounded-input bg-primary-50/60 border border-primary-100 p-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-primary-700 font-semibold mb-2">
            ผู้จอง (สมาชิกองค์กร)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {member && (
              <>
                <Info
                  label="ชื่อสมาชิก"
                  value={(member.full_name as string) ?? "—"}
                />
                <Info
                  label="ตำแหน่ง"
                  value={(member.position as string) ?? "—"}
                />
                <Info label="แผนก" value={department ?? "—"} />
                <Info
                  label="ระดับสิทธิ์"
                  value={
                    memberTier === "manager"
                      ? "ผู้จัดการ"
                      : memberTier === "guest"
                        ? "Guest"
                        : memberTier === "member"
                          ? "สมาชิก"
                          : "—"
                  }
                />
                <Info
                  label="Email"
                  value={(member.email as string) ?? "—"}
                />
                <Info
                  label="เบอร์"
                  value={(member.phone as string) ?? "—"}
                />
              </>
            )}
            {org && (
              <>
                <Info
                  label="องค์กร"
                  value={(org.name as string) ?? "—"}
                />
                <Info
                  label="ชื่อย่อ"
                  value={(org.short_name as string) ?? "—"}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Info
          label={isInternal ? "ลูกค้า (ไม่มี — จองภายใน)" : "ลูกค้า"}
          value={
            (customer.display_name as string) ??
            (member?.full_name as string) ??
            "—"
          }
        />
        <Info
          label="เบอร์"
          value={
            (customer.phone as string) ?? (member?.phone as string) ?? "—"
          }
        />
        <Info
          label="Email"
          value={
            (customer.email as string) ?? (member?.email as string) ?? "—"
          }
        />
        <Info
          label="ห้อง"
          value={(room.name as string) ?? "—"}
        />
        <Info
          label="แพ็กเกจ"
          value={
            pkg
              ? `${pkg.name as string} · ${pkg.hours as number} ชม.`
              : "—"
          }
        />
        <Info
          label="ยอดรวม"
          value={formatBaht(Number(b.total_amount))}
        />
      </div>

      <div className="rounded-input bg-surface-subtle/50 border border-line-soft p-3">
        <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-2">
          บริการเสริม
        </p>
        {addons.length === 0 ? (
          <p className="text-xs text-ink-3">ไม่มี</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {addons.map((a, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-ink-2"
              >
                <span>
                  {a.addon?.name ?? "—"} × {a.quantity}
                </span>
                <span className="tabular-nums">
                  {formatBaht(Number(a.unit_price) * a.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>จำนวนผู้เข้าประชุม</Label>
          <Input
            type="number"
            min={0}
            value={attendees}
            onChange={(e) => setAttendees(Number(e.target.value) || 0)}
            disabled={readonly}
          />
        </div>
        <div>
          <Label>หัวข้อภายใน</Label>
          <Input
            value={internalTitle}
            onChange={(e) => setInternalTitle(e.target.value)}
            disabled={readonly}
          />
        </div>
      </div>
      <div>
        <Label>วาระประชุม</Label>
        <Textarea
          rows={2}
          value={internalAgenda}
          onChange={(e) => setInternalAgenda(e.target.value)}
          disabled={readonly}
        />
      </div>
      <div>
        <Label>หมายเหตุ</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={readonly}
        />
      </div>

      <div className="flex justify-end gap-2 items-center">
        {savedHint && (
          <span className="text-xs text-emerald-600">บันทึกแล้ว</span>
        )}
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Save size={13} />}
          disabled={saving || readonly}
          onClick={save}
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>
    </div>
  );
}

/* ───────── Payment Tab ───────── */
function PaymentTab({
  detail,
  readonly,
  onAdded,
}: {
  detail: Detail;
  readonly: boolean;
  onAdded: () => void;
}) {
  const b = detail.booking as unknown as Record<string, unknown>;
  const payments = detail.payments as Array<{
    id: string;
    paid_at: string;
    amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
  }>;

  const total = Number(b.total_amount);
  const paid = Number(b.paid_amount);
  const remaining = Math.max(0, total - paid);
  const deposit = Number(b.deposit_amount);

  const [amount, setAmount] = useState(remaining > 0 ? remaining : 0);
  const [method, setMethod] = useState<
    "cash" | "bank_transfer" | "promptpay" | "qr" | "credit_card"
  >("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (amount <= 0) {
      setErr("จำนวนต้องมากกว่า 0");
      return;
    }
    startTransition(async () => {
      const r = await addBookingPayment({
        bookingId: b.id as string,
        amount,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      if (r.ok) {
        setReference("");
        setNotes("");
        setAmount(0);
        onAdded();
      } else {
        setErr(`บันทึกไม่สำเร็จ: ${r.error}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 text-xs">
        <StatBox
          label="ยอดรวม"
          value={formatBaht(total)}
          tone="default"
        />
        <StatBox
          label="มัดจำ"
          value={formatBaht(deposit)}
          tone="warning"
        />
        <StatBox
          label="ชำระแล้ว"
          value={formatBaht(paid)}
          tone="success"
        />
        <StatBox
          label="คงเหลือ"
          value={formatBaht(remaining)}
          tone={remaining > 0 ? "danger" : "default"}
        />
      </div>

      <div className="rounded-input border border-line-soft overflow-hidden">
        <div className="px-3 py-2 bg-surface-subtle/60 text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          ประวัติการชำระเงิน ({payments.length})
        </div>
        {payments.length === 0 ? (
          <p className="px-3 py-4 text-xs text-ink-3 text-center">
            ยังไม่มีรายการชำระเงิน
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {payments.map((p) => (
              <li
                key={p.id}
                className="px-3 py-2 flex items-center gap-3 text-sm"
              >
                <span className="text-[10px] text-ink-3 tabular-nums w-28 shrink-0">
                  {new Date(p.paid_at).toLocaleString("th-TH", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatBaht(Number(p.amount))}
                </span>
                <Badge tone="muted" className="!text-[10px]">
                  {p.method}
                </Badge>
                <span className="text-xs text-ink-3 truncate flex-1">
                  {p.reference ?? p.notes ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!readonly && remaining > 0 && (
        <div className="rounded-input border border-primary-200 bg-primary-50/30 p-3">
          <p className="text-xs font-semibold text-primary-700 mb-2.5 inline-flex items-center gap-1">
            <Plus size={12} /> บันทึกการชำระเงินใหม่
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>จำนวน (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>วิธีชำระ</Label>
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                <option value="cash">เงินสด</option>
                <option value="bank_transfer">โอนธนาคาร</option>
                <option value="promptpay">PromptPay</option>
                <option value="qr">QR</option>
                <option value="credit_card">บัตรเครดิต</option>
              </Select>
            </div>
            <div>
              <Label>อ้างอิง / เลขที่</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="REF-..."
              />
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="..."
              />
            </div>
          </div>
          {err && (
            <p className="text-xs text-red-600 mt-2">{err}</p>
          )}
          <div className="flex justify-end mt-3">
            <Button
              variant="gradient"
              size="sm"
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── History Tab ───────── */
function HistoryTab({ detail }: { detail: Detail }) {
  const audit = detail.audit as Array<{
    id: string;
    created_at: string;
    action: string;
    actor_name: string | null;
    changes: Record<string, unknown> | null;
    reason: string | null;
  }>;

  if (audit.length === 0)
    return (
      <p className="text-sm text-ink-3 text-center py-8">ไม่มีประวัติ</p>
    );

  return (
    <ol className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-line">
      {audit.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              "absolute -left-[18px] top-1.5 w-3 h-3 rounded-full border-2 border-white",
              e.action === "cancelled"
                ? "bg-red-500"
                : e.action === "payment_added" || e.action === "paid"
                  ? "bg-emerald-500"
                  : e.action === "moved"
                    ? "bg-amber-500"
                    : "bg-primary-500",
            )}
          />
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold tracking-tight">
              {actionLabel(e.action)}
            </p>
            <span className="text-[10px] text-ink-3 tabular-nums">
              {new Date(e.created_at).toLocaleString("th-TH", {
                day: "2-digit",
                month: "short",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {e.actor_name && (
            <p className="text-[11px] text-ink-3">โดย {e.actor_name}</p>
          )}
          {e.reason && (
            <p className="text-xs text-ink-2 mt-1">{e.reason}</p>
          )}
          {e.changes && (
            <pre className="mt-1 text-[10px] text-ink-3 bg-surface-subtle/60 rounded-input px-2 py-1.5 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(e.changes, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}

function actionLabel(action: string) {
  switch (action) {
    case "created":
      return "สร้างการจอง";
    case "moved":
      return "ย้ายเวลา / ห้อง";
    case "updated":
      return "แก้ไขข้อมูล";
    case "cancelled":
      return "ยกเลิก";
    case "payment_added":
    case "paid":
      return "บันทึกการชำระเงิน";
    default:
      return action;
  }
}

/* ───────── Files Tab ───────── */
function FilesTab({ detail }: { detail: Detail }) {
  const b = detail.booking as unknown as Record<string, unknown>;
  const metadata = (b.metadata as Record<string, unknown> | null) ?? {};
  const files = ((metadata.files as Array<{ name: string; url: string }>) ??
    []) as Array<{ name: string; url: string }>;
  const payments = detail.payments as Array<{ slip_url: string | null }>;
  const slips = payments.filter((p) => !!p.slip_url);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-2">
          สลิปการโอน
        </p>
        {slips.length === 0 ? (
          <p className="text-xs text-ink-3">ยังไม่มีสลิป</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slips.map((s, i) => (
              <a
                key={i}
                href={s.slip_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square bg-surface-subtle/60 rounded-input border border-line-soft overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.slip_url ?? ""}
                  alt="slip"
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-2">
          เอกสาร / ไฟล์แนบ
        </p>
        {files.length === 0 ? (
          <div className="rounded-input border border-dashed border-line p-6 text-center">
            <Upload
              size={20}
              className="text-ink-3 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <p className="text-xs text-ink-3">
              ยังไม่มีไฟล์แนบ — อัปโหลดเอกสารผ่าน Supabase Storage ใน
              metadata.files
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-input border border-line-soft text-sm"
              >
                <FileText size={14} className="text-ink-3" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-primary-700 hover:underline"
                >
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────── Footer ───────── */
function Footer({
  detail,
  readonly,
  onClose,
  onCancelled,
}: {
  detail: Detail;
  readonly: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const b = detail.booking as unknown as Record<string, unknown>;
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, startTransition] = useTransition();

  function doCancel() {
    startTransition(async () => {
      const r = await cancelBooking({
        bookingId: b.id as string,
        reason: reason || "ยกเลิกจาก modal",
      });
      if (r.ok) onCancelled();
    });
  }

  const cancelled = b.booking_status === "cancelled";

  return (
    <div className="px-5 py-3 bg-surface-subtle border-t border-line-soft flex items-center gap-2 print:hidden">
      {confirming ? (
        <>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลการยกเลิก..."
            className="flex-1 h-9 !text-sm"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={submitting}
            onClick={doCancel}
          >
            ยืนยันยกเลิกการจอง
          </Button>
        </>
      ) : (
        <>
          {!cancelled && !readonly && (
            <Button
              variant="danger"
              size="sm"
              iconLeft={<Trash2 size={12} />}
              onClick={() => setConfirming(true)}
            >
              ยกเลิกการจอง
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </>
      )}
    </div>
  );
}

type BookingStatusKey =
  | "pending"
  | "confirmed"
  | "in_use"
  | "completed"
  | "cancelled"
  | "no_show";
type PaymentStatusKey = "unpaid" | "deposit" | "paid" | "free";

const BOOKING_STATUS_OPTIONS: Array<{
  id: BookingStatusKey;
  label: string;
  tone: "muted" | "info" | "warning" | "success" | "danger";
}> = [
  { id: "pending", label: "รอยืนยัน", tone: "muted" },
  { id: "confirmed", label: "ยืนยันแล้ว", tone: "info" },
  { id: "in_use", label: "กำลังใช้", tone: "warning" },
  { id: "completed", label: "เสร็จสิ้น", tone: "success" },
  { id: "no_show", label: "ไม่มา", tone: "danger" },
];

const PAYMENT_STATUS_OPTIONS: Array<{
  id: PaymentStatusKey;
  label: string;
  tone: "danger" | "warning" | "success" | "muted";
}> = [
  { id: "unpaid", label: "ค้างจ่าย", tone: "danger" },
  { id: "deposit", label: "มัดจำ", tone: "warning" },
  { id: "paid", label: "จ่ายครบ", tone: "success" },
  { id: "free", label: "ฟรี", tone: "muted" },
];

function BookingStatusBar({
  bookingId,
  currentStatus,
  currentPayment,
  readonly,
  onChanged,
}: {
  bookingId: string;
  currentStatus: BookingStatusKey;
  currentPayment: PaymentStatusKey;
  readonly: boolean;
  onChanged: (patch: Record<string, unknown>) => void;
}) {
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function changeBooking(next: BookingStatusKey) {
    if (next === currentStatus || readonly || busy) return;
    setErr(null);
    startTransition(async () => {
      const r = await setBookingStatus({ bookingId, status: next });
      if (r.ok) onChanged({ booking_status: next });
      else setErr(`เปลี่ยนสถานะไม่สำเร็จ: ${r.error}`);
    });
  }

  function changePayment(next: PaymentStatusKey) {
    if (next === currentPayment || readonly || busy) return;
    setErr(null);
    startTransition(async () => {
      const r = await setPaymentStatus({ bookingId, status: next });
      if (r.ok) onChanged({ payment_status: next });
      else setErr(`เปลี่ยนสถานะไม่สำเร็จ: ${r.error}`);
    });
  }

  return (
    <div className="rounded-input border border-line-soft bg-surface-subtle/50 p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 font-semibold mb-2">
          สถานะการจอง
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BOOKING_STATUS_OPTIONS.map((opt) => {
            const active = opt.id === currentStatus;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={readonly || busy}
                onClick={() => changeBooking(opt.id)}
                className={cn(
                  "px-3 h-8 rounded-pill text-[11px] font-medium border transition",
                  active
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-line bg-white hover:bg-surface-subtle text-ink-2",
                  (readonly || busy) && "opacity-60 cursor-not-allowed",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 font-semibold mb-2">
          สถานะการชำระเงิน
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_STATUS_OPTIONS.map((opt) => {
            const active = opt.id === currentPayment;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={readonly || busy}
                onClick={() => changePayment(opt.id)}
                className={cn(
                  "px-3 h-8 rounded-pill text-[11px] font-medium border transition",
                  active
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-line bg-white hover:bg-surface-subtle text-ink-2",
                  (readonly || busy) && "opacity-60 cursor-not-allowed",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink-3 mt-2">
          เลือก &quot;จ่ายครบ&quot; จะปรับ paid_amount ให้เท่ายอดรวมโดยอัตโนมัติ
        </p>
      </div>
      {err && (
        <p className="text-[11px] text-red-600">{err}</p>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1">
        {label}
      </p>
      <p className="text-sm font-medium tracking-tight">{value}</p>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-input border px-3 py-2",
        tone === "success" && "bg-emerald-50 border-emerald-200",
        tone === "warning" && "bg-amber-50 border-amber-200",
        tone === "danger" && "bg-red-50 border-red-200",
        tone === "default" && "bg-surface-subtle/60 border-line-soft",
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
        {label}
      </p>
      <p
        className={cn(
          "font-semibold tabular-nums mt-0.5 text-sm",
          tone === "success" && "text-emerald-800",
          tone === "warning" && "text-amber-800",
          tone === "danger" && "text-red-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}

