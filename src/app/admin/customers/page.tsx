import {
  Search,
  Filter,
  Plus,
  Download,
  Users,
  MessageCircle,
  Phone,
  Mail,
  Sparkles,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { customers } from "@/lib/mocks";
import { formatBaht, relativeFromNow } from "@/lib/format";

const segments = [
  { label: "ทั้งหมด", count: 152, key: "all", active: true },
  { label: "VIP", count: 18, key: "vip" },
  { label: "Champion", count: 24, key: "champion" },
  { label: "ใหม่ (30 วัน)", count: 12, key: "new" },
  { label: "At-risk", count: 8, key: "at_risk" },
  { label: "Hibernating", count: 15, key: "hibernating" },
  { label: "Blacklist", count: 2, key: "blacklist" },
];

const sources = [
  { label: "LINE OA", count: 45 },
  { label: "BNI Referral", count: 32 },
  { label: "Walk-in", count: 18 },
  { label: "Facebook", count: 25 },
  { label: "Google", count: 15 },
];

export default function CustomersPage() {
  return (
    <>
      <AdminTopbar
        title="ข้อมูลลูกค้า"
        subtitle="CRM 360° · Activity timeline · Fuzzy match"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ลูกค้าทั้งหมด"
          description="152 ราย · 24 active สัปดาห์นี้"
          actions={
            <>
              <Button variant="secondary" iconLeft={<Download size={16} />}>
                Export
              </Button>
              <Button iconLeft={<Plus size={16} />}>เพิ่มลูกค้า</Button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="space-y-4">
            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                Segments
              </p>
              <ul className="space-y-0.5">
                {segments.map((s) => (
                  <li key={s.key}>
                    <button
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-input text-sm transition ${
                        s.active
                          ? "bg-primary-50 text-primary-700 font-medium"
                          : "text-ink-2 hover:bg-surface-subtle"
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="text-xs text-ink-3 tabular-nums">
                        {s.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                ที่มา
              </p>
              <ul className="space-y-2 text-sm">
                {sources.map((s) => (
                  <li key={s.label} className="flex items-center justify-between">
                    <span className="text-ink-2">{s.label}</span>
                    <span className="text-xs text-ink-3 tabular-nums">
                      {s.count}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="!p-4 !bg-primary-50 !border-primary-100">
              <div className="flex items-start gap-2.5">
                <IconTile icon={Sparkles} tone="primary" size="sm" />
                <div>
                  <p className="text-sm font-semibold text-primary-700 tracking-tight">
                    AI พบลูกค้าซ้ำ
                  </p>
                  <p className="text-xs text-ink-2 mt-1">
                    3 รายอาจเป็นคนเดียวกัน — ตรวจสอบเพื่อ merge
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-3 h-8 text-xs"
                  >
                    ตรวจสอบ
                  </Button>
                </div>
              </div>
            </Card>
          </aside>

          {/* Main */}
          <div className="space-y-4">
            <Card className="!p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="ค้นหา ชื่อ / เบอร์ / Email / Tax ID..."
                    iconLeft={<Search size={16} />}
                    className="h-9"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Filter size={14} />}
                >
                  ตัวกรอง
                </Button>
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
                <div className="col-span-4">ลูกค้า</div>
                <div className="col-span-2">ติดต่อ</div>
                <div className="col-span-1 text-center">จอง</div>
                <div className="col-span-2 text-right">ยอดรวม</div>
                <div className="col-span-1 text-center">RFM</div>
                <div className="col-span-2 text-right pr-2">Action</div>
              </div>
              <ul>
                {customers.map((c) => (
                  <li
                    key={c.id}
                    className="grid grid-cols-12 px-5 py-4 items-center border-b border-line-soft hover:bg-surface-subtle/60 transition"
                  >
                    <div className="col-span-4 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-pill bg-primary-50 text-primary-600 grid place-items-center font-semibold text-sm shrink-0">
                        {c.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm tracking-tight text-ink-1 truncate">
                          {c.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {c.tags.map((t) => (
                            <Badge
                              key={t}
                              tone={
                                t === "VIP" || t === "Champion"
                                  ? "primary"
                                  : t === "At-risk"
                                    ? "warning"
                                    : "muted"
                              }
                              className="!text-[10px]"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-xs text-ink-2">
                      <p className="tabular-nums">{c.phone}</p>
                      <p className="text-ink-3 truncate">{c.email}</p>
                    </div>
                    <div className="col-span-1 text-center tabular-nums font-medium">
                      {c.totalBookings}
                    </div>
                    <div className="col-span-2 text-right tabular-nums font-semibold text-ink-1">
                      {formatBaht(c.totalSpent)}
                      <p className="text-[11px] text-ink-3 font-normal">
                        {relativeFromNow(c.lastBookedAt)}
                      </p>
                    </div>
                    <div className="col-span-1 text-center">
                      <Badge
                        tone={
                          c.churnRisk === "low"
                            ? "success"
                            : c.churnRisk === "medium"
                              ? "warning"
                              : "danger"
                        }
                        className="tabular-nums"
                      >
                        {c.rfm}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5 pr-2">
                      <button className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition">
                        <MessageCircle size={14} strokeWidth={1.75} />
                      </button>
                      <button className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition">
                        <Phone size={14} strokeWidth={1.75} />
                      </button>
                      <button className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition">
                        <Mail size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
