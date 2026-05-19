"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, CalendarOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { upsertHoliday, deleteHoliday } from "@/lib/actions/settings";

interface Holiday {
  id: string;
  occurred_on: string;
  name: string;
  is_annual: boolean;
  policy: "block" | "premium" | "vip_only";
  premium_pct: number | null;
  notes: string | null;
}

const POLICY_LABEL: Record<Holiday["policy"], string> = {
  block: "ปิดให้บริการ",
  premium: "เปิด · คิด premium",
  vip_only: "เฉพาะ VIP",
};

export function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function onDelete(id: string) {
    if (!confirm("ลบวันหยุดนี้?")) return;
    const r = await deleteHoliday(id);
    notify(r.ok ? "ลบเรียบร้อย" : `ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          iconLeft={<Plus size={14} />}
          onClick={() =>
            setEditing({
              id: "",
              occurred_on: new Date().toISOString().slice(0, 10),
              name: "",
              is_annual: false,
              policy: "block",
              premium_pct: 0,
              notes: null,
            })
          }
        >
          เพิ่มวันหยุด
        </Button>
      </div>

      {holidays.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-3 text-center py-8">ยังไม่มีวันหยุด</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <th className="text-left py-2.5 px-3">วันที่</th>
                <th className="text-left py-2.5 px-3">ชื่อ</th>
                <th className="text-left py-2.5 px-3">นโยบาย</th>
                <th className="text-left py-2.5 px-3">ทุกปี</th>
                <th className="text-right py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr
                  key={h.id}
                  className="border-t border-line-soft hover:bg-primary-50/20"
                >
                  <td className="py-2 px-3 tabular-nums text-ink-3">
                    {new Date(h.occurred_on).toLocaleDateString("th-TH", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2 px-3 font-medium">
                    <CalendarOff
                      size={12}
                      className="inline mr-1.5 text-ink-3"
                    />
                    {h.name}
                  </td>
                  <td className="py-2 px-3">
                    <Badge
                      tone={
                        h.policy === "block"
                          ? "danger"
                          : h.policy === "premium"
                            ? "warning"
                            : "info"
                      }
                      className="!text-[10px]"
                    >
                      {POLICY_LABEL[h.policy]}
                      {h.policy === "premium" && h.premium_pct
                        ? ` +${h.premium_pct}%`
                        : ""}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    {h.is_annual ? (
                      <Badge tone="success" className="!text-[10px]">
                        ทุกปี
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-3">ครั้งเดียว</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => setEditing(h)}
                      className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <Pencil size={12} className="inline" />
                    </button>
                    <button
                      onClick={() => onDelete(h.id)}
                      className="w-8 h-8 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 ml-1"
                    >
                      <Trash2 size={12} className="inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <HolidayForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกวันหยุดแล้ว");
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

function HolidayForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Holiday;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    occurred_on: initial.occurred_on,
    name: initial.name,
    is_annual: initial.is_annual,
    policy: initial.policy,
    premium_pct: initial.premium_pct ?? 0,
    notes: initial.notes ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertHoliday({
        id: form.id,
        occurred_on: form.occurred_on,
        name: form.name,
        is_annual: form.is_annual,
        policy: form.policy,
        premium_pct: form.premium_pct,
        notes: form.notes || null,
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
            {form.id ? "แก้ไขวันหยุด" : "เพิ่มวันหยุด"}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>วันที่ *</Label>
              <Input
                type="date"
                value={form.occurred_on}
                onChange={(e) =>
                  setForm({ ...form, occurred_on: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>ทุกปี</Label>
              <label className="flex items-center gap-2 h-11 px-3 rounded-input border border-line bg-white">
                <input
                  type="checkbox"
                  checked={form.is_annual}
                  onChange={(e) =>
                    setForm({ ...form, is_annual: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary-600"
                />
                <span className="text-sm">เป็นวันหยุดทุกปี</span>
              </label>
            </div>
          </div>
          <div>
            <Label>ชื่อ *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="วันสงกรานต์ / ปิดพิเศษ"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>นโยบาย</Label>
              <Select
                value={form.policy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    policy: e.target.value as Holiday["policy"],
                  })
                }
              >
                <option value="block">ปิด · ไม่รับจอง</option>
                <option value="premium">เปิด · คิด premium</option>
                <option value="vip_only">เฉพาะ VIP</option>
              </Select>
            </div>
            {form.policy === "premium" && (
              <div>
                <Label>Premium %</Label>
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={form.premium_pct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      premium_pct: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            )}
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
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
