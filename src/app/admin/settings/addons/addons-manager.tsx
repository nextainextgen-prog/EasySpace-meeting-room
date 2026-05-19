"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Coffee, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatBaht } from "@/lib/format";
import type { Addon } from "@/lib/data/addons";
import type { Room } from "@/lib/data/rooms";
import { upsertAddon, deleteAddon } from "@/lib/actions/settings";

export function AddonsManager({
  addons,
  rooms,
}: {
  addons: Addon[];
  rooms: Room[];
}) {
  const [editing, setEditing] = useState<Addon | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function onDelete(id: string) {
    if (!confirm("ปิดใช้งานบริการเสริมนี้?")) return;
    const r = await deleteAddon(id);
    notify(r.ok ? "ปิดใช้งานเรียบร้อย" : `ไม่สำเร็จ: ${r.error}`);
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
              price: 0,
              unit: "per_use",
              description: null,
              icon: "Coffee",
              stock_total: null,
              applies_to_room_ids: [],
              is_active: true,
            } as Addon)
          }
        >
          เพิ่ม Add-on
        </Button>
      </div>

      {addons.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-3 text-center py-8">
            ยังไม่มีบริการเสริม — กด &quot;เพิ่ม Add-on&quot; ด้านบน
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {addons.map((a) => (
            <Card key={a.id} className="!p-4 flex gap-3">
              <span className="w-10 h-10 rounded-input bg-primary-50 text-primary-700 grid place-items-center shrink-0">
                <Coffee size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold tracking-tight">{a.name}</p>
                  <span className="font-bold tabular-nums">
                    {formatBaht(Number(a.price))}
                    <span className="text-[10px] font-normal text-ink-3 ml-0.5">
                      /{a.unit.replace("per_", "")}
                    </span>
                  </span>
                </div>
                {a.description && (
                  <p className="text-xs text-ink-3 mb-2">{a.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.applies_to_room_ids.length === 0 ? (
                    <Badge tone="muted" className="!text-[10px]">
                      ทุกห้อง
                    </Badge>
                  ) : (
                    a.applies_to_room_ids.slice(0, 3).map((id) => {
                      const r = rooms.find((x) => x.id === id);
                      if (!r) return null;
                      return (
                        <Badge key={id} tone="info" className="!text-[10px]">
                          {r.name}
                        </Badge>
                      );
                    })
                  )}
                  {a.stock_total !== null && (
                    <Badge tone="warning" className="!text-[10px]">
                      stock {a.stock_total}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => setEditing(a)}
                  className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => onDelete(a.id)}
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
        <AddonForm
          initial={editing}
          rooms={rooms}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึก Add-on แล้ว");
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

function AddonForm({
  initial,
  rooms,
  onClose,
  onSaved,
}: {
  initial: Addon;
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    name: initial.name,
    price: initial.price,
    unit: initial.unit,
    description: initial.description ?? "",
    icon: initial.icon ?? "Coffee",
    stock_total: initial.stock_total,
    applies_to_room_ids: initial.applies_to_room_ids ?? [],
    is_active: initial.is_active,
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertAddon({
        id: form.id,
        name: form.name,
        price: form.price,
        unit: form.unit as "per_use" | "per_hour" | "per_person",
        description: form.description || null,
        icon: form.icon || null,
        stock_total: form.stock_total,
        applies_to_room_ids: form.applies_to_room_ids,
        is_active: form.is_active,
      });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4">
      <form onSubmit={save} className="w-full max-w-md surface-card !p-0 overflow-hidden">
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <p className="font-bold tracking-tight">
            {form.id ? "แก้ไข Add-on" : "เพิ่ม Add-on"}
          </p>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <Label>ชื่อ *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ราคา (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>หน่วยคิด</Label>
              <Select
                value={form.unit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    unit: e.target.value as
                      | "per_use"
                      | "per_hour"
                      | "per_person",
                  })
                }
              >
                <option value="per_use">ต่อครั้ง</option>
                <option value="per_hour">ต่อชั่วโมง</option>
                <option value="per_person">ต่อคน</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>รายละเอียด</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Stock (เว้นว่าง = ไม่จำกัด)</Label>
            <Input
              type="number"
              min={0}
              value={form.stock_total ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  stock_total: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </div>
          <div>
            <Label>ใช้ได้กับห้อง (เว้นว่าง = ทุกห้อง)</Label>
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => {
                const on = form.applies_to_room_ids.includes(r.id);
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() =>
                      setForm({
                        ...form,
                        applies_to_room_ids: on
                          ? form.applies_to_room_ids.filter((x) => x !== r.id)
                          : [...form.applies_to_room_ids, r.id],
                      })
                    }
                    className={cn(
                      "px-2 py-1 rounded-pill text-[11px] border",
                      on
                        ? "bg-primary-50 border-primary-300 text-primary-700"
                        : "bg-white border-line text-ink-2",
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="w-4 h-4 accent-primary-600"
            />
            เปิดใช้งาน
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
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
