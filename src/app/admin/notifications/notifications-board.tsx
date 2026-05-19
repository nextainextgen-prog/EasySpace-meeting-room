"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bell,
  Clock,
  Wallet,
  Sparkles,
  Server,
  CheckCircle2,
  X,
  Settings as SettingsIcon,
  AlertTriangle,
  AlertCircle,
  Info,
  Moon,
  Send,
  ArrowUpRight,
  ListFilter,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { relativeFromNow } from "@/lib/format";
import {
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  setQuietHours,
  setTriggerToggle,
  type QuietHours,
} from "@/lib/actions/notifications";

type Level = "danger" | "warning" | "info" | "success";
type Category = "time" | "finance" | "ai_digest" | "ai_insight" | "system";

type Item = {
  id: string;
  category: Category;
  level: Level;
  title: string;
  body: string | null;
  link: string | null;
  related_id: string | null;
  read: boolean;
  resolved: boolean;
  createdAt: string;
};

const CATEGORY_LABEL: Record<Category, string> = {
  time: "เวลา",
  finance: "การเงิน",
  ai_digest: "AI รายงาน",
  ai_insight: "AI insight",
  system: "ระบบ",
};

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  time: Clock,
  finance: Wallet,
  ai_digest: Sparkles,
  ai_insight: Sparkles,
  system: Server,
};

const FILTERS: Array<{
  key: "all" | Category;
  label: string;
  icon: typeof Bell;
}> = [
  { key: "all", label: "ทั้งหมด", icon: Bell },
  { key: "time", label: "เวลา", icon: Clock },
  { key: "finance", label: "การเงิน", icon: Wallet },
  { key: "ai_digest", label: "AI", icon: Sparkles },
  { key: "ai_insight", label: "AI insight", icon: Sparkles },
  { key: "system", label: "ระบบ", icon: Server },
];

interface Trigger {
  id: string;
  group: "A" | "B" | "C" | "D" | "E";
  code: string;
  label: string;
  detail: string;
  event: string;
  defaultLevel: Level | "gray";
}

