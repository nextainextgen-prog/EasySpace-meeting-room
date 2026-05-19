import Link from "next/link";
import {
  Search,
  Plus,
  Download,
  Sparkles,
  Building2,
  User as UserIcon,
  Landmark,
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  Crown,
  Ban,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { listCustomers, listAdmins } from "@/lib/data";
import { ActionIcon } from "./_action-icon";
import {
  SEGMENT_DEFS,
  classifySegment,
  segmentCounts,
  computeHealthScore,
  type SegmentKey,
} from "@/lib/data/customer-segments";
import { formatBaht, relativeFromNow } from "@/lib/format";
import { CustomersToolbar } from "./customers-toolbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "ข้อมูลลูกค้า — EasySpace" };

interface SearchParams {
  segment?: SegmentKey;
  q?: string;
  type?: "individual" | "company" | "government";
  source?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeSegment: SegmentKey = params.segment ?? "all";
  const q = (params.q ?? "").trim().toLowerCase();

  const [customers, admins] = await Promise.all([
    listCustomers({ limit: 500 }),
    listAdmins(),
  ]);
  const counts = segmentCounts(customers);

  const filtered = customers.filter((c) => {
    if (activeSegment === "all") {
      if (c.blacklisted_at) return false;
    } else if (activeSegment === "blacklist") {
      if (!c.blacklisted_at) return false;
    } else if (classifySegment(c) !== activeSegment) {
      return false;
    }
    if (params.type && c.type !== params.type) return false;
    if (params.source && c.source !== params.source) return false;
    if (q) {
      const hay =
        `${c.display_name} ${c.company_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.tax_id ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const typeIcon = (t: string) =>
    t === "company" ? Building2 : t === "government" ? Landmark : UserIcon;
  const typeLabel = (t: string) =>
    t === "company" ? "นิติบุคคล" : t === "government" ? "ราชการ" : "บุคคล";

  return (
    <>
      <AdminTopbar
        title="ข้อมูลลูกค้า"
        subtitle="CRM 360° · Activity timeline · Fuzzy match"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ลูกค้าทั้งหมด"
          description={`${customers.length} ราย · ดึงจาก Supabase real-time · sync กับ Analytics 2-way`}
          actions={
            <CustomersToolbar
              owners={admins.map((a) => ({
                id: a.id,
                full_name: a.full_name,
                email: a.email,
              }))}
            />
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          <aside className="space-y-4">
            <Card className="!p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold px-2 py-2">
                Segments (RFM 11)
              </p>
              <ul className="space-y-0.5">
                {SEGMENT_DEFS.map((s) => {
                  const isActive = activeSegment === s.key;
                  const count = counts[s.key] ?? 0;
                  const href =
                    s.key === "all"
                      ? "/admin/customers"
                      : `/admin/customers?segment=${s.key}`;
                  return (
                    <li key={s.key}>
                      <Link
                        href={href}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-input text-sm transition ${
                          isActive
                            ? "bg-primary-50 text-primary-700 font-medium"
                            : "text-ink-2 hover:bg-surface-subtle"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              s.tone === "primary"
                                ? "bg-primary-500"
                                : s.tone === "success"
                                  ? "bg-emerald-500"
                                  : s.tone === "warning"
                                    ? "bg-amber-500"
                                    : s.tone === "danger"
                                      ? "bg-red-500"
                                      : s.tone === "info"
                                        ? "bg-blue-500"
                                        : "bg-slate-300"
                            }`}
                          />
                          <span className="truncate">{s.label}</span>
                        </span>
                        <span className="text-xs text-ink-3 tabular-nums">
                          {count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {activeSegment !== "all" && (
              <Card className="!p-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                  เกี่ยวกับ Segment
                </p>
                <p className="text-sm font-semibold text-ink-1 tracking-tight">
                  {SEGMENT_DEFS.find((s) => s.key === activeSegment)?.label}
                </p>
                <p className="text-xs text-ink-3 mt-1.5 leading-relaxed">
                  {SEGMENT_DEFS.find((s) => s.key === activeSegment)?.description}
                </p>
              </Card>
            )}

            <Card className="!p-4 !bg-primary-50/60 !border-primary-100">
              <div className="flex items-start gap-2.5">
                <IconTile icon={Sparkles} tone="primary" size="sm" />
                <div>
                  <p className="text-sm font-semibold text-primary-700 tracking-tight">
                    AI Fuzzy Match
                  </p>
                  <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                    pg_trgm 3 ระดับ — DB exact → fuzzy → Gemini AI confidence
                    score (0.85+ auto-merge, 0.7–0.85 popup ถาม)
                  </p>
                </div>
              </div>
            </Card>
          </aside>

          <div className="space-y-4">
            <Card className="!p-4">
              <form
                method="get"
                className="flex flex-wrap items-center gap-3"
              >
                {activeSegment !== "all" && (
                  <input type="hidden" name="segment" value={activeSegment} />
                )}
                <div className="flex-1 min-w-[200px]">
                  <Input
                    name="q"
                    defaultValue={params.q ?? ""}
                    placeholder="ค้นหา ชื่อ / เบอร์ / Email / Tax ID..."
                    iconLeft={<Search size={16} />}
                    className="h-9"
                  />
                </div>
                <select
                  name="type"
                  defaultValue={params.type ?? ""}
                  className="h-9 px-3 pr-8 rounded-input border border-line text-sm text-ink-2 bg-white"
                >
                  <option value="">ทุกประเภท</option>
                  <option value="individual">บุคคล</option>
                  <option value="company">นิติบุคคล</option>
                  <option value="government">ราชการ</option>
                </select>
                <select
                  name="source"
                  defaultValue={params.source ?? ""}
                  className="h-9 px-3 pr-8 rounded-input border border-line text-sm text-ink-2 bg-white"
                >
                  <option value="">ทุกที่มา</option>
                  <option value="line">LINE</option>
                  <option value="walk_in">Walk-in</option>
                  <option value="referral_bni">BNI</option>
                  <option value="facebook">Facebook</option>
                  <option value="google">Google</option>
                  <option value="email">Email</option>
                  <option value="other">อื่นๆ</option>
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Filter size={14} />}
                  type="submit"
                >
                  กรอง
                </Button>
              </form>
            </Card>

            {filtered.length === 0 ? (
              <EmptyState
                icon={UserIcon}
                title={
                  customers.length === 0
                    ? "ยังไม่มีลูกค้าในระบบ"
                    : "ไม่พบลูกค้าใน segment นี้"
                }
                description={
                  customers.length === 0
                    ? "กดบันทึกการจองในหน้า /admin/bookings เพื่อสร้าง profile ลูกค้าใหม่ — AI fuzzy match จะรู้จักลูกค้าเก่าให้อัตโนมัติ"
                    : "ลองเลือก segment อื่นหรือล้างตัวกรอง"
                }
              />
            ) : (
              <Card className="!p-0 overflow-hidden">
                <div className="grid grid-cols-12 px-5 py-3 bg-surface-subtle border-b border-line text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-3">
                  <div className="col-span-3">ลูกค้า</div>
                  <div className="col-span-2">ติดต่อ</div>
                  <div className="col-span-1 text-center">ประเภท</div>
                  <div className="col-span-1 text-center">จอง</div>
                  <div className="col-span-2 text-right">ยอดรวม</div>
                  <div className="col-span-1 text-center">RFM</div>
                  <div className="col-span-1 text-center">Health</div>
                  <div className="col-span-1 text-right pr-2">Action</div>
                </div>
                <ul>
                  {filtered.map((c) => {
                    const TypeIcon = typeIcon(c.type);
                    const segment = classifySegment(c);
                    const segDef = SEGMENT_DEFS.find((s) => s.key === segment);
                    const health = computeHealthScore(c);
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="grid grid-cols-12 px-5 py-4 items-center border-b border-line-soft hover:bg-surface-subtle/60 transition group"
                        >
                          <div className="col-span-3 flex items-center gap-3 min-w-0">
                            <span className="w-10 h-10 rounded-pill bg-primary-50 text-primary-600 grid place-items-center font-semibold text-sm shrink-0 relative">
                              {c.display_name.slice(0, 2)}
                              {c.tags.includes("VIP") && (
                                <Crown
                                  size={11}
                                  strokeWidth={2}
                                  className="absolute -top-1 -right-1 text-amber-500 bg-white rounded-full p-0.5 w-4 h-4"
                                />
                              )}
                              {c.blacklisted_at && (
                                <Ban
                                  size={11}
                                  strokeWidth={2}
                                  className="absolute -top-1 -right-1 text-red-500 bg-white rounded-full p-0.5 w-4 h-4"
                                />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm tracking-tight text-ink-1 truncate group-hover:text-primary-600 transition">
                                {c.display_name}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {segDef && segDef.key !== "all" && (
                                  <Badge tone={segDef.tone} className="!text-[10px]">
                                    {segDef.label}
                                  </Badge>
                                )}
                                {c.tags.slice(0, 2).map((t) => (
                                  <Badge
                                    key={t}
                                    tone={
                                      t === "VIP" || t === "Champion"
                                        ? "primary"
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
                          <div className="col-span-2 text-xs text-ink-2 min-w-0">
                            <p className="tabular-nums truncate">{c.phone ?? "—"}</p>
                            <p className="text-ink-3 truncate">{c.email ?? "—"}</p>
                          </div>
                          <div className="col-span-1 text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] text-ink-2">
                              <TypeIcon size={11} strokeWidth={1.75} />
                              {typeLabel(c.type)}
                            </span>
                          </div>
                          <div className="col-span-1 text-center tabular-nums font-medium text-sm">
                            {c.total_bookings}
                          </div>
                          <div className="col-span-2 text-right tabular-nums font-semibold text-ink-1">
                            {formatBaht(Number(c.total_spent))}
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
                              {c.rfm_score ?? segDef?.short ?? "—"}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-center">
                            <span
                              className={`inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-pill text-[11px] font-semibold tabular-nums ${
                                health.tone === "success"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : health.tone === "warning"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                              }`}
                            >
                              {health.score}
                            </span>
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1 pr-2">
                            <ActionIcon
                              href={c.line_id ? `https://line.me/R/ti/p/${c.line_id}` : undefined}
                              tip="LINE"
                              icon={MessageCircle}
                              external
                            />
                            <ActionIcon
                              href={c.phone ? `tel:${c.phone}` : undefined}
                              tip="Call"
                              icon={Phone}
                            />
                            <ActionIcon
                              href={c.email ? `mailto:${c.email}` : undefined}
                              tip="Email"
                              icon={Mail}
                            />
                            <ArrowUpRight
                              size={14}
                              strokeWidth={1.75}
                              className="text-ink-3 group-hover:text-primary-600 transition"
                            />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-5 py-3 border-t border-line-soft bg-surface-subtle/60 text-xs text-ink-3 flex items-center justify-between">
                  <span>แสดง {filtered.length} จาก {customers.length} ราย</span>
                  <span>RFM + Health score คำนวณเรียลไทม์จาก aggregates</span>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

