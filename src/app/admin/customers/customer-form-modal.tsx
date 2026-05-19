"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Save, Building2, User as UserIcon, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { CustomerInput } from "@/lib/actions/customers";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initial?: Partial<CustomerInput> & { id?: string };
  owners?: Array<{ id: string; full_name: string | null; email: string }>;
}

const typeOptions = [
  { id: "individual", label: "บุคคลธรรมดา", Icon: UserIcon },
  { id: "company", label: "นิติบุคคล", Icon: Building2 },
  { id: "government", label: "ราชการ", Icon: Landmark },
] as const;

const sourceOptions = [
  { id: "line", label: "LINE" },
  { id: "walk_in", label: "Walk-in" },
  { id: "referral_bni", label: "Referral (BNI)" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "email", label: "Email" },
  { id: "other", label: "อื่นๆ" },
] as const;

const QUICK_TAGS = [
  "VIP",
  "Champion",
  "BNI",
  "Long-term contract",
  "Recurring",
  "Big spender",
  "Educational",
];

export function CustomerFormModal({
  open,
  onClose,
  mode,
  initial,
  owners = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerInput>({
    display_name: initial?.display_name ?? "",
    type: (initial?.type as "individual" | "company" | "government") ?? "individual",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    line_id: initial?.line_id ?? "",
    contact_name: initial?.contact_name ?? "",
    company_name: initial?.company_name ?? "",
    tax_id: initial?.tax_id ?? "",
    vat_type: (initial?.vat_type as "vat" | "non_vat") ?? "non_vat",
    billing_address: initial?.billing_address ?? "",
    source: (initial?.source as CustomerInput["source"]) ?? "other",
    source_detail: initial?.source_detail ?? "",
    birthday: initial?.birthday ?? "",
    company_anniversary: initial?.company_anniversary ?? "",
    owner_id: initial?.owner_id ?? "",
    tags: initial?.tags ?? [],
    notes: initial?.notes ?? "",
  });

  function set<K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function toggleTag(tag: string) {
    const tags = form.tags ?? [];
    set(
      "tags",
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "create") {
          await createCustomer(form);
        } else if (initial?.id) {
          await updateCustomer(initial.id, form);
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  if (!open) return null;

  const isCompany = form.type === "company" || form.type === "government";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
      <form
        onSubmit={onSubmit}
        className="bg-white w-full max-w-3xl rounded-card-lg shadow-hero max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-1">
              {mode === "create" ? "เพิ่มลูกค้าใหม่" : "แก้ไขข้อมูลลูกค้า"}
            </h2>
            <p className="text-xs text-ink-3 mt-0.5">
              ข้อมูลจะ sync เข้ากับ Customer 360° และ Analytics อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-pill text-ink-3 hover:bg-surface-subtle grid place-items-center"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <Label>ประเภทลูกค้า</Label>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set("type", t.id)}
                  className={cn(
                    "h-12 px-3 rounded-input border text-sm font-medium flex items-center justify-center gap-2 transition",
                    form.type === t.id
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : "border-line text-ink-2 hover:bg-surface-subtle",
                  )}
                >
                  <t.Icon size={14} strokeWidth={1.75} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>
                {isCompany ? "ชื่อบริษัท / หน่วยงาน" : "ชื่อ-นามสกุล"} *
              </Label>
              <Input
                value={form.display_name}
                onChange={(e) => set("display_name", e.target.value)}
                placeholder={isCompany ? "บจก. สยามเทคโนโลยี" : "นายสมชาย ใจดี"}
                required
              />
            </div>
            <div>
              <Label>ผู้ติดต่อ (Contact person)</Label>
              <Input
                value={form.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
                placeholder="คุณ..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>เบอร์โทร</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="081-234-5678"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="contact@example.com"
              />
            </div>
            <div>
              <Label>LINE ID</Label>
              <Input
                value={form.line_id ?? ""}
                onChange={(e) => set("line_id", e.target.value)}
                placeholder="@easyspace"
              />
            </div>
          </div>

          {isCompany && (
            <div className="p-4 rounded-card-sm bg-surface-subtle/60 border border-line-soft space-y-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
                ข้อมูลภาษี (ออกใบกำกับภาษี)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>เลขผู้เสียภาษี (13 หลัก)</Label>
                  <Input
                    value={form.tax_id ?? ""}
                    onChange={(e) => set("tax_id", e.target.value)}
                    placeholder="0105555000123"
                    maxLength={13}
                  />
                </div>
                <div>
                  <Label>ประเภทภาษี</Label>
                  <Select
                    value={form.vat_type ?? "non_vat"}
                    onChange={(e) =>
                      set("vat_type", e.target.value as "vat" | "non_vat")
                    }
                  >
                    <option value="non_vat">Non-VAT</option>
                    <option value="vat">VAT (จด VAT)</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label>ที่อยู่ออกใบกำกับภาษี</Label>
                <Textarea
                  rows={2}
                  value={form.billing_address ?? ""}
                  onChange={(e) => set("billing_address", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>ที่มา (Source)</Label>
              <Select
                value={form.source ?? "other"}
                onChange={(e) =>
                  set("source", e.target.value as CustomerInput["source"])
                }
              >
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>รายละเอียดที่มา</Label>
              <Input
                value={form.source_detail ?? ""}
                onChange={(e) => set("source_detail", e.target.value)}
                placeholder="เช่น แนะนำโดยคุณเอ"
              />
            </div>
            <div>
              <Label>Owner (แอดมินผู้ดูแล)</Label>
              <Select
                value={form.owner_id ?? ""}
                onChange={(e) => set("owner_id", e.target.value || null)}
              >
                <option value="">— เลือก —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name ?? o.email}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>วันเกิด / วันก่อตั้ง</Label>
              <Input
                type="date"
                value={form.birthday ?? ""}
                onChange={(e) => set("birthday", e.target.value || null)}
              />
            </div>
            <div>
              <Label>วันครบรอบ (Company anniversary)</Label>
              <Input
                type="date"
                value={form.company_anniversary ?? ""}
                onChange={(e) =>
                  set("company_anniversary", e.target.value || null)
                }
              />
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((t) => {
                const active = (form.tags ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-pill text-[11px] font-medium border transition",
                      active
                        ? "bg-primary-600 text-white border-primary-600"
                        : "bg-white text-ink-2 border-line hover:bg-surface-subtle",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>หมายเหตุ (Notes)</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="ข้อมูลเพิ่มเติม เช่น ความชอบ ข้อจำกัด ..."
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-input bg-red-50 text-red-700 text-xs">
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-line flex items-center justify-end gap-2 bg-surface-subtle/40">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            iconLeft={mode === "create" ? <Plus size={16} /> : <Save size={16} />}
          >
            {isPending
              ? "กำลังบันทึก..."
              : mode === "create"
                ? "เพิ่มลูกค้า"
                : "บันทึก"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
