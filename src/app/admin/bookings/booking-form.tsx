"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import {
  Check,
  Save,
  Search,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Users,
  Calendar as CalendarIcon,
  X,
  Tag,
  Wifi,
  Mic,
  Coffee,
  Tv,
  Wind,
  Building2,
  ImageOff,
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
  listDayBookings,
} from "@/lib/actions/bookings";
import type { Room, RoomPackage } from "@/lib/data/rooms";
import type { Addon } from "@/lib/data/addons";
import { format } from "date-fns";

type Promo = {
  id: string;
  name: string;
  code: string | null;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  min_order: number | null;
  applicable_room_ids: string[];
  ends_at: string | null;
};

interface Props {
  rooms: Array<Room & { packages: RoomPackage[] }>;
  addons: Addon[];
  promotions: Promo[];
}

// Continuous 30-min slots from 07:00 to 21:30 (last slot ends 22:00)
const TIME_SLOTS = Array.from({ length: 30 }, (_, i) => {
  const h = 7 + Math.floor((i * 30) / 60);
  const m = (i * 30) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

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

const ALL_SLOTS = TIME_SLOTS;

const DRAFT_KEY = "easyspace.booking-draft.v1";

function slotToMinutes(slot: string) {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

function computeStartsAtISO(slots: string[], dateStr: string) {
  if (slots.length === 0 || !dateStr) return "";
  const sorted = [...slots].sort(
    (a, b) => ALL_SLOTS.indexOf(a) - ALL_SLOTS.indexOf(b),
  );
  const [h, m] = sorted[0].split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function computeEndsAtISO(slots: string[], dateStr: string) {
  if (slots.length === 0 || !dateStr) return "";
  const sorted = [...slots].sort(
    (a, b) => ALL_SLOTS.indexOf(a) - ALL_SLOTS.indexOf(b),
  );
  const last = sorted[sorted.length - 1];
  const [h, m] = last.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setHours(h, m + 30, 0, 0);
  return d.toISOString();
}

function endSlotLabel(lastSlot: string | undefined) {
  if (!lastSlot) return "";
  const [h, m] = lastSlot.split(":").map(Number);
  const total = h * 60 + m + 30;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function endOfSlot(slot: string) {
  return endSlotLabel(slot);
}

function computePromoDiscount(
  promo: Promo | undefined,
  subtotal: number,
  roomId: string,
) {
  if (!promo) return 0;
  if (
    promo.applicable_room_ids.length > 0 &&
    !promo.applicable_room_ids.includes(roomId)
  ) {
    return 0;
  }
  if (promo.min_order && subtotal < Number(promo.min_order)) return 0;

  let raw = 0;
  if (promo.discount_type === "percentage") {
    raw = subtotal * (Number(promo.discount_value) / 100);
  } else if (promo.discount_type === "fixed" || promo.discount_type === "voucher") {
    raw = Number(promo.discount_value);
  } else {
    raw = Number(promo.discount_value);
  }
  if (promo.max_discount && raw > Number(promo.max_discount)) {
    raw = Number(promo.max_discount);
  }
  return Math.max(0, Math.min(raw, subtotal));
}

function amenityIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("wifi") || n.includes("net")) return <Wifi size={12} />;
  if (n.includes("mic") || n.includes("ไมค์")) return <Mic size={12} />;
  if (n.includes("tv") || n.includes("จอ") || n.includes("hdmi"))
    return <Tv size={12} />;
  if (n.includes("กาแฟ") || n.includes("coffee") || n.includes("น้ำ"))
    return <Coffee size={12} />;
  if (n.includes("แอร์") || n.includes("air")) return <Wind size={12} />;
  return <Check size={12} />;
}

export function BookingForm({ rooms, addons, promotions }: Props) {
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
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState("");
  const [promotionId, setPromotionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [depositAmount, setDepositAmount] = useState(0);
  const [paidAmountInput, setPaidAmountInput] = useState(0);
  const [freeReason, setFreeReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; reference: string }
    | { kind: "error"; message: string }
    | { kind: "info"; message: string }
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
  const [dayBookings, setDayBookings] = useState<
    Array<{
      id: string;
      reference_code: string;
      starts_at: string;
      ends_at: string;
      booking_status: string;
      source: string;
      customer_name: string | null;
      member_name: string | null;
      org_name: string | null;
    }>
  >([]);

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

  // Fuzzy-match modal (similarity 0.70–0.85)
  const [fuzzyMatch, setFuzzyMatch] = useState<
    | (typeof suggestions)[number]
    | null
  >(null);
  const fuzzyDismissedRef = useRef<Set<string>>(new Set());

  // Draft auto-save status
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "restored"
  >("idle");

  const room = rooms.find((r) => r.id === selectedRoomId);

  // ---------- Booked-slot map ----------
  const bookedSlotSet = useMemo(() => {
    const set = new Set<string>();
    for (const b of dayBookings) {
      const start = new Date(b.starts_at);
      const end = new Date(b.ends_at);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      for (const slot of ALL_SLOTS) {
        const m = slotToMinutes(slot);
        if (m >= startMin && m < endMin) set.add(slot);
      }
    }
    return set;
  }, [dayBookings]);

  // ---------- Cost summary + smart package ----------
  const summary = useMemo(() => {
    if (selectedSlots.length === 0 || !room) {
      return {
        hours: 0,
        baseAmount: 0,
        addonsAmount: 0,
        packageId: undefined as string | undefined,
        packageName: undefined as string | undefined,
        savingsVsHourly: 0,
        nextPackage: undefined as
          | { id: string; name: string; price: number; hours: number; extraHours: number; saveBaht: number }
          | undefined,
      };
    }
    const indices = selectedSlots
      .map((s) => ALL_SLOTS.indexOf(s))
      .sort((a, b) => a - b);
    const hours = indices.length * 0.5;
    const hourlyTotal = hours * Number(room.hourly_rate);

    const sortedPkg = [...room.packages].sort(
      (a, b) => Number(a.hours) - Number(b.hours),
    );
    const matching = [...sortedPkg]
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

    // Smart "next package" recommendation
    const next = sortedPkg.find((p) => Number(p.hours) > hours);
    let nextPackage:
      | { id: string; name: string; price: number; hours: number; extraHours: number; saveBaht: number }
      | undefined;
    if (next) {
      // What if user extended to this package's hours, same hourly cost?
      const extendedHourly = Number(next.hours) * Number(room.hourly_rate);
      const saveBaht = Math.max(0, extendedHourly - Number(next.price));
      if (saveBaht > 0) {
        nextPackage = {
          id: next.id,
          name: next.name,
          price: Number(next.price),
          hours: Number(next.hours),
          extraHours: Number(next.hours) - hours,
          saveBaht,
        };
      }
    }

    return {
      hours,
      baseAmount,
      addonsAmount,
      packageId: matching?.id,
      packageName: matching?.name,
      savingsVsHourly,
      nextPackage,
    };
  }, [selectedSlots, room, selectedAddons, addons]);

  const subtotal = summary.baseAmount + summary.addonsAmount;

  // Active promo computed discount (auto)
  const activePromo = promotions.find((p) => p.id === promotionId);
  const promoDiscount = useMemo(
    () => computePromoDiscount(activePromo, subtotal, selectedRoomId),
    [activePromo, subtotal, selectedRoomId],
  );

  // When promo changes, override the discount input
  useEffect(() => {
    if (!activePromo) return;
    setDiscount(promoDiscount);
    setDiscountNote(
      activePromo
        ? `โปรโมชั่น: ${activePromo.name}${activePromo.code ? ` (${activePromo.code})` : ""}`
        : "",
    );
  }, [activePromo, promoDiscount]);

  const total = Math.max(0, subtotal - discount);
  const discountExceeds = discount > 0 && subtotal > 0 && discount > subtotal;

  // Deposit/paid derived values
  const effectivePaid =
    paymentStatus === "paid"
      ? paidAmountInput > 0
        ? paidAmountInput
        : total
      : paymentStatus === "deposit"
        ? depositAmount
        : 0;
  const remaining = Math.max(0, total - effectivePaid);

  // ---------- Live conflict check ----------
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

  // ---------- Load day bookings whenever room/date changes ----------
  useEffect(() => {
    if (!selectedRoomId || !date) {
      setDayBookings([]);
      return;
    }
    let cancelled = false;
    listDayBookings({ roomId: selectedRoomId, date }).then((res) => {
      if (!cancelled) setDayBookings(res);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId, date]);

  // ---------- Customer suggestion lookup ----------
  useEffect(() => {
    const q = customer.name.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchCustomers(q);
      setSuggestions(results);

      // Fuzzy-match: if user typed at least 3 chars and the top match falls
      // in the AI-confirm window 0.70–0.85, surface the popup once.
      const top = results[0];
      if (
        top &&
        top.similarity >= 0.7 &&
        top.similarity < 0.85 &&
        top.display_name.toLowerCase() !== q.toLowerCase() &&
        !fuzzyDismissedRef.current.has(top.id)
      ) {
        setFuzzyMatch(top);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [customer.name]);

  // ---------- Click-outside ----------
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
    setFuzzyMatch(null);
  }

  // ---------- Auto-save draft every 30s + on unmount ----------
  const stateForDraft = useMemo(
    () => ({
      customer,
      date,
      attendees,
      selectedRoomId,
      selectedSlots,
      selectedAddons,
      discount,
      discountNote,
      promotionId,
      notes,
      paymentStatus,
      depositAmount,
      paidAmountInput,
      freeReason,
    }),
    [
      customer,
      date,
      attendees,
      selectedRoomId,
      selectedSlots,
      selectedAddons,
      discount,
      discountNote,
      promotionId,
      notes,
      paymentStatus,
      depositAmount,
      paidAmountInput,
      freeReason,
    ],
  );

  function persistDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...stateForDraft, _ts: Date.now() }),
      );
      setDraftStatus("saved");
      setTimeout(() => setDraftStatus("idle"), 2200);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const handle = setInterval(() => {
      if (selectedSlots.length > 0 || customer.name) persistDraft();
    }, 30_000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateForDraft]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.customer) setCustomer(parsed.customer);
      if (parsed.date) setDate(parsed.date);
      if (typeof parsed.attendees === "number") setAttendees(parsed.attendees);
      if (parsed.selectedRoomId) setSelectedRoomId(parsed.selectedRoomId);
      if (Array.isArray(parsed.selectedSlots))
        setSelectedSlots(parsed.selectedSlots);
      if (Array.isArray(parsed.selectedAddons))
        setSelectedAddons(parsed.selectedAddons);
      if (typeof parsed.discount === "number") setDiscount(parsed.discount);
      if (typeof parsed.discountNote === "string")
        setDiscountNote(parsed.discountNote);
      if (typeof parsed.promotionId === "string")
        setPromotionId(parsed.promotionId);
      if (typeof parsed.notes === "string") setNotes(parsed.notes);
      if (typeof parsed.paymentStatus === "string")
        setPaymentStatus(parsed.paymentStatus);
      if (typeof parsed.depositAmount === "number")
        setDepositAmount(parsed.depositAmount);
      if (typeof parsed.paidAmountInput === "number")
        setPaidAmountInput(parsed.paidAmountInput);
      if (typeof parsed.freeReason === "string")
        setFreeReason(parsed.freeReason);
      setDraftStatus("restored");
      setTimeout(() => setDraftStatus("idle"), 4000);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  // ---------- Slot interactions ----------
  function toggleSlot(slot: string) {
    if (bookedSlotSet.has(slot)) return;
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot);
      if (prev.length === 0) return [slot];
      const indices = prev.map((s) => ALL_SLOTS.indexOf(s));
      const newIdx = ALL_SLOTS.indexOf(slot);
      const min = Math.min(...indices, newIdx);
      const max = Math.max(...indices, newIdx);
      // Skip any booked slot in the range — if booked is in between, refuse.
      const range = ALL_SLOTS.slice(min, max + 1);
      if (range.some((s) => bookedSlotSet.has(s) && !prev.includes(s)))
        return prev;
      return range;
    });
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
      setFeedback({ kind: "error", message: "กรณีฟรี ต้องระบุเหตุผล" });
      return;
    }
    if (discountExceeds) {
      setFeedback({ kind: "error", message: "ส่วนลดมากกว่ายอดรวม" });
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
          startsAt: computeStartsAtISO(selectedSlots, date),
          endsAt: computeEndsAtISO(selectedSlots, date),
          attendees,
          packageId: summary.packageId,
          addonIds: selectedAddons,
          baseAmount: summary.baseAmount,
          addonsAmount: summary.addonsAmount,
          discountAmount: discount,
          discountNote: discountNote || undefined,
          promotionId: promotionId || undefined,
          totalAmount: paymentStatus === "free" ? 0 : total,
          depositAmount:
            paymentStatus === "deposit" ? depositAmount : effectivePaid,
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
                : result.error === "discount_exceeds_subtotal"
                  ? "ส่วนลดมากกว่ายอดรวม"
                  : `บันทึกไม่สำเร็จ: ${result.error}`,
        });
        return;
      }

      setFeedback({ kind: "success", reference: result.reference });
      clearDraft();

      setSelectedSlots([]);
      setSelectedAddons([]);
      setDiscount(0);
      setDiscountNote("");
      setPromotionId("");
      setNotes("");
      setFreeReason("");
      setDepositAmount(0);
      setPaidAmountInput(0);
      setPaymentStatus("unpaid");
      setCustomer((c) => ({
        ...c,
        name: "",
        phone: "",
        email: "",
        sourceDetail: "",
      }));
    });
  }

  return (
    <>
      {/* AI Fuzzy match popup */}
      {fuzzyMatch && (
        <FuzzyMatchModal
          match={fuzzyMatch}
          inputName={customer.name}
          onUseExisting={() => applyCustomerSuggestion(fuzzyMatch)}
          onCreateNew={() => {
            fuzzyDismissedRef.current.add(fuzzyMatch.id);
            setFuzzyMatch(null);
          }}
          onClose={() => setFuzzyMatch(null)}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 xl:grid-cols-12 gap-5"
      >
        {/* LEFT 40% — form */}
        <div className="xl:col-span-5 space-y-5">
          {/* CUSTOMER */}
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
                  <Sparkles
                    size={11}
                    strokeWidth={2}
                    className="text-primary-500"
                  />
                  AI ช่วยจับลูกค้าเก่า (pg_trgm + เบอร์/อีเมล) — confirm
                  อัตโนมัติเมื่อ similarity 0.70–0.85
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
                            {formatBaht(Number(s.total_spent))} · sim{" "}
                            {(s.similarity * 100).toFixed(0)}%
                          </p>
                        </div>
                        {s.tags.length > 0 && (
                          <Badge
                            tone="primary"
                            className="!text-[10px] shrink-0"
                          >
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
              <div>
                <Label>จำนวนผู้เข้าประชุม</Label>
                <Input
                  type="number"
                  min={1}
                  value={attendees}
                  onChange={(e) => setAttendees(Number(e.target.value))}
                  iconLeft={<Users size={16} />}
                />
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
                    setCustomer((c) => ({
                      ...c,
                      sourceDetail: e.target.value,
                    }))
                  }
                  placeholder="ออปชั่น"
                />
              </div>
            </div>
          </Card>

          {/* ROOM CARDS */}
          <Card>
            <CardHeader>
              <CardTitle>เลือกห้อง</CardTitle>
              <span className="text-xs text-ink-3">
                {rooms.length} ห้อง
              </span>
            </CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.map((r) => (
                <RoomCard
                  key={r.id}
                  room={r}
                  selected={selectedRoomId === r.id}
                  onClick={() => setSelectedRoomId(r.id)}
                />
              ))}
            </div>

            {/* Room detail panel */}
            {room && (
              <div className="mt-4 rounded-input border border-line-soft bg-surface-subtle/40 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className="w-1 h-10 rounded-full"
                    style={{ background: room.color }}
                  />
                  <div className="flex-1">
                    <p className="font-semibold tracking-tight">
                      {room.name}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {room.capacity_min}–{room.capacity_max} ท่าน ·{" "}
                      {formatBaht(Number(room.hourly_rate))}/ชม.
                      {room.floor && ` · ชั้น ${room.floor}`}
                    </p>
                  </div>
                </div>

                {room.amenities.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1.5">
                      สิ่งอำนวยความสะดวก
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {room.amenities.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-white border border-line text-[11px] text-ink-2"
                        >
                          {amenityIcon(a)}
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {room.perks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1.5">
                      สิทธิ์ฟรี
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {room.perks.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700"
                        >
                          <Check size={11} />
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {room.packages.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1.5">
                      แพ็กเกจ
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {room.packages.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-input bg-white border border-line px-2.5 py-2 text-[11px] flex items-center justify-between"
                        >
                          <span className="text-ink-2">
                            {p.name} · {p.hours} ชม.
                          </span>
                          <span className="font-semibold tabular-nums text-primary-700">
                            {formatBaht(Number(p.price))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>


          {/* FINANCE */}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>มัดจำ (บาท)</Label>
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
                  <div>
                    <Label>คงเหลือ</Label>
                    <div className="h-11 rounded-input bg-surface-subtle border border-line flex items-center px-4 text-sm tabular-nums text-ink-2">
                      {formatBaht(remaining)}
                    </div>
                  </div>
                </div>
              )}

              {paymentStatus === "paid" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>จำนวนที่ชำระ (บาท)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={paidAmountInput || ""}
                      onChange={(e) =>
                        setPaidAmountInput(Number(e.target.value) || 0)
                      }
                      placeholder={`${total}`}
                    />
                  </div>
                  <div>
                    <Label>หมายเหตุ</Label>
                    <div className="h-11 rounded-input bg-emerald-50 border border-emerald-200 flex items-center px-4 text-xs text-emerald-700">
                      หาก 0 ระบบใช้ยอดสุทธิอัตโนมัติ
                    </div>
                  </div>
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

              {/* Promotion picker */}
              <div>
                <Label>
                  <span className="inline-flex items-center gap-1">
                    <Tag size={11} /> โปรโมชั่น (อัตโนมัติจากหน้าโปรโมชั่น)
                  </span>
                </Label>
                <Select
                  value={promotionId}
                  onChange={(e) => {
                    setPromotionId(e.target.value);
                    if (!e.target.value) {
                      setDiscount(0);
                      setDiscountNote("");
                    }
                  }}
                >
                  <option value="">— ไม่ใช้โปรโมชั่น —</option>
                  {promotions
                    .filter(
                      (p) =>
                        p.applicable_room_ids.length === 0 ||
                        p.applicable_room_ids.includes(selectedRoomId),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.code ? ` · ${p.code}` : ""} ·{" "}
                        {p.discount_type === "percentage"
                          ? `${p.discount_value}%`
                          : `${formatBaht(Number(p.discount_value))}`}
                      </option>
                    ))}
                </Select>
                {activePromo && (
                  <p className="text-[11px] text-emerald-700 mt-1.5 flex items-center gap-1">
                    <Sparkles size={11} />
                    หักลบอัตโนมัติ {formatBaht(promoDiscount)} จากยอดรวม
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ส่วนลด (บาท)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={discount || ""}
                    onChange={(e) => {
                      setDiscount(Number(e.target.value) || 0);
                      if (activePromo) setPromotionId(""); // overrode auto promo
                    }}
                    placeholder="0"
                    className={cn(
                      discountExceeds &&
                        "!border-red-400 !ring-4 !ring-red-50",
                    )}
                  />
                  {discountExceeds && (
                    <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} /> ส่วนลดมากกว่ายอดรวม
                    </p>
                  )}
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

        {/* RIGHT 60% — calendar + summary */}
        <div className="xl:col-span-7 space-y-5">
          {/* Calendar with slot picker */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <CalendarIcon size={16} className="text-primary-600" />
                    ปฏิทิน {format(new Date(`${date}T00:00:00+07:00`), "d MMM yyyy")}
                  </span>
                </CardTitle>
                <span className="text-[11px] text-ink-3">
                  {room?.name ?? "—"} · slot ละ 30 นาที
                </span>
              </div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="!h-9 !w-44"
              />
            </CardHeader>

            <SlotLegend />

            <div className="mt-4">
              <SlotPicker
                title="ช่วงเวลา 07:00 – 22:00"
                slots={TIME_SLOTS}
                selected={selectedSlots}
                bookedSet={bookedSlotSet}
                hover={hoverSlot}
                onHover={setHoverSlot}
                onToggle={toggleSlot}
                dayBookings={dayBookings}
              />
            </div>

            {/* Day's bookings list — includes completed ones too */}
            {dayBookings.length > 0 && (
              <div className="mt-5 pt-4 border-t border-line-soft">
                <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3 mb-2">
                  การจองในวันนี้ ({dayBookings.length})
                </p>
                <div className="space-y-1.5">
                  {dayBookings.map((b) => {
                    const isPast = new Date(b.ends_at).getTime() < Date.now();
                    const isCompleted = b.booking_status === "completed";
                    const isInternal = b.source === "internal";
                    const name =
                      b.customer_name ??
                      b.member_name ??
                      (isInternal ? "สมาชิกองค์กร" : "—");
                    return (
                      <div
                        key={b.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-input border text-xs",
                          isCompleted || (isPast && b.booking_status !== "in_use")
                            ? "bg-surface-subtle/30 border-line-soft opacity-70"
                            : "bg-surface-subtle/60 border-line-soft",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            b.booking_status === "in_use"
                              ? "bg-amber-500"
                              : b.booking_status === "completed"
                                ? "bg-emerald-500"
                                : "bg-slate-400",
                          )}
                        />
                        <code className="font-mono font-semibold text-ink-2">
                          {b.reference_code}
                        </code>
                        <span className="tabular-nums text-ink-2">
                          {format(new Date(b.starts_at), "HH:mm")}–
                          {format(new Date(b.ends_at), "HH:mm")}
                        </span>
                        <span className="text-ink-2 truncate flex-1">
                          {name}
                          {b.org_name && (
                            <span className="text-primary-700 ml-1.5 font-medium">
                              · {b.org_name}
                            </span>
                          )}
                        </span>
                        <Badge
                          tone={
                            b.booking_status === "in_use"
                              ? "warning"
                              : b.booking_status === "completed"
                                ? "muted"
                                : "primary"
                          }
                          className="!text-[10px]"
                        >
                          {b.booking_status === "in_use"
                            ? "กำลังใช้"
                            : b.booking_status === "completed"
                              ? "เสร็จสิ้น"
                              : isPast
                                ? "ผ่านมาแล้ว"
                                : "จองแล้ว"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSlots.length > 0 && (
              <div className="mt-4">
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
          </Card>

          {/* SUMMARY */}
          <Card className="!p-0 overflow-hidden sticky top-24">
            <div className="p-6 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold tracking-tight">สรุปค่าบริการ</h3>
                <div className="flex items-center gap-2">
                  {draftStatus === "saved" && (
                    <Badge tone="primary" className="!text-[10px]">
                      บันทึกร่าง
                    </Badge>
                  )}
                  {draftStatus === "restored" && (
                    <Badge tone="warning" className="!text-[10px]">
                      กู้ร่างเดิม
                    </Badge>
                  )}
                  <Badge tone="primary">Real-time</Badge>
                </div>
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
                    : feedback.kind === "info"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
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
                    <span>
                      {"message" in feedback ? feedback.message : ""}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="p-6 space-y-3 text-sm">
              <SummaryRow label="ห้อง" value={room?.name ?? "—"} />
              <SummaryRow
                label="วันที่"
                value={format(
                  new Date(`${date}T00:00:00+07:00`),
                  "d MMM yyyy",
                )}
              />
              <SummaryRow
                label="ช่วงเวลา"
                value={
                  selectedSlots.length > 0
                    ? `${selectedSlots[0]} – ${endSlotLabel(selectedSlots[selectedSlots.length - 1])}`
                    : "—"
                }
              />
              <SummaryRow
                label="จำนวนชั่วโมง"
                value={`${summary.hours} ชม.`}
              />
              <SummaryRow
                label={
                  summary.packageName
                    ? `แพ็กเกจ ${summary.packageName}`
                    : "ราคาห้อง"
                }
                value={formatBaht(summary.baseAmount)}
              />
              {summary.savingsVsHourly > 0 && (
                <div className="rounded-input bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
                  <Sparkles size={14} strokeWidth={2} />
                  ใช้แพ็กเกจคุ้มกว่ารายชั่วโมง — ประหยัด{" "}
                  {formatBaht(summary.savingsVsHourly)}
                </div>
              )}
              {summary.nextPackage && (
                <div className="rounded-input bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                  <Sparkles size={14} strokeWidth={2} className="mt-0.5" />
                  <span>
                    แนะนำ <b>{summary.nextPackage.name}</b> (
                    {summary.nextPackage.hours} ชม.) — เพิ่มอีก{" "}
                    {summary.nextPackage.extraHours} ชม. ประหยัด{" "}
                    {formatBaht(summary.nextPackage.saveBaht)} เทียบรายชั่วโมง
                  </span>
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
                  label={
                    activePromo
                      ? `ส่วนลด · ${activePromo.name}`
                      : "ส่วนลด"
                  }
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

              {paymentStatus !== "free" && total > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-input bg-surface-subtle/60 border border-line-soft px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
                      มัดจำ
                    </p>
                    <p className="font-semibold tabular-nums mt-0.5">
                      {formatBaht(
                        paymentStatus === "deposit" ? depositAmount : 0,
                      )}
                    </p>
                  </div>
                  <div className="rounded-input bg-emerald-50/60 border border-emerald-100 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-emerald-700">
                      ชำระแล้ว
                    </p>
                    <p className="font-semibold tabular-nums mt-0.5 text-emerald-800">
                      {formatBaht(effectivePaid)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-input border px-3 py-2",
                      remaining > 0
                        ? "bg-amber-50/60 border-amber-200"
                        : "bg-surface-subtle/60 border-line-soft",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] uppercase tracking-[0.06em]",
                        remaining > 0 ? "text-amber-700" : "text-ink-3",
                      )}
                    >
                      คงเหลือ
                    </p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums mt-0.5",
                        remaining > 0 ? "text-amber-900" : "text-ink-2",
                      )}
                    >
                      {formatBaht(remaining)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-surface-subtle border-t border-line-soft flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={persistDraft}
                disabled={pending}
              >
                Save Draft
              </Button>
              <Button
                type="submit"
                variant="gradient"
                className="flex-1"
                iconLeft={<Save size={16} />}
                disabled={
                  pending || conflicts.length > 0 || discountExceeds
                }
              >
                {pending
                  ? "กำลังบันทึก..."
                  : conflicts.length > 0
                    ? "เวลาทับซ้อน"
                    : discountExceeds
                      ? "ส่วนลดเกิน"
                      : "บันทึกการจอง"}
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}

function RoomCard({
  room,
  selected,
  onClick,
}: {
  room: Room & { packages: RoomPackage[] };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-input border overflow-hidden text-left transition group",
        selected
          ? "border-primary-600 ring-4 ring-primary-50"
          : "border-line hover:border-primary-300",
      )}
    >
      <div
        className="relative w-full bg-surface-subtle/40 grid place-items-center overflow-hidden"
        style={{
          aspectRatio: "1536 / 1384",
          background: room.thumbnail_url
            ? undefined
            : `linear-gradient(135deg, ${room.color}33, ${room.color}10)`,
        }}
      >
        {room.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={room.thumbnail_url}
            alt={room.name}
            loading="lazy"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageOff size={18} className="text-ink-3" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-semibold text-sm tracking-tight leading-tight">
            {room.name}
          </p>
          {selected && (
            <span className="shrink-0 w-5 h-5 rounded-full bg-primary-600 grid place-items-center">
              <Check size={12} className="text-white" />
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-3 flex items-center gap-2">
          <Users size={11} /> {room.capacity_min}–{room.capacity_max} ท่าน
        </p>
        <p className="text-[11px] font-semibold text-primary-700 tabular-nums mt-1.5">
          {formatBaht(Number(room.hourly_rate))}/ชม.
          {room.packages.length > 0 && (
            <span className="text-ink-3 font-normal ml-1">
              · {room.packages.length} แพ็กเกจ
            </span>
          )}
        </p>
        {room.amenities.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {room.amenities.slice(0, 3).map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-0.5 text-[10px] text-ink-3"
              >
                {amenityIcon(a)}
                <span className="truncate max-w-[60px]">{a}</span>
              </span>
            ))}
            {room.amenities.length > 3 && (
              <span className="text-[10px] text-ink-3">
                +{room.amenities.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function SlotLegend() {
  const items: Array<{ label: string; cls: string }> = [
    { label: "ว่าง", cls: "bg-white border-line" },
    { label: "กำลังเลือก", cls: "bg-primary-100 border-primary-300" },
    { label: "เลือกแล้ว", cls: "bg-primary-600 border-primary-600" },
    { label: "ถูกจอง", cls: "bg-red-100 border-red-200" },
    { label: "กำลังใช้", cls: "bg-amber-100 border-amber-300" },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-ink-3">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block w-3 h-3 rounded-sm border",
              i.cls,
            )}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function SlotPicker({
  title,
  slots,
  selected,
  bookedSet,
  hover,
  onHover,
  onToggle,
  dayBookings,
}: {
  title: string;
  slots: string[];
  selected: string[];
  bookedSet: Set<string>;
  hover: string | null;
  onHover: (s: string | null) => void;
  onToggle: (slot: string) => void;
  dayBookings: Array<{
    starts_at: string;
    ends_at: string;
    booking_status: string;
  }>;
}) {
  function statusForSlot(slot: string):
    | "free"
    | "picking"
    | "picked"
    | "booked"
    | "in-use" {
    const m = slotToMinutes(slot);
    const inUse = dayBookings.some((b) => {
      if (b.booking_status !== "in_use") return false;
      const s = new Date(b.starts_at);
      const e = new Date(b.ends_at);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      return m >= sm && m < em;
    });
    if (inUse) return "in-use";
    if (bookedSet.has(slot)) return "booked";
    if (selected.includes(slot)) return "picked";
    if (hover === slot) return "picking";
    return "free";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em]">
          {title}
        </p>
        <p className="text-[10px] text-ink-3">
          แต่ละช่อง = 30 นาที · คลิก{" "}
          <b className="text-ink-2">11:00</b> = จอง{" "}
          <b className="text-ink-2">11:00–11:30</b>
        </p>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
        {slots.map((slot) => {
          const status = statusForSlot(slot);
          const disabled = status === "booked" || status === "in-use";
          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onMouseEnter={() => onHover(slot)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onToggle(slot)}
              className={cn(
                "h-11 rounded-input text-xs font-medium tabular-nums transition border relative flex flex-col items-center justify-center leading-tight",
                status === "picked" &&
                  "bg-primary-600 text-white border-primary-600 shadow-card",
                status === "picking" &&
                  "bg-primary-100 text-primary-700 border-primary-300",
                status === "booked" &&
                  "bg-red-100 text-red-700 border-red-200 cursor-not-allowed",
                status === "in-use" &&
                  "bg-amber-100 text-amber-800 border-amber-300 cursor-not-allowed",
                status === "free" &&
                  "bg-white border-line text-ink-2 hover:border-primary-300",
              )}
              title={
                disabled
                  ? status === "in-use"
                    ? "กำลังใช้งานอยู่"
                    : "ถูกจองแล้ว"
                  : `${slot} – ${endOfSlot(slot)} (30 นาที)`
              }
            >
              <span
                className={cn(
                  "text-[11px] font-semibold leading-none tracking-tight",
                  status === "booked" && "line-through",
                )}
              >
                {slot}-{endOfSlot(slot)}
              </span>
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

function FuzzyMatchModal({
  match,
  inputName,
  onUseExisting,
  onCreateNew,
  onClose,
}: {
  match: {
    id: string;
    display_name: string;
    phone: string | null;
    email: string | null;
    total_bookings: number;
    total_spent: number;
    tags: string[];
    similarity: number;
  };
  inputName: string;
  onUseExisting: () => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 grid place-items-center shrink-0">
            <Sparkles size={16} />
          </span>
          <div className="flex-1">
            <p className="font-bold tracking-tight">AI พบลูกค้าคล้ายเดิม</p>
            <p className="text-xs text-ink-3 mt-0.5">
              ความใกล้เคียง{" "}
              <b className="text-primary-700">
                {(match.similarity * 100).toFixed(0)}%
              </b>{" "}
              — ต้องการใช้ลูกค้าเดิมหรือสร้างใหม่?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="rounded-input border border-line bg-white p-3 flex items-start gap-3">
            <Building2
              size={18}
              className="text-ink-3 mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
                ลูกค้าเดิมในระบบ
              </p>
              <p className="font-semibold text-sm tracking-tight mt-0.5">
                {match.display_name}
              </p>
              <p className="text-[11px] text-ink-3 truncate">
                {[match.phone, match.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="text-[10px] text-ink-3 mt-1 tabular-nums">
                จองแล้ว {match.total_bookings} ครั้ง ·{" "}
                {formatBaht(Number(match.total_spent))}
              </p>
            </div>
          </div>

          <div className="rounded-input border border-dashed border-line bg-surface-subtle/40 p-3 flex items-start gap-3">
            <Sparkles size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
                ที่คุณพิมพ์
              </p>
              <p className="font-semibold text-sm tracking-tight mt-0.5">
                {inputName || "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-surface-subtle border-t border-line-soft flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCreateNew}
          >
            สร้างใหม่
          </Button>
          <Button
            type="button"
            variant="gradient"
            className="flex-1"
            onClick={onUseExisting}
          >
            ใช้ลูกค้าเดิม
          </Button>
        </div>
      </div>
    </div>
  );
}
