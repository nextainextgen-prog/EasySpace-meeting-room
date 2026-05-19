"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Calendar,
  Wallet,
  Activity,
  FileText,
  StickyNote,
  MessageSquare,
  BarChart3,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  Hash,
  MapPin,
  Cake,
  Tag as TagIcon,
  Plus,
  X,
  Send,
  Sparkles,
  Crown,
  CircleDot,
  Upload,
  Banknote,
  PiggyBank,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/cn";
import { formatBaht, formatDate, formatTimeRange, relativeFromNow } from "@/lib/format";
import {
  addCustomerNote,
  addCustomerTag,
  removeCustomerTag,
} from "@/lib/actions/customers";
import type { CustomerWithOwner } from "@/lib/data/customers";
import type {
  CustomerBookingRow,
  CustomerPaymentRow,
  CustomerAnalyticsSummary,
} from "@/lib/data/customer-360";

interface TimelineItem {
  id: string;
  type: string;
  occurred_at: string;
  title: string;
  detail?: string;
  payload?: Record<string, unknown>;
  actor?: string;
}

type TabKey =
  | "overview"
  | "bookings"
  | "payments"
  | "timeline"
  | "files"
  | "notes"
  | "comms"
  | "analytics";

const TABS: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "bookings", label: "Bookings", icon: Calendar },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "timeline", label: "Timeline", icon: Activity },
  { key: "files", label: "Files", icon: FileText },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "comms", label: "Communications", icon: MessageSquare },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

interface Props {
  customer: CustomerWithOwner;
  bookings: CustomerBookingRow[];
  payments: CustomerPaymentRow[];
  timeline: TimelineItem[];
  analytics: CustomerAnalyticsSummary;
  owners: Array<{ id: string; full_name: string | null; email: string }>;
}