const TRIGGERS: Trigger[] = [
  // A — เวลา
  {
    id: "A1",
    group: "A",
    code: "A1",
    label: "ใกล้ถึงเวลา 30 นาที",
    detail: "เตือนแอดมิน + ลูกค้า 30 นาทีก่อนเริ่ม",
    event: "notification.time_alert",
    defaultLevel: "info",
  },
  {
    id: "A2",
    group: "A",
    code: "A2",
    label: "ใกล้ถึงเวลา 15 นาที",
    detail: "เตรียมห้อง · เปิดแอร์ · ตรวจ AV",
    event: "notification.time_alert",
    defaultLevel: "warning",
  },
  {
    id: "A3",
    group: "A",
    code: "A3",
    label: "ใกล้หมดเวลา 15 นาที",
    detail: "เตือนผู้ใช้ก่อนเวลาจะหมด",
    event: "notification.time_alert",
    defaultLevel: "warning",
  },
  {
    id: "A4",
    group: "A",
    code: "A4",
    label: "ใกล้หมดเวลา 5 นาที",
    detail: "เตือนสุดท้าย — ถามต่อเวลา?",
    event: "notification.time_alert",
    defaultLevel: "warning",
  },
  {
    id: "A5",
    group: "A",
    code: "A5",
    label: "หมดเวลา / No-show",
    detail: "ครบ 15 นาทีหลังเริ่ม แต่ลูกค้ายังไม่มา",
    event: "internal.no_show",
    defaultLevel: "danger",
  },
  {
    id: "A6",
    group: "A",
    code: "A6",
    label: "Conflict (เวลาทับซ้อน)",
    detail: "ตรวจขณะบันทึก + แสดง AI suggest alternative",
    event: "notification.system",
    defaultLevel: "danger",
  },
  // B — การเงิน
  {
    id: "B1",
    group: "B",
    code: "B1",
    label: "ใกล้ครบกำหนดชำระ",
    detail: "1 วันก่อนกำหนด → in-app + Telegram",
    event: "outstanding.alert",
    defaultLevel: "warning",
  },
  {
    id: "B2",
    group: "B",
    code: "B2",
    label: "ค้างชำระ (overdue)",
    detail: "ส่งทุกวัน 09:00 จนกว่าจะปิดยอด",
    event: "outstanding.alert",
    defaultLevel: "danger",
  },
  {
    id: "B3",
    group: "B",
    code: "B3",
    label: "ชำระครบ — บันทึกยอด",
    detail: "Trigger จาก booking_payments → topic ยอดเข้าไม่พัก",
    event: "payment.paid",
    defaultLevel: "success",
  },
  {
    id: "B4",
    group: "B",
    code: "B4",
    label: "มัดจำแล้ว — ใกล้วันจอง",
    detail: "ยังมียอดค้าง · 1-3 วันก่อนถึง",
    event: "outstanding.alert",
    defaultLevel: "warning",
  },
  // C — AI digest
  {
    id: "C1",
    group: "C",
    code: "C1",
    label: "AI Daily Brief 08:00",
    detail: "สรุปยอดเข้า · queue · outstanding · alert พิเศษ",
    event: "finance.daily_brief",
    defaultLevel: "info",
  },
  {
    id: "C2",
    group: "C",
    code: "C2",
    label: "Alert พิเศษ (อัตโนมัติ)",
    detail: "เมื่อ AI ตรวจเจอ outlier (ยอดสูง/ต่ำผิดปกติ)",
    event: "finance.daily_brief",
    defaultLevel: "warning",
  },
  // D — AI insight
  {
    id: "D1",
    group: "D",
    code: "D1",
    label: "ห้องว่างนานผิดปกติ",
    detail: "แนะนำโปรโมชั่นเสริม",
    event: "notification.system",
    defaultLevel: "info",
  },
  {
    id: "D2",
    group: "D",
    code: "D2",
    label: "VIP กำลังจะมาในสัปดาห์",
    detail: "แจ้งเตรียมต้อนรับ",
    event: "notification.system",
    defaultLevel: "info",
  },
  {
    id: "D3",
    group: "D",
    code: "D3",
    label: "รายได้เพิ่มผิดปกติ",
    detail: "ตรวจจับ growth spike — เปิดวิเคราะห์ที่มา",
    event: "finance.weekly_summary",
    defaultLevel: "success",
  },
  {
    id: "D4",
    group: "D",
    code: "D4",
    label: "Churn risk (ลูกค้าหายเงียบ)",
    detail: "ใช้ rfm_score + last_booked_at",
    event: "notification.system",
    defaultLevel: "warning",
  },
  // E — system
  {
    id: "E1",
    group: "E",
    code: "E1",
    label: "ระบบ error / DB down",
    detail: "Sentry + Telegram",
    event: "notification.system",
    defaultLevel: "danger",
  },
  {
    id: "E2",
    group: "E",
    code: "E2",
    label: "Quota จาก member / org",
    detail: "ใกล้เต็มโควต้าของลูกค้า/องค์กร",
    event: "internal.quota_alert",
    defaultLevel: "warning",
  },
  {
    id: "E3",
    group: "E",
    code: "E3",
    label: "Member ใหม่เข้าระบบ",
    detail: "ส่งเข้า topic ติดตามสถานะ",
    event: "internal.member_joined",
    defaultLevel: "info",
  },
];

const TELEGRAM_TEMPLATES = [
  "notification.time_alert",
  "notification.system",
  "internal.no_show",
  "internal.member_joined",
  "internal.quota_alert",
  "outstanding.alert",
  "finance.daily_brief",
  "finance.weekly_summary",
];

