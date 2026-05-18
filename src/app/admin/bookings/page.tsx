"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  CalendarPlus,
  Check,
  Coffee,
  Save,
  Search,
  Tag,
  User,
  Users,
  Building2,
  Sparkles,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { Badge } from "@/components/ui/badge";
import { rooms } from "@/lib/mocks";
import { cn } from "@/lib/cn";
import { formatBaht } from "@/lib/format";

const morningSlots = [
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
];
const afternoonSlots = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
const eveningSlots = [
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
];

const customerTypes = [
  { id: "individual", label: "บุคคลธรรมดา" },
  { id: "company", label: "นิติบุคคล" },
  { id: "government", label: "ข้าราชการ" },
];

const sources = [
  { id: "line", label: "LINE" },
  { id: "walk_in", label: "Walk-in" },
  { id: "referral_bni", label: "Referral (BNI)" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "email", label: "Email" },
  { id: "other", label: "อื่นๆ" },
];

const paymentStatuses = [
  { id: "paid", label: "จ่ายแล้ว", tone: "success" },
  { id: "deposit", label: "มัดจำแล้ว", tone: "warning" },
  { id: "unpaid", label: "ยังไม่มัดจำ", tone: "danger" },
  { id: "free", label: "ฟรี", tone: "muted" },
] as const;

const addons = [
  { id: "mic", label: "ไมโครโฟนไร้สาย", price: 100 },
  { id: "coffee", label: "กาแฟ / น้ำดื่ม", price: 80 },
  { id: "flip", label: "Flipchart", price: 150 },
  { id: "snack", label: "อาหารว่าง", price: 200 },
];

