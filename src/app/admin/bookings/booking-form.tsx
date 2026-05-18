"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import {
  Check,
  Save,
  Search,
  Sparkles,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatBaht } from "@/lib/format";
import {
  createBooking,
  checkBookingConflict,
  searchCustomers,
} from "@/lib/actions/bookings";
import type { Room, RoomPackage } from "@/lib/data/rooms";
import type { Addon } from "@/lib/data/addons";
import { format } from "date-fns";

interface Props {
  rooms: Array<Room & { packages: RoomPackage[] }>;
  addons: Addon[];
}

const morningSlots = [
  "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
];
const afternoonSlots = [
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
];
const eveningSlots = [
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
];

const customerTypes = [
  { id: "individual", label: "บุคคลธรรมดา" },
  { id: "company", label: "นิติบุคคล" },
  { id: "government", label: "ข้าราชการ" },
] as const;

const sources = [
  { id: "line", label: "LINE" },
  { id: "walk_in", label: "Walk-in" },
  { id: "referral_bni", label: "Referral (BNI)" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "email", label: "Email" },
  { id: "other", label: "อื่นๆ" },
] as const;

const paymentStatuses = [
  { id: "paid", label: "จ่ายแล้ว" },
  { id: "deposit", label: "มัดจำแล้ว" },
  { id: "unpaid", label: "ยังไม่มัดจำ" },
  { id: "free", label: "ฟรี" },
] as const;

type PaymentStatus = (typeof paymentStatuses)[number]["id"];
type Source = (typeof sources)[number]["id"];
type CType = (typeof customerTypes)[number]["id"];