export function NotificationsBoard({
  items: initialItems,
  counts,
  quietHours,
  triggerToggles: initialToggles,
}: {
  items: Item[];
  counts: Record<string, number>;
  quietHours: QuietHours;
  triggerToggles: Record<string, boolean>;
}) {
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    initialToggles,
  );
  const [quiet, setQuiet] = useState<QuietHours>(quietHours);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  const filtered = useMemo(() => {
    const live = items.filter((n) => !n.resolved);
    if (filter === "all") return live;
    return live.filter((n) => n.category === filter);
  }, [items, filter]);

  // Section bucketing
  const sections = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const urgent: Item[] = [];
    const aiDigest: Item[] = [];
    const earlier: Item[] = [];
    for (const n of filtered) {
      const created = new Date(n.createdAt);
      const isToday = created >= todayStart;
      if (n.category === "ai_digest") aiDigest.push(n);
      else if (isToday && (n.level === "danger" || n.level === "warning"))
        urgent.push(n);
      else earlier.push(n);
    }
    return { urgent, aiDigest, earlier };
  }, [filtered]);

  async function onMarkRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await markNotificationRead(id);
  }
  async function onDismiss(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, resolved: true } : n)),
    );
    await dismissNotification(id);
  }
  async function onMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
    notify("อ่านทั้งหมดเรียบร้อย");
  }

  return (
    <>
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const count =
              f.key === "all"
                ? items.filter((n) => !n.resolved).length
                : counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-medium tracking-tight transition",
                  filter === f.key
                    ? "bg-primary-600 text-white"
                    : "text-ink-2 hover:bg-surface-subtle",
                )}
              >
                <Icon size={13} />
                {f.label}
                <span className="text-[11px] opacity-80 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<CheckCircle2 size={14} />}
            onClick={onMarkAll}
          >
            อ่านทั้งหมด
          </Button>
        </div>
      </Card>

      {/* Sections */}
      <Section
        title="วันนี้ — ด่วน"
        subtitle="danger + warning ของวันนี้"
        items={sections.urgent}
        onRead={onMarkRead}
        onDismiss={onDismiss}
        tone="danger"
      />
      <Section
        title="AI รายงานประจำวัน"
        subtitle="Daily brief · weekly summary · insight"
        items={sections.aiDigest}
        onRead={onMarkRead}
        onDismiss={onDismiss}
        tone="primary"
      />
      <Section
        title="ก่อนหน้านี้"
        subtitle="info / success / system / ที่อ่านแล้ว"
        items={sections.earlier}
        onRead={onMarkRead}
        onDismiss={onDismiss}
        tone="muted"
      />

      {/* Quiet Hours */}
      <QuietHoursCard quiet={quiet} setQuiet={setQuiet} notify={notify} />

      {/* Trigger catalog */}
      <TriggerCatalog
        toggles={toggles}
        setToggles={setToggles}
        notify={notify}
      />

      {/* Telegram routes */}
      <TelegramRoutesCard />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-pill bg-ink-1 text-white text-xs shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

/* ───────── Section block ───────── */
function Section({
  title,
  subtitle,
  items,
  onRead,
  onDismiss,
  tone,
}: {
  title: string;
  subtitle: string;
  items: Item[];
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  tone: "danger" | "primary" | "muted";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2
          className={cn(
            "text-sm font-bold tracking-tight",
            tone === "danger" && "text-red-700",
            tone === "primary" && "text-primary-700",
            tone === "muted" && "text-ink-2",
          )}
        >
          {title}
        </h2>
        <p className="text-[11px] text-ink-3">
          {subtitle} · {items.length}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            item={n}
            onRead={() => onRead(n.id)}
            onDismiss={() => onDismiss(n.id)}
          />
        ))}
      </ul>
    </div>
  );
}

/* ───────── Notification row with 5-level color ───────── */
const LEVEL_STYLES: Record<
  Level | "gray",
  {
    bg: string;
    border: string;
    text: string;
    icon: typeof Bell;
    badge: "danger" | "warning" | "info" | "success" | "muted";
  }
> = {
  danger: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    icon: AlertCircle,
    badge: "danger",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: AlertTriangle,
    badge: "warning",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: Info,
    badge: "info",
  },
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: CheckCircle2,
    badge: "success",
  },
  gray: {
    bg: "bg-surface-subtle/60",
    border: "border-line-soft",
    text: "text-ink-2",
    icon: Bell,
    badge: "muted",
  },
};

