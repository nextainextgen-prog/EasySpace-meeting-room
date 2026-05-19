"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Percent,
  CircleDollarSign,
  PackageCheck,
  Gift,
  Repeat,
  Ticket,
  Clock,
  Crown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Save,
  Wand2,
  QrCode,
  Hash,
  Users,
  Shield,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  createPromotion,
  type PromotionInput,
} from "@/lib/actions/promotions";

export interface WizardRoom {
  id: string;
  name: string;
  color: string;
}

const TYPE_DEFS = [
  {
    id: "percentage",
    label: "ส่วนลด %",
    icon: Percent,
    hint: "หักเปอร์เซ็นต์จากยอดรวม",
    tone: "bg-primary-50 text-primary-700",
  },
  {
    id: "fixed",
    label: "ส่วนลดเงินคงที่",
    icon: CircleDollarSign,
    hint: "หักจำนวนเงินตายตัว",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    id: "package_upgrade",
    label: "Package Upgrade",
    icon: PackageCheck,
    hint: "อัพแพ็กเกจฟรี (4h → 8h)",
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    id: "free_addon",
    label: "ฟรี Add-on",
    icon: Gift,
    hint: "แถมอุปกรณ์/อาหารว่าง",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    id: "bogo",
    label: "BOGO 1 แถม 1",
    icon: Repeat,
    hint: "จอง 1 ครั้ง รับฟรีอีก 1",
    tone: "bg-rose-50 text-rose-700",
  },
  {
    id: "voucher",
    label: "Voucher",
    icon: Ticket,
    hint: "คูปองมูลค่าใช้ครั้งถัดไป",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    id: "time_based",
    label: "Time-based",
    icon: Clock,
    hint: "เฉพาะช่วงเวลา (Off-peak)",
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    id: "tier",
    label: "Member Tier",
    icon: Crown,
    hint: "ระดับสมาชิก (VIP/Gold/Silver)",
    tone: "bg-yellow-50 text-yellow-700",
  },
] as const;

type TypeId = (typeof TYPE_DEFS)[number]["id"];

const STEPS = [
  { id: 1, label: "ประเภท" },
  { id: 2, label: "รายละเอียด" },
  { id: 3, label: "กฎ" },
  { id: 4, label: "Targeting" },
  { id: 5, label: "Code" },
  { id: 6, label: "Review" },
];

const SEGMENT_OPTIONS = [
  "champions",
  "loyal",
  "potential",
  "new",
  "promising",
  "need_attention",
  "about_to_sleep",
  "at_risk",
  "cant_lose",
  "hibernating",
];

const TAG_OPTIONS = ["VIP", "BNI", "Recurring", "Big spender", "Long-term contract"];

interface Props {
  open: boolean;
  onClose: () => void;
  rooms: WizardRoom[];
  suggestion?: {
    title?: string;
    promotionType?: TypeId;
    suggestedDiscount?: number;
  };
}