const ALL_SLOTS_TIMES = [
  ...["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
  ...["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"],
  ...[
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
    "20:00", "20:30", "21:00", "21:30",
  ],
];

function computeStartsAtISO(slots: string[], dateStr: string) {
  if (slots.length === 0 || !dateStr) return "";
  const sorted = [...slots].sort(
    (a, b) => ALL_SLOTS_TIMES.indexOf(a) - ALL_SLOTS_TIMES.indexOf(b),
  );
  const [h, m] = sorted[0].split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function computeEndsAtISO(slots: string[], dateStr: string) {
  if (slots.length === 0 || !dateStr) return "";
  const sorted = [...slots].sort(
    (a, b) => ALL_SLOTS_TIMES.indexOf(a) - ALL_SLOTS_TIMES.indexOf(b),
  );
  const last = sorted[sorted.length - 1];
  const [h, m] = last.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setHours(h, m + 30, 0, 0);
  return d.toISOString();
}

export function BookingForm({ rooms, addons }: Props) {
  const allSlots = [...morningSlots, ...afternoonSlots, ...eveningSlots];
  const today = new Date().toISOString().slice(0, 10);

  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    type: "company" as CType,
    source: "line" as Source,
    sourceDetail: "",
  });
  const [date, setDate] = useState(today);
  const [attendees, setAttendees] = useState(4);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? "");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [depositAmount, setDepositAmount] = useState(0);
  const [freeReason, setFreeReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; reference: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  // Live conflict + customer suggestion state
  const [conflicts, setConflicts] = useState<
    Array<{
      id: string;
      reference_code: string;
      starts_at: string;
      ends_at: string;
      customer_name: string | null;
    }>
  >([]);
  const [conflictChecking, setConflictChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      display_name: string;
      phone: string | null;
      email: string | null;
      type: string;
      total_bookings: number;
      total_spent: number;
      tags: string[];
      similarity: number;
    }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const customerInputRef = useRef<HTMLDivElement>(null);

  const room = rooms.find((r) => r.id === selectedRoomId);

  const summary = useMemo(() => {
    if (selectedSlots.length === 0 || !room) {
      return {
        hours: 0,
        baseAmount: 0,
        addonsAmount: 0,
        packageId: undefined as string | undefined,
        packageName: undefined as string | undefined,
        savingsVsHourly: 0,
      };
    }
    const indices = selectedSlots
      .map((s) => allSlots.indexOf(s))
      .sort((a, b) => a - b);
    const hours = indices.length * 0.5;
    const hourlyTotal = hours * Number(room.hourly_rate);

    const matching = room.packages
      .filter((p) => Number(p.hours) <= hours)
      .sort((a, b) => Number(b.hours) - Number(a.hours))[0];

    const baseAmount = matching ? Number(matching.price) : hourlyTotal;
    const addonsAmount = selectedAddons.reduce((sum, id) => {
      const a = addons.find((x) => x.id === id);
      return sum + (a ? Number(a.price) : 0);
    }, 0);
    const savingsVsHourly = matching
      ? Math.max(0, hourlyTotal - Number(matching.price))
      : 0;

    return {
      hours,
      baseAmount,
      addonsAmount,
      packageId: matching?.id,
      packageName: matching?.name,
      savingsVsHourly,
    };
  }, [selectedSlots, room, selectedAddons, allSlots, addons]);

  const subtotal = summary.baseAmount + summary.addonsAmount;
  const total = Math.max(0, subtotal - discount);

  // Debounced live conflict check whenever room/date/slots change
  useEffect(() => {
    if (selectedSlots.length === 0 || !selectedRoomId || !date) {
      setConflicts([]);
      setConflictChecking(false);
      return;
    }
    const startsAt = computeStartsAtISO(selectedSlots, date);
    const endsAt = computeEndsAtISO(selectedSlots, date);
    if (!startsAt || !endsAt) return;
    setConflictChecking(true);
    const handle = setTimeout(async () => {
      try {
        const results = await checkBookingConflict({
          roomId: selectedRoomId,
          startsAt,
          endsAt,
        });
        setConflicts(results);
      } finally {
        setConflictChecking(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [selectedSlots, selectedRoomId, date]);

  // Debounced customer suggestion lookup
  useEffect(() => {
    const q = customer.name.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchCustomers(q);
      setSuggestions(results);
    }, 250);
    return () => clearTimeout(handle);
  }, [customer.name]);

  // Click-outside to close suggestions
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        customerInputRef.current &&
        !customerInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function applyCustomerSuggestion(s: (typeof suggestions)[number]) {
    setCustomer((c) => ({
      ...c,
      name: s.display_name,
      phone: s.phone ?? c.phone,
      email: s.email ?? c.email,
      type: (s.type as CType) ?? c.type,
    }));
    setShowSuggestions(false);
    setSuggestions([]);
  }

  function toggleSlot(slot: string) {
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot);
      if (prev.length === 0) return [slot];
      const indices = prev.map((s) => allSlots.indexOf(s));
      const newIdx = allSlots.indexOf(slot);
      const min = Math.min(...indices, newIdx);
      const max = Math.max(...indices, newIdx);
      return allSlots.slice(min, max + 1);
    });
  }

  function startsAtISO() {
    return computeStartsAtISO(selectedSlots, date);
  }

  function endsAtISO() {
    return computeEndsAtISO(selectedSlots, date);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (!customer.name.trim()) {
      setFeedback({ kind: "error", message: "กรุณาใส่ชื่อลูกค้า" });
      return;
    }
    if (!selectedRoomId) {
      setFeedback({ kind: "error", message: "กรุณาเลือกห้อง" });
      return;
    }
    if (selectedSlots.length === 0) {
      setFeedback({ kind: "error", message: "กรุณาเลือกช่วงเวลา" });
      return;
    }
    if (paymentStatus === "free" && !freeReason.trim()) {
      setFeedback({
        kind: "error",
        message: "กรณีฟรี ต้องระบุเหตุผล",
      });
      return;
    }
    if (discount > subtotal) {
      setFeedback({
        kind: "error",
        message: "ส่วนลดมากกว่ายอดรวม",
      });
      return;
    }
    if (conflicts.length > 0) {
      setFeedback({
        kind: "error",
        message: `เวลานี้ทับซ้อนกับการจอง ${conflicts
          .map((c) => c.reference_code)
          .join(", ")} — กรุณาเลือกเวลาอื่น`,
      });
      return;
    }

    startTransition(async () => {
      const result = await createBooking({
        customer: {
          name: customer.name.trim(),
          phone: customer.phone || undefined,
          email: customer.email || undefined,
          type: customer.type,
          source: customer.source,
          sourceDetail: customer.sourceDetail || undefined,
        },
        booking: {
          roomId: selectedRoomId,
          startsAt: startsAtISO(),
          endsAt: endsAtISO(),
          attendees,
          packageId: summary.packageId,
          addonIds: selectedAddons,
          baseAmount: summary.baseAmount,
          addonsAmount: summary.addonsAmount,
          discountAmount: discount,
          discountNote: discountNote || undefined,
          totalAmount: paymentStatus === "free" ? 0 : total,
          depositAmount,
          paymentStatus,
          freeReason: paymentStatus === "free" ? freeReason : undefined,
          notes: notes || undefined,
        },
      });

      if (!result.ok) {
        setFeedback({
          kind: "error",
          message:
            result.error === "time_conflict"
              ? "เวลานี้มีการจองอื่นอยู่แล้ว"
              : result.error === "free_reason_required"
                ? "กรุณากรอกเหตุผลฟรี"
                : `บันทึกไม่สำเร็จ: ${result.error}`,
        });
        return;
      }

      setFeedback({ kind: "success", reference: result.reference });

      // Reset form for next entry
      setSelectedSlots([]);
      setSelectedAddons([]);
      setDiscount(0);
      setDiscountNote("");
      setNotes("");
      setFreeReason("");
      setDepositAmount(0);
      setPaymentStatus("unpaid");
      setCustomer((c) => ({ ...c, name: "", phone: "", email: "", sourceDetail: "" }));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* LEFT */}
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลผู้จอง</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div ref={customerInputRef} className="relative">
              <Label>ชื่อบริษัท / ผู้จอง *</Label>
              <Input
                value={customer.name}
                onChange={(e) => {
                  setCustomer((c) => ({ ...c, name: e.target.value }));
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="พิมพ์ชื่อ..."
                iconLeft={<Search size={16} />}
                required
                autoComplete="off"
              />
              <p className="text-[11px] text-ink-3 mt-1.5 flex items-center gap-1">
                <Sparkles size={11} strokeWidth={2} className="text-primary-500" />
                ระบบเช็คลูกค้าเก่าด้วย pg_trgm + เบอร์/email อัตโนมัติ
              </p>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-[88px] z-30 bg-white border border-line rounded-input shadow-pop max-h-64 overflow-y-auto">
                  <p className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 border-b border-line-soft">
                    ลูกค้าที่ตรงกัน ({suggestions.length})
                  </p>
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applyCustomerSuggestion(s)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-primary-50/50 text-left border-b border-line-soft last:border-0 transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-semibold text-xs shrink-0">
                        {s.display_name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium tracking-tight truncate">
                          {s.display_name}
                        </p>
                        <p className="text-[11px] text-ink-3 truncate">
                          {[s.phone, s.email].filter(Boolean).join(" · ") ||
                            "—"}
                        </p>
                        <p className="text-[10px] text-ink-3 mt-0.5 tabular-nums">
                          จองแล้ว {s.total_bookings} ครั้ง ·{" "}
                          {formatBaht(Number(s.total_spent))}
                        </p>
                      </div>
                      {s.tags.length > 0 && (
                        <Badge tone="primary" className="!text-[10px] shrink-0">
                          {s.tags[0]}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>เบอร์โทร</Label>
                <Input
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, phone: e.target.value }))
                  }
                  placeholder="08x-xxx-xxxx"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, email: e.target.value }))
                  }
                  placeholder="contact@..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ประเภท</Label>
                <Select
                  value={customer.type}
                  onChange={(e) =>
                    setCustomer((c) => ({
                      ...c,
                      type: e.target.value as CType,
                    }))
                  }
                >
                  {customerTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>ที่มา</Label>
                <Select
                  value={customer.source}
                  onChange={(e) =>
                    setCustomer((c) => ({
                      ...c,
                      source: e.target.value as Source,
                    }))
                  }
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>รายละเอียดที่มา (เช่น ชื่อ chapter BNI)</Label>
              <Input
                value={customer.sourceDetail}
                onChange={(e) =>
                  setCustomer((c) => ({ ...c, sourceDetail: e.target.value }))
                }
                placeholder="ออปชั่น"
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลการจอง</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <Label>เลือกห้อง</Label>
              <div className="grid grid-cols-1 gap-2">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoomId(r.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-input border text-left transition",
                      selectedRoomId === r.id
                        ? "border-primary-600 bg-primary-50/40 ring-4 ring-primary-50"
                        : "border-line bg-white hover:border-primary-200",
                    )}
                  >
                    <span
                      className="w-1 h-9 rounded-full"
                      style={{ background: r.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm tracking-tight">
                        {r.name}
                      </p>
                      <p className="text-xs text-ink-3">
                        {r.capacity_min}–{r.capacity_max} ท่าน ·{" "}
                        {formatBaht(Number(r.hourly_rate))}/ชม.
                      </p>
                    </div>
                    {selectedRoomId === r.id && (
                      <Check size={16} className="text-primary-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันที่</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Label>จำนวนผู้เข้าประชุม</Label>
                <Input
                  type="number"
                  min={1}
                  value={attendees}
                  onChange={(e) => setAttendees(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>เลือกช่วงเวลา</Label>
              <SlotPicker
                title="รอบเช้า"
                slots={morningSlots}
                selected={selectedSlots}
                onToggle={toggleSlot}
              />
              <SlotPicker
                title="รอบบ่าย"
                slots={afternoonSlots}
                selected={selectedSlots}
                onToggle={toggleSlot}
              />
              <SlotPicker
                title="รอบพิเศษ (17:00–22:00)"
                slots={eveningSlots}
                selected={selectedSlots}
                onToggle={toggleSlot}
              />

              {selectedSlots.length > 0 && (
                <div className="mt-3">
                  {conflictChecking ? (
                    <div className="flex items-center gap-2 text-xs text-ink-3 px-3 py-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" />
                      กำลังตรวจเวลาว่าง...
                    </div>
                  ) : conflicts.length > 0 ? (
                    <div className="rounded-input bg-red-50 border border-red-200 px-3 py-3">
                      <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 tracking-tight">
                        <AlertTriangle size={13} />
                        เวลานี้ทับซ้อนกับการจอง {conflicts.length} รายการ
                      </p>
                      <ul className="mt-2 space-y-1">
                        {conflicts.map((c) => (
                          <li
                            key={c.id}
                            className="text-[11px] text-red-700 tabular-nums flex items-center gap-2"
                          >
                            <code className="font-mono font-bold">
                              {c.reference_code}
                            </code>
                            <span>
                              {format(new Date(c.starts_at), "HH:mm")} –{" "}
                              {format(new Date(c.ends_at), "HH:mm")}
                            </span>
                            {c.customer_name && (
                              <span className="text-red-600 truncate">
                                · {c.customer_name}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-input bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5 tracking-tight">
                      <Check size={13} />
                      เวลานี้ว่าง — พร้อมบันทึก
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การเงิน & บริการเสริม</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <Label>สถานะการชำระเงิน</Label>
              <div className="grid grid-cols-4 gap-2">
                {paymentStatuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPaymentStatus(s.id)}
                    className={cn(
                      "py-2.5 rounded-input text-xs font-medium border transition",
                      paymentStatus === s.id
                        ? "border-primary-600 bg-primary-50 text-primary-700"
                        : "border-line bg-white text-ink-2 hover:border-primary-200",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentStatus === "deposit" && (
              <div>
                <Label>จำนวนมัดจำ (บาท)</Label>
                <Input
                  type="number"
                  min={0}
                  value={depositAmount || ""}
                  onChange={(e) =>
                    setDepositAmount(Number(e.target.value) || 0)
                  }
                  placeholder="0"
                />
              </div>
            )}

            {paymentStatus === "free" && (
              <div>
                <Label>เหตุผลฟรี *</Label>
                <Input
                  value={freeReason}
                  onChange={(e) => setFreeReason(e.target.value)}
                  placeholder="เช่น Demo เปิดตัว / VIP / Internal"
                  required
                />
              </div>
            )}

            <div>
              <Label>บริการเสริม (Add-on)</Label>
              <div className="space-y-2">
                {addons.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-3 p-3 rounded-input border border-line hover:border-primary-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAddons.includes(a.id)}
                      onChange={(e) =>
                        setSelectedAddons((prev) =>
                          e.target.checked
                            ? [...prev, a.id]
                            : prev.filter((x) => x !== a.id),
                        )
                      }
                      className="w-4 h-4 accent-primary-600"
                    />
                    <span className="flex-1 text-sm">{a.name}</span>
                    <span className="text-sm font-medium tabular-nums text-ink-2">
                      {formatBaht(Number(a.price))}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ส่วนลด (บาท)</Label>
                <Input
                  type="number"
                  min={0}
                  value={discount || ""}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>หมายเหตุส่วนลด</Label>
                <Input
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  placeholder="เช่น ลูกค้า VIP"
                />
              </div>
            </div>

            <div>
              <Label>หมายเหตุ</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ต้องการ HDMI adapter / ติดตั้งก่อน 30 นาที..."
              />
            </div>
          </div>
        </Card>
      </div>

      {/* RIGHT — Summary */}
      <div className="lg:col-span-3 space-y-5">
        <Card className="!p-0 overflow-hidden sticky top-24">
          <div className="p-6 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold tracking-tight">สรุปค่าบริการ</h3>
              <Badge tone="primary">Real-time</Badge>
            </div>
            <p className="text-xs text-ink-3">
              ส่งเข้า Telegram &quot;จองห้องประชุมเเล้ว&quot; ทันทีเมื่อบันทึก
            </p>
          </div>

          {feedback && (
            <div
              className={cn(
                "p-4 border-b text-sm flex items-start gap-2",
                feedback.kind === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200",
              )}
            >
              {feedback.kind === "success" ? (
                <>
                  <Check size={16} className="mt-0.5 shrink-0" />
                  <span>
                    บันทึกสำเร็จ — รหัส{" "}
                    <code className="font-mono font-bold">
                      {feedback.reference}
                    </code>{" "}
                    · ตรวจ Telegram ได้เลย
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{feedback.message}</span>
                </>
              )}
            </div>
          )}

          <div className="p-6 space-y-3 text-sm">
            <SummaryRow label="ห้อง" value={room?.name ?? "—"} />
            <SummaryRow label="วันที่" value={date} />
            <SummaryRow
              label="ช่วงเวลา"
              value={
                selectedSlots.length > 0
                  ? `${selectedSlots[0]} – ${
                      (() => {
                        const last = selectedSlots[selectedSlots.length - 1];
                        const [h, m] = last.split(":").map(Number);
                        const next = m === 30 ? `${h + 1}:00` : `${h}:30`;
                        return next.padStart(5, "0");
                      })()
                    }`
                  : "—"
              }
            />
            <SummaryRow label="จำนวนชั่วโมง" value={`${summary.hours} ชม.`} />
            <SummaryRow
              label={summary.packageName ? `แพ็กเกจ ${summary.packageName}` : "ราคาห้อง"}
              value={formatBaht(summary.baseAmount)}
            />
            {summary.savingsVsHourly > 0 && (
              <div className="rounded-input bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
                <Sparkles size={14} strokeWidth={2} />
                ใช้แพ็กเกจคุ้มกว่ารายชั่วโมง — ประหยัด{" "}
                {formatBaht(summary.savingsVsHourly)}
              </div>
            )}
            {summary.addonsAmount > 0 && (
              <SummaryRow
                label="บริการเสริม"
                value={formatBaht(summary.addonsAmount)}
              />
            )}
            {discount > 0 && (
              <SummaryRow
                label="ส่วนลด"
                value={`-${formatBaht(discount)}`}
                tone="danger"
              />
            )}
            <div className="h-px bg-line-soft my-3" />
            <div className="flex items-center justify-between text-base font-bold">
              <span>ยอดรวมสุทธิ</span>
              <span className="text-primary-600 text-xl tabular-nums">
                {paymentStatus === "free" ? "ฟรี" : formatBaht(total)}
              </span>
            </div>
          </div>

          <div className="px-6 py-4 bg-surface-subtle border-t border-line-soft flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={pending}
            >
              Save Draft
            </Button>
            <Button
              type="submit"
              variant="gradient"
              className="flex-1"
              iconLeft={<Save size={16} />}
              disabled={pending || conflicts.length > 0}
            >
              {pending
                ? "กำลังบันทึก..."
                : conflicts.length > 0
                  ? "เวลาทับซ้อน"
                  : "บันทึกการจอง"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}

function SlotPicker({
  title,
  slots,
  selected,
  onToggle,
}: {
  title: string;
  slots: string[];
  selected: string[];
  onToggle: (slot: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em] mb-2">
        {title}
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {slots.map((slot) => {
          const isSelected = selected.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onToggle(slot)}
              className={cn(
                "h-9 rounded-input text-xs font-medium tabular-nums transition border",
                isSelected
                  ? "bg-primary-600 text-white border-primary-600 shadow-card"
                  : "bg-white border-line text-ink-2 hover:border-primary-300",
              )}
            >
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-3">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          tone === "danger" ? "text-red-600" : "text-ink-1",
        )}
      >
        {value}
      </span>
    </div>
  );
}
