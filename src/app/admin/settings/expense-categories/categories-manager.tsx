"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Tag, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  upsertExpenseCategory,
  deleteExpenseCategory,
} from "@/lib/actions/settings";
import type { ExpenseCategory } from "@/lib/data/finance";

export function ExpenseCategoriesManager({
  categories,
}: {
  categories: ExpenseCategory[];
}) {
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function onDelete(id: string) {
    if (!confirm("ปิดใช้งานหมวดนี้?")) return;
    const r = await deleteExpenseCategory(id);
    notify(r.ok ? "ปิดใช้งานแล้ว" : `ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          iconLeft={<Plus size={14} />}
          onClick={() =>
            setEditing({
              id: "",
              name: "",
              icon: "Tag",
              ai_keywords: [],
              vat_default: false,
              tax_deductible: true,
              is_active: true,
              display_order: categories.length,
            })
          }
        >
          เพิ่มหมวด
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-3 text-center py-8">ยังไม่มีหมวด</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map((c) => (
            <Card key={c.id} className="!p-4 flex gap-3">
              <span className="w-10 h-10 rounded-input bg-primary-50 text-primary-700 grid place-items-center shrink-0">
                <Tag size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold tracking-tight">{c.name}</p>
                  <div className="flex gap-1">
                    {c.vat_default && (
                      <Badge tone="info" className="!text-[10px]">
                        VAT
                      </Badge>
                    )}
                    {c.tax_deductible && (
                      <Badge tone="success" className="!text-[10px]">
                        deductible
                      </Badge>
                    )}
                  </div>
                </div>
                {c.ai_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Sparkles size={11} className="text-primary-500 mt-0.5" />
                    {c.ai_keywords.slice(0, 4).map((k) => (
                      <span
                        key={k}
                        className="text-[10px] px-1.5 py-0.5 rounded-pill bg-surface-subtle text-ink-3"
                      >
                        {k}
                      </span>
                    ))}
                    {c.ai_keywords.length > 4 && (
                      <span className="text-[10px] text-ink-3">
                        +{c.ai_keywords.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => setEditing(c)}
                  className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="w-8 h-8 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 grid place-items-center"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CategoryForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกหมวดเรียบร้อย");
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-pill bg-ink-1 text-white text-xs shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

function CategoryForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: ExpenseCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    name: initial.name,
    icon: initial.icon ?? "Tag",
    ai_keywords: initial.ai_keywords.join(", "),
    vat_default: initial.vat_default,
    tax_deductible: initial.tax_deductible,
    is_active: initial.is_active,
    display_order: initial.display_order,
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertExpenseCategory({
        id: form.id,
        name: form.name,
        icon: form.icon,
        ai_keywords: form.ai_keywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        vat_default: form.vat_default,
        tax_deductible: form.tax_deductible,
        is_active: form.is_active,
        display_order: form.display_order,
      });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden"
      >
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <p className="font-bold tracking-tight">
            {form.id ? "แก้ไขหมวด" : "เพิ่มหมวด"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <Label>ชื่อหมวด *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>ไอคอน (Lucide name)</Label>
            <Input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="Tag / Coffee / Wallet ..."
            />
          </div>
          <div>
            <Label>AI Keywords (คั่นด้วย ,)</Label>
            <Textarea
              rows={2}
              value={form.ai_keywords}
              onChange={(e) =>
                setForm({ ...form, ai_keywords: e.target.value })
              }
              placeholder="ค่าไฟ, MEA, ค่าน้ำ, การประปา"
            />
            <p className="text-[10px] text-ink-3 mt-1">
              ตอนบันทึกรายจ่าย AI จะใช้ keyword นี้แนะนำหมวดอัตโนมัติ
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded-input border border-line bg-white text-sm">
              <input
                type="checkbox"
                checked={form.vat_default}
                onChange={(e) =>
                  setForm({ ...form, vat_default: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              มี VAT 7% โดย default
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-input border border-line bg-white text-sm">
              <input
                type="checkbox"
                checked={form.tax_deductible}
                onChange={(e) =>
                  setForm({ ...form, tax_deductible: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              นำไปลดหย่อนได้
            </label>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="shrink-0 px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            ปิด
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconLeft={<Save size={12} />}
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}