function NotificationRow({
  item,
  onRead,
  onDismiss,
}: {
  item: Item;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const effectiveLevel: Level | "gray" = item.read ? "gray" : item.level;
  const s = LEVEL_STYLES[effectiveLevel];
  const Icon = s.icon;
  const CategoryIcon = CATEGORY_ICON[item.category];

  return (
    <li
      className={cn(
        "flex gap-3 p-4 rounded-card border transition",
        s.bg,
        s.border,
        !item.read && "border-l-4",
        !item.read && effectiveLevel === "danger" && "border-l-red-500",
        !item.read && effectiveLevel === "warning" && "border-l-amber-500",
        !item.read && effectiveLevel === "info" && "border-l-blue-500",
        !item.read && effectiveLevel === "success" && "border-l-emerald-500",
      )}
    >
      <span
        className={cn(
          "w-9 h-9 rounded-input grid place-items-center shrink-0",
          s.bg.replace("/60", ""),
          s.text,
          "border",
          s.border,
        )}
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-semibold tracking-tight",
                item.read ? "text-ink-2" : "text-ink-1",
              )}
            >
              {item.title}
            </p>
            {item.body && (
              <p className="text-sm text-ink-2 mt-0.5 whitespace-pre-wrap">
                {item.body}
              </p>
            )}
          </div>
          <Badge tone={s.badge} className="!text-[10px] shrink-0">
            <CategoryIcon size={9} />
            {CATEGORY_LABEL[item.category]}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-[11px] text-ink-3 tabular-nums">
            {relativeFromNow(item.createdAt)}
          </p>
          {item.link && (
            <a
              href={item.link}
              className="text-[11px] text-primary-700 hover:underline inline-flex items-center gap-0.5"
            >
              เปิด <ArrowUpRight size={11} />
            </a>
          )}
          <div className="flex-1" />
          {!item.read && (
            <button
              onClick={onRead}
              className="text-[11px] text-ink-3 hover:text-ink-1"
            >
              อ่านแล้ว
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-ink-3 hover:text-red-600"
            title="ปิดการแจ้งเตือนนี้"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ───────── Quiet Hours ───────── */
function QuietHoursCard({
  quiet,
  setQuiet,
  notify,
}: {
  quiet: QuietHours;
  setQuiet: (q: QuietHours) => void;
  notify: (m: string) => void;
}) {
  const [draft, setDraft] = useState<QuietHours>(quiet);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await setQuietHours(draft);
      if (r.ok) {
        setQuiet(draft);
        notify("บันทึก Quiet Hours แล้ว");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Moon size={16} className="text-primary-600" />
          <CardTitle>Quiet Hours</CardTitle>
        </div>
        <Badge tone={draft.enabled ? "primary" : "muted"} className="!text-[10px]">
          {draft.enabled ? "เปิด" : "ปิด"}
        </Badge>
      </CardHeader>
      <CardSubtitle className="!mt-0 mb-4">
        ตั้งช่วงเวลาที่จะ <b>ไม่ส่ง</b> Telegram notification (in-app
        ยังคงสร้างไว้ แค่เงียบไม่ ping มือถือ)
      </CardSubtitle>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 px-3 py-2.5 rounded-input border border-line bg-white">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({ ...d, enabled: e.target.checked }))
            }
            className="w-4 h-4 accent-primary-600"
          />
          <span className="text-sm">เปิดใช้งาน</span>
        </label>
        <div>
          <Label>เริ่ม</Label>
          <Input
            type="time"
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
          />
        </div>
        <div>
          <Label>สิ้นสุด</Label>
          <Input
            type="time"
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={save}
        >
          {pending ? "บันทึก..." : "บันทึก"}
        </Button>
      </div>
    </Card>
  );
}

/* ───────── Trigger catalog (A1-A6 / B1-B4 / C1-C2 / D1-D4 / E1-E3) ───────── */
function TriggerCatalog({
  toggles,
  setToggles,
  notify,
}: {
  toggles: Record<string, boolean>;
  setToggles: (t: Record<string, boolean>) => void;
  notify: (m: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function flip(id: string) {
    const current = toggles[id] ?? true;
    const next = !current;
    setPendingId(id);
    setToggles({ ...toggles, [id]: next });
    const r = await setTriggerToggle(id, next);
    setPendingId(null);
    if (!r.ok) {
      // revert
      setToggles({ ...toggles, [id]: current });
      notify("บันทึกไม่สำเร็จ");
    }
  }

  const groups: Array<{
    id: "A" | "B" | "C" | "D" | "E";
    label: string;
    sub: string;
  }> = [
    { id: "A", label: "A · เวลา", sub: "ใกล้ถึง · ใกล้หมด · no-show · conflict" },
    { id: "B", label: "B · การเงิน", sub: "ใกล้กำหนด · ค้างชำระ · ชำระครบ · มัดจำ" },
    { id: "C", label: "C · AI รายงาน", sub: "Daily brief · alert พิเศษ" },
    {
      id: "D",
      label: "D · AI Insight",
      sub: "ห้องว่าง · VIP · รายได้ · churn",
    },
    { id: "E", label: "E · ระบบ", sub: "error · quota · member joined" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListFilter size={16} className="text-primary-600" />
          <CardTitle>Trigger Catalog</CardTitle>
        </div>
        <span className="text-xs text-ink-3">
          {TRIGGERS.length} triggers · A·B·C·D·E
        </span>
      </CardHeader>

      <div className="space-y-4">
        {groups.map((g) => {
          const list = TRIGGERS.filter((t) => t.group === g.id);
          return (
            <div key={g.id}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-bold tracking-tight">{g.label}</p>
                <p className="text-[11px] text-ink-3">{g.sub}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {list.map((t) => {
                  const on = toggles[t.id] ?? true;
                  const style = LEVEL_STYLES[t.defaultLevel];
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-input border p-3 flex items-start gap-3",
                        style.bg,
                        style.border,
                      )}
                    >
                      <span
                        className={cn(
                          "w-7 h-7 rounded-input grid place-items-center shrink-0 text-[10px] font-bold",
                          style.text,
                          "bg-white border",
                          style.border,
                        )}
                      >
                        {t.code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold tracking-tight">
                          {t.label}
                        </p>
                        <p className="text-[11px] text-ink-3 mt-0.5">
                          {t.detail}
                        </p>
                        <code className="text-[10px] text-ink-3 font-mono">
                          {t.event}
                        </code>
                      </div>
                      <button
                        onClick={() => flip(t.id)}
                        disabled={pendingId === t.id}
                        className={cn(
                          "shrink-0 w-9 h-5 rounded-pill transition relative",
                          on ? "bg-primary-600" : "bg-line",
                        )}
                        aria-pressed={on}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-all",
                            on ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────── Telegram routes panel ───────── */
function TelegramRoutesCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Send size={16} className="text-primary-600" />
          <CardTitle>Telegram กลุ่ม &quot;ติดตามสถานะ&quot; — 8 templates</CardTitle>
        </div>
        <Badge tone="success" className="!text-[10px]">
          มาตรฐาน
        </Badge>
      </CardHeader>
      <CardSubtitle className="!mt-0 mb-4">
        Event keys ทั้ง 8 ตัวที่เข้า topic &quot;ติดตามสถานะ&quot; — แก้ template ที่{" "}
        <code className="font-mono text-ink-2">
          src/lib/templates/telegram.ts
        </code>
      </CardSubtitle>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {TELEGRAM_TEMPLATES.map((k) => (
          <li
            key={k}
            className="flex items-center gap-2.5 px-3 py-2 rounded-input bg-surface-subtle/40 border border-line-soft"
          >
            <SettingsIcon size={13} className="text-ink-3" />
            <code className="font-mono text-[11px] text-ink-2">{k}</code>
            <Badge tone="success" className="!text-[10px] ml-auto">
              on
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
