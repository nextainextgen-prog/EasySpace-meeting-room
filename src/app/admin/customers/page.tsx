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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { listCustomers } from "@/lib/data";
import { formatBaht, relativeFromNow } from "@/lib/format";

export const dynamic = "force-dynamic";

const segmentDefs = [
  { label: "ทั้งหมด", key: "all", filter: () => true },
  {
    label: "VIP / Champion",
    key: "champion",
    filter: (c: { tags: string[] }) =>
      c.tags.includes("VIP") || c.tags.includes("Champion"),
  },
  {
    label: "ใหม่",
    key: "new",
    filter: (c: { tags: string[] }) => c.tags.includes("New"),
  },
  {
    label: "At-risk",
    key: "at_risk",
    filter: (c: { churn_risk: string | null }) => c.churn_risk === "high",
  },
];

export default async function CustomersPage() {
  const customers = await listCustomers({ limit: 100 });

  const segmentCounts = segmentDefs.map((s) => ({
    ...s,
    count: customers.filter((c) =>
      s.filter(c as { tags: string[]; churn_risk: string | null }),
    ).length,
  }));

  return (
    <>
      <AdminTopbar
        title="ข้อมูลลูกค้า"
        subtitle="CRM 360° · Activity timeline · Fuzzy match"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ลูกค้าทั้งหมด"
          description={`${customers.length} ราย · ดึงจาก Supabase real-time`}
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
          <aside className="space-y-4">
            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                Segments
              </p>
              <ul className="space-y-0.5">
                {segmentCounts.map((s, i) => (
                  <li key={s.key}>
                    <button
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-input text-sm transition ${
                        i === 0
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

            <Card className="!p-4 !bg-primary-50/60 !border-primary-100">
              <div className="flex items-start gap-2.5">
                <IconTile icon={Sparkles} tone="primary" size="sm" />
                <div>
                  <p className="text-sm font-semibold text-primary-700 tracking-tight">
                    AI Fuzzy Match
                  </p>
                  <p className="text-xs text-ink-2 mt-1">
                    ค้นหาด้วยเบอร์/email/ชื่อ pg_trgm — แสดงผล candidates
                    อันดับความคล้าย
                  </p>
                </div>
              </div>
            </Card>
          </aside>

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

            {customers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="ยังไม่มีลูกค้าในระบบ"
                description="กดบันทึกการจองในหน้า /admin/bookings เพื่อสร้าง profile ลูกค้าใหม่ — AI fuzzy match จะรู้จักลูกค้าเก่าให้อัตโนมัติ"
                action={<Button iconLeft={<Plus size={16} />}>เพิ่มลูกค้า</Button>}
              />
            ) : (
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
                          {c.display_name.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm tracking-tight text-ink-1 truncate">
                            {c.display_name}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {c.tags.slice(0, 3).map((t) => (
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
                        <p className="tabular-nums">{c.phone ?? "—"}</p>
                        <p className="text-ink-3 truncate">{c.email ?? "—"}</p>
                      </div>
                      <div className="col-span-1 text-center tabular-nums font-medium">
                        {c.total_bookings}
                      </div>
                      <div className="col-span-2 text-right tabular-nums font-semibold text-ink-1">
                        {formatBaht(c.total_spent)}
                        <p className="text-[11px] text-ink-3 font-normal">
                          {c.last_booked_at
                            ? relativeFromNow(c.last_booked_at)
                            : "ยังไม่เคยจอง"}
                        </p>
                      </div>
                      <div className="col-span-1 text-center">
                        <Badge
                          tone={
                            c.churn_risk === "low"
                              ? "success"
                              : c.churn_risk === "medium"
                                ? "warning"
                                : c.churn_risk === "high"
                                  ? "danger"
                                  : "muted"
                          }
                          className="tabular-nums"
                        >
                          {c.rfm_score ?? "—"}
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
            )}
          </div>
        </div>
      </div>
    </>
  );
}