export function PromotionWizard({ open, onClose, rooms, suggestion }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<TypeId>(
    suggestion?.promotionType ?? "percentage",
  );
  const [name, setName] = useState(suggestion?.title ?? "");
  const [description, setDescription] = useState("");
  const [discountValue, setDiscountValue] = useState(
    suggestion?.suggestedDiscount ?? 10,
  );
  const [maxDiscount, setMaxDiscount] = useState<number | "">("");
  const [minOrder, setMinOrder] = useState<number | "">("");
  const [startsAt, setStartsAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endsAt, setEndsAt] = useState("");

  const [timeRule, setTimeRule] = useState({
    daysOfWeek: [] as number[],
    fromHour: 9,
    toHour: 18,
  });
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [totalQuota, setTotalQuota] = useState<number | "">(100);
  const [perCustomerQuota, setPerCustomerQuota] = useState<number | "">(1);
  const [stackable, setStackable] = useState(false);

  const [segments, setSegments] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState("");

  const [codeMode, setCodeMode] = useState<"single" | "multi" | "auto" | "qr">(
    "single",
  );
  const [codeValue, setCodeValue] = useState("");
  const [codeCount, setCodeCount] = useState(50);

  const isLast = step === STEPS.length;
  const canGoNext = useMemo(() => {
    if (step === 1) return !!type;
    if (step === 2) return name.trim().length > 0;
    return true;
  }, [step, type, name]);

  if (!open) return null;

  function toggle<T>(list: T[], v: T) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const finalCode =
          codeMode === "single"
            ? codeValue.trim() || null
            : codeMode === "auto"
              ? `AUTO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
              : codeMode === "qr"
                ? `QR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
                : null;

        const input: PromotionInput = {
          name,
          description: description || null,
          code: finalCode,
          discount_type:
            type === "time_based" || type === "tier"
              ? "percentage"
              : (type as PromotionInput["discount_type"]),
          discount_value: Number(discountValue) || 0,
          max_discount: maxDiscount === "" ? null : Number(maxDiscount),
          min_order: minOrder === "" ? null : Number(minOrder),
          applicable_room_ids: roomIds,
          applicable_segments: segments,
          applicable_tags: tags,
          time_constraint:
            type === "time_based"
              ? {
                  daysOfWeek: timeRule.daysOfWeek,
                  fromHour: timeRule.fromHour,
                  toHour: timeRule.toHour,
                }
              : {},
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          total_quota: totalQuota === "" ? null : Number(totalQuota),
          per_customer_quota:
            perCustomerQuota === "" ? null : Number(perCustomerQuota),
          status: "draft",
          stackable,
          cover_url: null,
          tags: [],
        };
        await createPromotion(input);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-card shadow-card-hover w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-line-soft">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 grid place-items-center rounded-input bg-primary-50 text-primary-700">
              <Wand2 size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                สร้างโปรโมชั่น
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Wizard 6 ขั้น — เลือกประเภทแล้วระบบจะแนะนำ rule อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 transition"
            aria-label="ปิด"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-4 border-b border-line-soft">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5 flex-1">
                <div
                  className={cn(
                    "w-7 h-7 rounded-pill grid place-items-center text-[11px] font-bold transition",
                    step === s.id
                      ? "bg-primary-600 text-white"
                      : step > s.id
                        ? "bg-emerald-500 text-white"
                        : "bg-surface-subtle text-ink-3",
                  )}
                >
                  {step > s.id ? "✓" : s.id}
                </div>
                <span
                  className={cn(
                    "text-[11px] hidden md:inline",
                    step === s.id ? "text-ink-1 font-semibold" : "text-ink-3",
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-px",
                      step > s.id ? "bg-emerald-500" : "bg-line",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <SectionTitle
                title="เลือกประเภทโปรโมชั่น"
                hint="8 แบบ — ครอบคลุมทุก use case"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TYPE_DEFS.map((t) => {
                  const Icon = t.icon;
                  const active = type === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={cn(
                        "p-3.5 rounded-card-sm border text-left transition",
                        active
                          ? "border-primary-600 ring-2 ring-primary-100 bg-primary-50/40"
                          : "border-line hover:border-primary-200 hover:bg-surface-subtle",
                      )}
                    >
                      <span
                        className={cn(
                          "w-9 h-9 grid place-items-center rounded-input mb-2",
                          t.tone,
                        )}
                      >
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <p className="font-semibold text-sm tracking-tight">
                        {t.label}
                      </p>
                      <p className="text-[11px] text-ink-3 mt-0.5">{t.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <SectionTitle title="รายละเอียดโปรโมชั่น" />
              <div>
                <Label>ชื่อโปรโมชั่น *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น Friday Flash 20% off"
                />
              </div>
              <div>
                <Label>คำอธิบาย</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="ใช้ภายในและแสดงในหน้าจอง"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    {type === "fixed"
                      ? "ส่วนลด (บาท)"
                      : type === "package_upgrade" || type === "free_addon"
                        ? "Reference value"
                        : "ส่วนลด (%)"}
                  </Label>
                  <Input
                    type="number"
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div>
                  <Label>เพดานส่วนลด (บาท)</Label>
                  <Input
                    type="number"
                    value={maxDiscount}
                    onChange={(e) =>
                      setMaxDiscount(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    placeholder="ไม่จำกัด"
                  />
                </div>
                <div>
                  <Label>ขั้นต่ำต่อบิล (บาท)</Label>
                  <Input
                    type="number"
                    value={minOrder}
                    onChange={(e) =>
                      setMinOrder(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    placeholder="ไม่กำหนด"
                  />
                </div>
                <div>
                  <Label>Stackable</Label>
                  <button
                    type="button"
                    onClick={() => setStackable((v) => !v)}
                    className={cn(
                      "h-11 w-full rounded-input border text-sm font-medium transition",
                      stackable
                        ? "border-primary-600 bg-primary-50 text-primary-700"
                        : "border-line hover:bg-surface-subtle",
                    )}
                  >
                    {stackable
                      ? "ใช่ — ใช้พร้อมโปรอื่น"
                      : "ไม่ — ใช้คนเดียว"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>เริ่มวันที่</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label>สิ้นสุด (เว้นว่าง = ไม่จำกัด)</Label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SectionTitle
                title="Rules Builder"
                hint="ใช้กับห้องไหน ช่วงเวลาไหน quota เท่าไหร่"
              />

              {type === "time_based" && (
                <div className="surface-subtle p-4 space-y-3">
                  <p className="text-xs font-semibold text-ink-2 flex items-center gap-2">
                    <CalendarRange size={14} strokeWidth={1.75} /> Time
                    constraint
                  </p>
                  <div>
                    <Label>วันที่ใช้ได้</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((label, i) => {
                        const active = timeRule.daysOfWeek.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setTimeRule((s) => ({
                                ...s,
                                daysOfWeek: toggle(s.daysOfWeek, i),
                              }))
                            }
                            className={cn(
                              "w-9 h-9 rounded-input text-xs font-semibold border transition",
                              active
                                ? "border-primary-600 bg-primary-50 text-primary-700"
                                : "border-line hover:bg-surface-subtle",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>ตั้งแต่</Label>
                      <Input
                        type="number"
                        value={timeRule.fromHour}
                        onChange={(e) =>
                          setTimeRule((s) => ({
                            ...s,
                            fromHour: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>ถึง</Label>
                      <Input
                        type="number"
                        value={timeRule.toHour}
                        onChange={(e) =>
                          setTimeRule((s) => ({
                            ...s,
                            toHour: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label>ห้องที่ใช้ได้ (ไม่เลือก = ทุกห้อง)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map((r) => {
                    const active = roomIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRoomIds((s) => toggle(s, r.id))}
                        className={cn(
                          "px-3 h-9 rounded-pill text-xs font-medium border transition flex items-center gap-1.5",
                          active
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-line hover:bg-surface-subtle text-ink-2",
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-pill"
                          style={{ background: r.color }}
                        />
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quota รวม</Label>
                  <Input
                    type="number"
                    value={totalQuota}
                    onChange={(e) =>
                      setTotalQuota(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Quota ต่อคน</Label>
                  <Input
                    type="number"
                    value={perCustomerQuota}
                    onChange={(e) =>
                      setPerCustomerQuota(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <SectionTitle
                title="Smart Targeting"
                hint="เลือก segment, tag หรือใส่ email ลูกค้าตรงๆ"
              />
              <div>
                <Label>
                  <Users size={12} strokeWidth={1.75} className="inline mr-1" />
                  Segments
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {SEGMENT_OPTIONS.map((s) => {
                    const active = segments.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSegments((arr) => toggle(arr, s))}
                        className={cn(
                          "px-3 h-9 rounded-pill text-xs font-medium border transition",
                          active
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-line hover:bg-surface-subtle text-ink-2",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.map((t) => {
                    const active = tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTags((arr) => toggle(arr, t))}
                        className={cn(
                          "px-3 h-9 rounded-pill text-xs font-medium border transition",
                          active
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-line hover:bg-surface-subtle text-ink-2",
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Manual list (อีเมล/เบอร์ คั่นด้วย ,)</Label>
                <Textarea
                  rows={2}
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  placeholder="user1@a.com, 081-234-5678"
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <SectionTitle
                title="Promo Code"
                hint="single = โค้ดเดียวทุกคน · multi = หลายโค้ด · auto = ระบบสร้างให้ · QR"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(
                  [
                    { id: "single", label: "Single", icon: Hash },
                    { id: "multi", label: "Multi", icon: Ticket },
                    { id: "auto", label: "Auto", icon: Sparkles },
                    { id: "qr", label: "QR", icon: QrCode },
                  ] as const
                ).map(({ id, label, icon: Icon }) => {
                  const active = codeMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCodeMode(id)}
                      className={cn(
                        "p-3 rounded-card-sm border text-center transition",
                        active
                          ? "border-primary-600 bg-primary-50 ring-2 ring-primary-100"
                          : "border-line hover:bg-surface-subtle",
                      )}
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        className="mx-auto mb-1 text-primary-600"
                      />
                      <p className="text-xs font-semibold">{label}</p>
                    </button>
                  );
                })}
              </div>
              {codeMode === "single" && (
                <div>
                  <Label>โค้ดเดียว</Label>
                  <Input
                    placeholder="SUMMER25"
                    value={codeValue}
                    onChange={(e) =>
                      setCodeValue(e.target.value.toUpperCase())
                    }
                  />
                </div>
              )}
              {codeMode === "multi" && (
                <div>
                  <Label>จำนวนโค้ด</Label>
                  <Input
                    type="number"
                    value={codeCount}
                    onChange={(e) => setCodeCount(Number(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-ink-3 mt-1">
                    ระบบสร้าง {codeCount} โค้ดให้ทันที (เช่น MULTI-AB12CD)
                  </p>
                </div>
              )}
              {codeMode === "auto" && (
                <p className="text-xs text-ink-3">
                  ระบบจะสร้างโค้ดสุ่มเฉพาะลูกค้าแต่ละคนเวลาส่งโปร
                </p>
              )}
              {codeMode === "qr" && (
                <p className="text-xs text-ink-3">
                  สร้าง QR Code 1 รูปสำหรับติดในร้าน — สแกนแล้วได้โค้ด
                </p>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <SectionTitle title="Review & Save" hint="ตรวจสอบก่อนสร้าง" />
              <div className="surface-subtle p-4 space-y-2">
                <ReviewRow label="ชื่อ" value={name || "—"} />
                <ReviewRow
                  label="ประเภท"
                  value={TYPE_DEFS.find((t) => t.id === type)?.label ?? type}
                />
                <ReviewRow
                  label="ส่วนลด"
                  value={
                    type === "fixed"
                      ? `${discountValue} บาท`
                      : type === "package_upgrade" || type === "free_addon"
                        ? "อ้างอิงตามแพ็กเกจ"
                        : `${discountValue}%`
                  }
                />
                <ReviewRow
                  label="ระยะเวลา"
                  value={`${startsAt} → ${endsAt || "ไม่จำกัด"}`}
                />
                <ReviewRow
                  label="ห้อง"
                  value={
                    roomIds.length === 0
                      ? "ทุกห้อง"
                      : `${roomIds.length} ห้อง`
                  }
                />
                <ReviewRow
                  label="Targeting"
                  value={
                    segments.length + tags.length === 0
                      ? "ทุกคน"
                      : `${segments.length} segment · ${tags.length} tag`
                  }
                />
                <ReviewRow
                  label="Quota"
                  value={`รวม ${totalQuota || "∞"} · ต่อคน ${
                    perCustomerQuota || "∞"
                  }`}
                />
                <ReviewRow
                  label="Code"
                  value={`${codeMode}${
                    codeValue ? ` · ${codeValue}` : ""
                  }`}
                />
                <ReviewRow
                  label="Stackable"
                  value={stackable ? "ใช่" : "ไม่"}
                />
              </div>
              <div className="rounded-card-sm border border-amber-200 bg-amber-50 p-3 flex gap-2">
                <Shield
                  size={14}
                  strokeWidth={1.75}
                  className="text-amber-700 shrink-0 mt-0.5"
                />
                <p className="text-xs text-amber-800 leading-relaxed">
                  สถานะเริ่มต้นเป็น <strong>Draft</strong> — เปิดใช้งานในการ์ดหลังจากบันทึก
                </p>
              </div>
              {error && (
                <div className="rounded-card-sm bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-line-soft">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<ChevronLeft size={14} strokeWidth={1.75} />}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || isPending}
          >
            ย้อนกลับ
          </Button>
          <span className="text-[11px] text-ink-3">
            ขั้นที่ {step} / {STEPS.length}
          </span>
          {!isLast ? (
            <Button
              size="sm"
              iconRight={<ChevronRight size={14} strokeWidth={1.75} />}
              onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
              disabled={!canGoNext}
            >
              ถัดไป
            </Button>
          ) : (
            <Button
              size="sm"
              iconLeft={<Save size={14} strokeWidth={1.75} />}
              onClick={submit}
              disabled={isPending || !name.trim()}
            >
              {isPending ? "กำลังบันทึก..." : "สร้างโปรโมชั่น"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="font-semibold tracking-tight text-ink-1">{title}</h3>
      {hint && <p className="text-xs text-ink-3 mt-0.5">{hint}</p>}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-3">{label}</span>
      <span className="font-medium text-ink-1">{value}</span>
    </div>
  );
}