export function CustomerTabs({
  customer,
  bookings,
  payments,
  timeline,
  analytics,
  owners,
}: Props) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-card-md border border-line shadow-card overflow-x-auto">
        <div className="flex items-center gap-1 px-2 py-1.5 min-w-max">
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "h-9 px-3.5 inline-flex items-center gap-2 rounded-input text-sm transition",
                  active
                    ? "bg-primary-50 text-primary-700 font-semibold"
                    : "text-ink-2 hover:bg-surface-subtle",
                )}
              >
                <Icon size={14} strokeWidth={1.75} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" && (
        <OverviewTab customer={customer} timeline={timeline} owners={owners} />
      )}
      {tab === "bookings" && <BookingsTab bookings={bookings} />}
      {tab === "payments" && (
        <PaymentsTab
          payments={payments}
          totalSpent={Number(customer.total_spent)}
        />
      )}
      {tab === "timeline" && <TimelineTab timeline={timeline} />}
      {tab === "files" && <FilesTab />}
      {tab === "notes" && <NotesTab customer={customer} timeline={timeline} />}
      {tab === "comms" && <CommsTab customer={customer} />}
      {tab === "analytics" && (
        <AnalyticsTab analytics={analytics} customer={customer} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── Overview */

function OverviewTab({
  customer,
  timeline,
  owners,
}: {
  customer: CustomerWithOwner;
  timeline: TimelineItem[];
  owners: Array<{ id: string; full_name: string | null; email: string }>;
}) {
  const owner = owners.find((o) => o.id === customer.owner_id);
  const recent = timeline.slice(0, 5);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          ข้อมูลติดต่อ
        </p>
        <InfoRow icon={Phone} label="เบอร์โทร" value={customer.phone} />
        <InfoRow icon={Mail} label="Email" value={customer.email} />
        <InfoRow icon={MessageCircle} label="LINE ID" value={customer.line_id} />
        {customer.contact_name && (
          <InfoRow icon={Building2} label="ผู้ติดต่อ" value={customer.contact_name} />
        )}

        {(customer.type === "company" || customer.type === "government") && (
          <>
            <div className="pt-3 border-t border-line-soft">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                ข้อมูลภาษี
              </p>
              <InfoRow icon={Hash} label="เลขผู้เสียภาษี" value={customer.tax_id} />
              <InfoRow
                icon={MapPin}
                label="ที่อยู่ออกใบกำกับ"
                value={customer.billing_address}
              />
              <InfoRow
                icon={CircleDot}
                label="ประเภทภาษี"
                value={customer.vat_type === "vat" ? "VAT (จด)" : "Non-VAT"}
              />
            </div>
          </>
        )}

        <div className="pt-3 border-t border-line-soft space-y-2">
          {customer.birthday && (
            <InfoRow
              icon={Cake}
              label={customer.type === "individual" ? "วันเกิด" : "วันก่อตั้ง"}
              value={formatDate(customer.birthday)}
            />
          )}
          {customer.company_anniversary && (
            <InfoRow
              icon={Crown}
              label="วันครบรอบ"
              value={formatDate(customer.company_anniversary)}
            />
          )}
          {owner && (
            <InfoRow
              icon={Sparkles}
              label="Owner"
              value={owner.full_name ?? owner.email}
            />
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
            AI Insights (Auto-generated)
          </p>
          <ul className="space-y-1.5 text-sm text-ink-2 list-none">
            {generateAiInsights(customer, timeline).map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary-500 mt-1">●</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 border-t border-line-soft">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
            Recent Activity (5 ล่าสุด)
          </p>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-3">ยังไม่มีกิจกรรม</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start gap-3 text-sm py-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-1 truncate">{it.title}</p>
                    {it.detail && (
                      <p className="text-xs text-ink-3 truncate">{it.detail}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-3 shrink-0">
                    {relativeFromNow(it.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} strokeWidth={1.75} className="text-ink-3 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-3">{label}</p>
        <p className="text-sm text-ink-1 truncate">
          {value && value.trim().length > 0 ? value : "—"}
        </p>
      </div>
    </div>
  );
}

function generateAiInsights(c: CustomerWithOwner, timeline: TimelineItem[]) {
  const lines: string[] = [];
  if (c.total_bookings >= 5) {
    lines.push(
      `ลูกค้าจองทั้งหมด ${c.total_bookings} ครั้ง รวม ${formatBaht(Number(c.total_spent))} — เฉลี่ย ${formatBaht(Math.round(Number(c.total_spent) / c.total_bookings))}/ครั้ง`,
    );
  } else if (c.total_bookings > 0) {
    lines.push(`ลูกค้าใหม่ จองมาแล้ว ${c.total_bookings} ครั้ง — แนะนำให้ติดตาม onboarding`);
  } else {
    lines.push("ลูกค้ายังไม่เคยจอง — เหมาะกับการส่งโปรโมชั่นต้อนรับ");
  }
  if (c.last_booked_at) {
    lines.push(`จองล่าสุด ${relativeFromNow(c.last_booked_at)}`);
  }
  if (c.churn_risk === "high") {
    lines.push("ความเสี่ยงสูง (Churn) — แนะนำ Personal call และ Win-back promo");
  }
  if (c.no_show_count >= 2) {
    lines.push(`พบ No-show ${c.no_show_count} ครั้ง — พิจารณาเก็บมัดจำ 100% ครั้งหน้า`);
  }
  const bookingCount = timeline.filter((t) => t.type === "booking_created").length;
  if (bookingCount > 3) {
    lines.push(
      `Timeline แสดง booking ${bookingCount} รายการ — ลูกค้ามีพฤติกรรมที่ predict ได้`,
    );
  }
  return lines;
}

/* ──────────────────────────────────────────── Bookings */

function BookingsTab({ bookings }: { bookings: CustomerBookingRow[] }) {
  if (bookings.length === 0) {
    return (
      <Card className="text-center py-10">
        <p className="text-sm text-ink-3">ยังไม่มีประวัติการจอง</p>
      </Card>
    );
  }
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
        <div className="col-span-2">Ref</div>
        <div className="col-span-3">วันที่</div>
        <div className="col-span-3">ห้อง</div>
        <div className="col-span-2 text-right">ยอด</div>
        <div className="col-span-2 text-right">สถานะ</div>
      </div>
      <ul>
        {bookings.map((b) => (
          <li
            key={b.id}
            className="grid grid-cols-12 px-5 py-3 items-center border-b border-line-soft hover:bg-surface-subtle/60 text-sm"
          >
            <div className="col-span-2 font-mono text-xs text-ink-2">
              {b.reference_code}
            </div>
            <div className="col-span-3 text-ink-1">
              {formatDate(b.starts_at)}
              <p className="text-[11px] text-ink-3">
                {formatTimeRange(b.starts_at, b.ends_at)}
              </p>
            </div>
            <div className="col-span-3 text-ink-1 flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: b.room?.color ?? "#94A3B8" }}
              />
              <span className="truncate">{b.room?.name ?? "—"}</span>
            </div>
            <div className="col-span-2 text-right tabular-nums font-medium text-ink-1">
              {formatBaht(Number(b.total_amount))}
              <p className="text-[11px] text-ink-3">
                จ่ายแล้ว {formatBaht(Number(b.paid_amount))}
              </p>
            </div>
            <div className="col-span-2 text-right">
              <BookingStatusBadge status={b.booking_status} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "warning" | "danger" | "info" | "muted"; label: string }> = {
    confirmed: { tone: "success", label: "ยืนยัน" },
    pending: { tone: "warning", label: "รอยืนยัน" },
    in_use: { tone: "info", label: "ใช้งาน" },
    completed: { tone: "muted", label: "เสร็จสิ้น" },
    cancelled: { tone: "danger", label: "ยกเลิก" },
    no_show: { tone: "danger", label: "No-show" },
  };
  const { tone, label } = map[status] ?? { tone: "muted" as const, label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

/* ──────────────────────────────────────────── Payments */

function PaymentsTab({
  payments,
  totalSpent,
}: {
  payments: CustomerPaymentRow[];
  totalSpent: number;
}) {
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryStat
          icon={Banknote}
          label="ชำระทั้งหมด"
          value={formatBaht(totalPaid)}
          tone="success"
        />
        <SummaryStat
          icon={PiggyBank}
          label="ยอดบริการสะสม"
          value={formatBaht(totalSpent)}
        />
        <SummaryStat
          icon={Clock}
          label="จำนวนรายการ"
          value={`${payments.length} รายการ`}
        />
      </div>

      {payments.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-ink-3">ยังไม่มีประวัติการชำระเงิน</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
            <div className="col-span-3">วันที่</div>
            <div className="col-span-2">Booking</div>
            <div className="col-span-2">ช่องทาง</div>
            <div className="col-span-3">อ้างอิง</div>
            <div className="col-span-2 text-right">ยอด</div>
          </div>
          <ul>
            {payments.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-12 px-5 py-3 items-center border-b border-line-soft text-sm"
              >
                <div className="col-span-3 text-ink-1">
                  {formatDate(p.paid_at)}
                </div>
                <div className="col-span-2 font-mono text-xs text-ink-2">
                  {p.booking?.reference_code ?? "—"}
                </div>
                <div className="col-span-2 text-ink-2 text-xs">
                  {methodLabel(p.method)}
                </div>
                <div className="col-span-3 text-ink-3 text-xs truncate">
                  {p.reference ?? p.notes ?? "—"}
                </div>
                <div className="col-span-2 text-right tabular-nums font-semibold text-ink-1">
                  {formatBaht(Number(p.amount))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  return (
    <Card className="flex items-center gap-3 !p-4">
      <IconTile icon={Icon} tone={tone} size="md" />
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          {label}
        </p>
        <p className="text-base font-bold tabular-nums text-ink-1">{value}</p>
      </div>
    </Card>
  );
}

function methodLabel(m: string) {
  return (
    {
      cash: "เงินสด",
      bank_transfer: "โอน",
      promptpay: "PromptPay",
      qr: "QR",
      credit_card: "บัตร",
    }[m] ?? m
  );
}

/* ──────────────────────────────────────────── Timeline */

function TimelineTab({ timeline }: { timeline: TimelineItem[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all"
      ? timeline
      : timeline.filter((t) => t.type.startsWith(filter));

  return (
    <div className="space-y-4">
      <Card className="!p-3 flex flex-wrap gap-1.5">
        {[
          { k: "all", label: "ทั้งหมด" },
          { k: "booking", label: "Booking" },
          { k: "payment", label: "Payment" },
          { k: "note", label: "Note" },
          { k: "tag", label: "Tag" },
          { k: "message", label: "Message" },
          { k: "ai", label: "AI" },
        ].map((opt) => (
          <button
            key={opt.k}
            onClick={() => setFilter(opt.k)}
            className={cn(
              "px-3 py-1.5 rounded-pill text-xs font-medium transition",
              filter === opt.k
                ? "bg-primary-600 text-white"
                : "bg-surface-subtle text-ink-2 hover:bg-line",
            )}
          >
            {opt.label}
          </button>
        ))}
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-8">
            ยังไม่มีกิจกรรมในกลุ่มนี้
          </p>
        ) : (
          <ol className="relative space-y-0">
            <span className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />
            {filtered.map((it) => (
              <li key={it.id} className="relative pl-7 pb-4 last:pb-0">
                <span
                  className={cn(
                    "absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white",
                    typeRingColor(it.type),
                  )}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-1">{it.title}</p>
                    {it.detail && (
                      <p className="text-xs text-ink-2 mt-0.5">{it.detail}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-3 shrink-0 tabular-nums">
                    {formatDate(it.occurred_at, "d MMM yy · HH:mm")}
                  </span>
                </div>
                {it.actor && (
                  <p className="text-[11px] text-ink-3 mt-1">โดย {it.actor}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function typeRingColor(t: string) {
  if (t.startsWith("booking_cancel")) return "border-red-500";
  if (t.startsWith("booking")) return "border-primary-500";
  if (t.startsWith("payment")) return "border-emerald-500";
  if (t.startsWith("note")) return "border-blue-500";
  if (t.startsWith("tag")) return "border-amber-500";
  if (t.startsWith("ai")) return "border-purple-500";
  if (t.startsWith("blacklisted")) return "border-red-600";
  return "border-slate-400";
}

/* ──────────────────────────────────────────── Files (placeholder) */

function FilesTab() {
  return (
    <Card className="py-10 text-center">
      <IconTile icon={Upload} tone="muted" size="lg" className="mx-auto" />
      <p className="mt-3 text-sm font-semibold text-ink-1">
        ระบบไฟล์ (Phase 2)
      </p>
      <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
        Drag &amp; drop ใบสั่งจ้าง / สัญญา / สลิป / ใบเสร็จ / ใบกำกับภาษี —
        ผูกกับ Vercel Blob storage
      </p>
    </Card>
  );
}

/* ──────────────────────────────────────────── Notes */

function NotesTab({
  customer,
  timeline,
}: {
  customer: CustomerWithOwner;
  timeline: TimelineItem[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [pending, startTransition] = useTransition();

  const noteEvents = timeline.filter((t) => t.type === "note_added");

  function onAddNote() {
    if (!text.trim()) return;
    startTransition(async () => {
      await addCustomerNote(customer.id, text);
      setText("");
      router.refresh();
    });
  }

  function onAddTag() {
    if (!tag.trim()) return;
    startTransition(async () => {
      await addCustomerTag(customer.id, tag.trim());
      setTag("");
      router.refresh();
    });
  }

  function onRemoveTag(t: string) {
    startTransition(async () => {
      await removeCustomerTag(customer.id, t);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <Card className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          เพิ่ม Note
        </p>
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="เช่น ลูกค้าชอบกาแฟลาเต้ ไม่ใส่น้ำตาล / บริษัทย้ายที่อยู่ใหม่ 1 พ.ค."
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            iconLeft={<Send size={14} />}
            onClick={onAddNote}
            disabled={pending || !text.trim()}
          >
            บันทึก
          </Button>
        </div>

        <div className="pt-3 border-t border-line-soft">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
            ประวัติ Notes
          </p>
          {noteEvents.length === 0 ? (
            <p className="text-sm text-ink-3">ยังไม่มี note</p>
          ) : (
            <ul className="space-y-2">
              {noteEvents.map((n) => (
                <li
                  key={n.id}
                  className="p-3 rounded-card-sm bg-surface-subtle/60 border border-line-soft"
                >
                  <p className="text-sm text-ink-1">
                    {(n.payload?.text as string) ?? n.detail ?? ""}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    {(n.payload?.author as string) ?? "—"} ·{" "}
                    {formatDate(n.occurred_at, "d MMM yy HH:mm")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="space-y-3 h-fit">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          Tags
        </p>
        <div className="flex flex-wrap gap-1.5">
          {customer.tags.length === 0 && (
            <span className="text-xs text-ink-3">ยังไม่มี tag</span>
          )}
          {customer.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-primary-50 text-primary-700 text-[11px] font-medium"
            >
              {t}
              <button
                onClick={() => onRemoveTag(t)}
                className="hover:bg-primary-100 rounded-full p-0.5"
              >
                <X size={10} strokeWidth={2.25} />
              </button>
            </span>
          ))}
        </div>
        <div className="pt-3 border-t border-line-soft">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
            เพิ่ม Tag
          </p>
          <div className="flex gap-2">
            <Input
              className="h-9"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="VIP, BNI..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddTag();
                }
              }}
            />
            <Button
              size="sm"
              iconLeft={<Plus size={14} />}
              onClick={onAddTag}
              disabled={pending || !tag.trim()}
            >
              เพิ่ม
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────── Communications (placeholder) */

function CommsTab({ customer }: { customer: CustomerWithOwner }) {
  return (
    <Card className="space-y-4">
      <p className="text-sm font-semibold text-ink-1">
        ช่องทางการสื่อสาร
      </p>
      <p className="text-xs text-ink-3">
        เมื่อ LINE OA + Email + VoIP ผูกแล้ว ระบบจะ sync ทุกการสนทนามาที่นี่
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ChannelCard
          icon={MessageCircle}
          tone="success"
          label="LINE Chat"
          status={customer.line_id ? `เชื่อม @${customer.line_id} แล้ว` : "ยังไม่ผูก LINE ID"}
          href={customer.line_id ? `https://line.me/R/ti/p/${customer.line_id}` : undefined}
          cta={customer.line_id ? "เปิดแชท" : undefined}
        />
        <ChannelCard
          icon={Mail}
          tone="primary"
          label="Email Thread"
          status={customer.email ?? "ยังไม่มีอีเมล"}
          href={customer.email ? `mailto:${customer.email}` : undefined}
          cta={customer.email ? "ส่งอีเมล" : undefined}
        />
        <ChannelCard
          icon={Phone}
          tone="warning"
          label="Call Log"
          status={customer.phone ?? "ยังไม่มีเบอร์โทร"}
          href={customer.phone ? `tel:${customer.phone}` : undefined}
          cta={customer.phone ? "โทรออก" : undefined}
        />
      </div>
    </Card>
  );
}

function ChannelCard({
  icon: Icon,
  tone,
  label,
  status,
  href,
  cta,
}: {
  icon: typeof MessageCircle;
  tone: "primary" | "success" | "warning";
  label: string;
  status: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="p-4 rounded-card-sm border border-line bg-white">
      <div className="flex items-start gap-2.5">
        <IconTile icon={Icon} tone={tone} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-1">{label}</p>
          <p className="text-xs text-ink-3 mt-0.5 truncate">{status}</p>
        </div>
      </div>
      {href && cta && (
        <a
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="mt-3 inline-flex items-center justify-center w-full h-8 rounded-input bg-surface-subtle text-xs font-medium text-ink-2 hover:bg-line"
        >
          {cta}
        </a>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── Analytics */

function AnalyticsTab({
  analytics,
  customer,
}: {
  analytics: CustomerAnalyticsSummary;
  customer: CustomerWithOwner;
}) {
  const maxHour = Math.max(...analytics.byHour, 1);
  const dows = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const maxDow = Math.max(...analytics.byDow, 1);
  const maxMonth = Math.max(...analytics.monthlyRevenue.map((m) => m.amount), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
          ห้องที่จองบ่อยที่สุด
        </p>
        {analytics.byRoom.length === 0 ? (
          <p className="text-sm text-ink-3">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="space-y-2">
            {analytics.byRoom.map((r) => (
              <li key={r.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: r.color }}
                    />
                    <span className="font-medium text-ink-1">{r.name}</span>
                  </span>
                  <span className="text-xs text-ink-3 tabular-nums">
                    {r.count} ครั้ง · {r.pct}%
                  </span>
                </div>
                <div className="h-2 rounded-pill bg-surface-subtle overflow-hidden">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${r.pct}%`,
                      background: r.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
          วันในสัปดาห์ที่จองบ่อย
        </p>
        <div className="flex items-end justify-between gap-2 h-32">
          {analytics.byDow.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-primary-500 rounded-t-md"
                style={{
                  height: `${(v / maxDow) * 100}%`,
                  minHeight: v > 0 ? "4px" : "0",
                }}
              />
              <span className="text-[10px] text-ink-3 tabular-nums">{dows[i]}</span>
              <span className="text-[10px] text-ink-3 tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
          ชั่วโมงที่จอง (heatmap)
        </p>
        <div className="grid grid-cols-12 gap-1">
          {analytics.byHour.map((v, h) => (
            <div
              key={h}
              title={`${h}:00 — ${v} ครั้ง`}
              className="aspect-square rounded-sm flex items-end justify-center text-[9px] font-medium text-white"
              style={{
                background:
                  v === 0
                    ? "rgb(241 245 249)"
                    : `rgba(45, 78, 245, ${Math.max(0.2, v / maxHour)})`,
              }}
            >
              {v > 0 ? v : ""}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-ink-3 mt-1 tabular-nums">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
          ยอดจองรายเดือน
        </p>
        {analytics.monthlyRevenue.length === 0 ? (
          <p className="text-sm text-ink-3">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="space-y-2">
            {analytics.monthlyRevenue.map((m) => (
              <li key={m.month}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink-2 tabular-nums">{m.month}</span>
                  <span className="font-medium tabular-nums text-ink-1">
                    {formatBaht(m.amount)}
                  </span>
                </div>
                <div className="h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-pill"
                    style={{ width: `${(m.amount / maxMonth) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t border-line-soft grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-ink-3 uppercase">ชำระแล้ว</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">
              {formatBaht(analytics.totalPaid)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-ink-3 uppercase">ค้างชำระ</p>
            <p className="text-sm font-bold text-amber-700 tabular-nums">
              {formatBaht(analytics.outstanding)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-ink-3 uppercase">เฉลี่ยจ่ายช้า</p>
            <p className="text-sm font-bold text-ink-1 tabular-nums">
              {analytics.avgPayLagDays != null
                ? `${analytics.avgPayLagDays} วัน`
                : "—"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