export default function BookingsPage() {
  const [selectedRoom, setSelectedRoom] = useState(rooms[1].id);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentStatus, setPaymentStatus] =
    useState<(typeof paymentStatuses)[number]["id"]>("unpaid");

  const room = rooms.find((r) => r.id === selectedRoom);
  const allSlots = [...morningSlots, ...afternoonSlots, ...eveningSlots];

  const summary = useMemo(() => {
    if (selectedSlots.length === 0 || !room) {
      return { hours: 0, base: 0, addonsCost: 0, recommendedPackage: null };
    }
    const indices = selectedSlots
      .map((s) => allSlots.indexOf(s))
      .sort((a, b) => a - b);
    const hours = (indices.length) * 0.5;

    const matchingPackage = room.packages
      .filter((p) => p.hours <= hours)
      .sort((a, b) => b.hours - a.hours)[0];

    const hourlyTotal = hours * room.hourlyRate;
    const base = matchingPackage ? matchingPackage.price : hourlyTotal;
    const recommendedPackage =
      matchingPackage && matchingPackage.price < hourlyTotal
        ? { name: matchingPackage.name, save: hourlyTotal - matchingPackage.price }
        : null;

    const addonsCost = selectedAddons.reduce((sum, id) => {
      const a = addons.find((x) => x.id === id);
      return sum + (a?.price ?? 0);
    }, 0);

    return { hours, base, addonsCost, recommendedPackage };
  }, [selectedSlots, room, selectedAddons]);

  const subtotal = summary.base + summary.addonsCost;
  const total = Math.max(0, subtotal - discount);

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

  return (
    <>
      <AdminTopbar
        title="ลงข้อมูลการจอง"
        subtitle="กรอกฟอร์ม + เลือก slot · AI ช่วยตัดสินใจ"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ลงข้อมูลการจองใหม่"
          description="Form 40% + ปฏิทินช่วยตัดสินใจ 60%"
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* LEFT — Form */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>ข้อมูลผู้จอง</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <div>
                  <Label>ชื่อบริษัท / ผู้จอง *</Label>
                  <Input
                    placeholder="พิมพ์ชื่อหรือเลือกจากรายการ..."
                    iconLeft={<Search size={16} />}
                  />
                  <p className="text-[11px] text-ink-3 mt-1.5 flex items-center gap-1">
                    <Sparkles size={11} strokeWidth={2} className="text-primary-500" />
                    AI Fuzzy match จะค้นหาลูกค้าเก่าให้
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>เบอร์โทร *</Label>
                    <Input placeholder="08x-xxx-xxxx" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input placeholder="contact@..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ประเภท</Label>
                    <Select defaultValue="company">
                      {customerTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>ที่มา</Label>
                    <Select defaultValue="line">
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </div>
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
                        onClick={() => setSelectedRoom(r.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-input border text-left transition",
                          selectedRoom === r.id
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
                            {r.capacityMin}–{r.capacityMax} ท่าน · {formatBaht(r.hourlyRate)}/ชม.
                          </p>
                        </div>
                        {selectedRoom === r.id && (
                          <Check size={16} className="text-primary-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>วันที่</Label>
                    <Input type="date" defaultValue="2026-05-18" />
                  </div>
                  <div>
                    <Label>จำนวนผู้เข้าประชุม</Label>
                    <Input type="number" defaultValue="8" />
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

                {paymentStatus === "free" && (
                  <div>
                    <Label>เหตุผลฟรี *</Label>
                    <Input placeholder="เช่น Demo เปิดตัว / VIP / Internal" />
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
                          onChange={(e) => {
                            setSelectedAddons((prev) =>
                              e.target.checked
                                ? [...prev, a.id]
                                : prev.filter((x) => x !== a.id),
                            );
                          }}
                          className="w-4 h-4 accent-primary-600"
                        />
                        <span className="flex-1 text-sm">{a.label}</span>
                        <span className="text-sm font-medium tabular-nums text-ink-2">
                          {formatBaht(a.price)}
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
                      placeholder="0"
                      value={discount || ""}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>หมายเหตุส่วนลด</Label>
                    <Input placeholder="เช่น ลูกค้า VIP" />
                  </div>
                </div>

                <div>
                  <Label>หมายเหตุ</Label>
                  <Textarea
                    rows={3}
                    placeholder="ต้องการ HDMI adapter / ติดตั้งก่อน 30 นาที..."
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT — Summary + mini calendar */}
          <div className="lg:col-span-3 space-y-5">
            <Card className="!p-0 overflow-hidden">
              <div className="p-6 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold tracking-tight">สรุปค่าบริการ</h3>
                  <Badge tone="primary">AI · Real-time</Badge>
                </div>
                <p className="text-xs text-ink-3">
                  คำนวณราคา + แนะนำแพ็กเกจที่คุ้มที่สุดอัตโนมัติ
                </p>
              </div>
              <div className="p-6 space-y-3 text-sm">
                <SummaryRow
                  label="ห้องที่เลือก"
                  value={room?.name ?? "—"}
                />
                <SummaryRow
                  label="จำนวนชั่วโมง"
                  value={`${summary.hours} ชม.`}
                />
                <SummaryRow
                  label="ราคาห้อง"
                  value={formatBaht(summary.base)}
                />
                {summary.recommendedPackage && (
                  <div className="rounded-input bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
                    <Sparkles size={14} strokeWidth={2} />
                    แนะนำ: {summary.recommendedPackage.name} — ประหยัด{" "}
                    {formatBaht(summary.recommendedPackage.save)}
                  </div>
                )}
                {summary.addonsCost > 0 && (
                  <SummaryRow
                    label="บริการเสริม"
                    value={formatBaht(summary.addonsCost)}
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
                    {formatBaht(total)}
                  </span>
                </div>
              </div>
              <div className="px-6 py-4 bg-surface-subtle border-t border-line-soft flex gap-2">
                <Button variant="secondary" className="flex-1">
                  Save Draft
                </Button>
                <Button
                  variant="gradient"
                  className="flex-1"
                  iconLeft={<Save size={16} />}
                >
                  บันทึกการจอง
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ปฏิทินช่วยตัดสินใจ</CardTitle>
              </CardHeader>
              <div className="text-xs text-ink-3 mb-3">
                ดูช่วงเวลาที่ห้องว่างใน 7 วันข้างหน้า
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  return (
                    <div
                      key={i}
                      className="rounded-card-sm border border-line p-2 text-center"
                    >
                      <p className="text-[10px] uppercase text-ink-3">
                        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"][d.getDay() === 0 ? 6 : d.getDay() - 1]}
                      </p>
                      <p className="text-base font-bold mt-1 tabular-nums">
                        {d.getDate()}
                      </p>
                      <div className="mt-1.5 flex justify-center gap-0.5">
                        {[0, 1, 2].map((j) => (
                          <span
                            key={j}
                            className={cn(
                              "w-1 h-1 rounded-pill",
                              Math.random() > 0.5
                                ? "bg-primary-400"
                                : "bg-line",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
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
