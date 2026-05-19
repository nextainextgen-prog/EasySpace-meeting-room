"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  X,
  DoorOpen,
  Save,
  PackagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { ImageUploader } from "@/components/ui/image-uploader";
import { cn } from "@/lib/cn";
import { formatBaht } from "@/lib/format";
import type { Room, RoomPackage } from "@/lib/data/rooms";
import {
  upsertRoom,
  duplicateRoom,
  deleteRoom,
  upsertPackage,
  deletePackage,
} from "@/lib/actions/settings";

type RoomWithPkg = Room & { packages: RoomPackage[] };

export function RoomsManager({ rooms }: { rooms: RoomWithPkg[] }) {
  const [editing, setEditing] = useState<RoomWithPkg | null>(null);
  const [packageEditing, setPackageEditing] = useState<{
    roomId: string;
    pkg?: RoomPackage;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function onDuplicate(id: string) {
    setPendingId(id);
    const r = await duplicateRoom(id);
    setPendingId(null);
    notify(r.ok ? "Copy ห้องเรียบร้อย — refresh เพื่อดู" : `ไม่สำเร็จ: ${r.error}`);
  }
  async function onDelete(id: string) {
    if (!confirm("ปิดใช้งานห้องนี้? (soft delete — ประวัติยังอยู่)")) return;
    setPendingId(id);
    const r = await deleteRoom(id);
    setPendingId(null);
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
              size: "small",
              capacity_min: 1,
              capacity_max: 4,
              hourly_rate: 200,
              buffer_minutes: 15,
              amenities: [],
              perks: [],
              floor: null,
              room_number: null,
              color: "#3b5bdb",
              thumbnail_url: null,
              gallery_urls: [],
              status: "active",
              allow_internal: true,
              service_days: [1, 2, 3, 4, 5, 6, 0],
              display_order: 0,
              packages: [],
            } as RoomWithPkg)
          }
        >
          เพิ่มห้องใหม่
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {rooms.map((room) => (
          <Card key={room.id}>
            {room.thumbnail_url && (
              <div
                className="rounded-card-sm overflow-hidden bg-surface-subtle/60 border border-line-soft mb-4 grid place-items-center"
                style={{ aspectRatio: "1536 / 1384" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={room.thumbnail_url}
                  alt={room.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            <div
              className="h-2 rounded-full mb-4"
              style={{ background: room.color }}
            />
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <IconTile icon={DoorOpen} tone="primary" />
                <div>
                  <CardTitle>{room.name}</CardTitle>
                  <CardSubtitle>
                    {room.capacity_min}–{room.capacity_max} ท่าน ·{" "}
                    {formatBaht(room.hourly_rate)}/ชม.
                  </CardSubtitle>
                </div>
              </div>
              <Badge
                tone={
                  room.status === "active"
                    ? "success"
                    : room.status === "maintenance"
                      ? "warning"
                      : "muted"
                }
              >
                {room.status === "active"
                  ? "Active"
                  : room.status === "maintenance"
                    ? "Maintenance"
                    : "Inactive"}
              </Badge>
            </CardHeader>

            <div className="space-y-3 text-sm">
              {room.amenities.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                    สิ่งอำนวยความสะดวก
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {room.amenities.map((a) => (
                      <Badge key={a} tone="muted" className="!text-[10px]">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {room.perks.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                    สิทธิ์ฟรีเพิ่ม
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {room.perks.map((p) => (
                      <Badge key={p} tone="info" className="!text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
                    แพ็กเกจ ({room.packages.length})
                  </p>
                  <button
                    onClick={() =>
                      setPackageEditing({ roomId: room.id })
                    }
                    className="text-[11px] text-primary-600 hover:underline inline-flex items-center gap-1"
                  >
                    <PackagePlus size={11} />
                    เพิ่ม
                  </button>
                </div>
                {room.packages.length === 0 ? (
                  <p className="text-xs text-ink-3">ยังไม่มีแพ็กเกจ</p>
                ) : (
                  <ul className="space-y-1.5">
                    {room.packages.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 text-xs p-2 rounded-input bg-surface-subtle group"
                      >
                        <span className="flex-1">
                          {p.name} · {p.hours} ชม.
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatBaht(p.price)}
                        </span>
                        <button
                          onClick={() =>
                            setPackageEditing({ roomId: room.id, pkg: p })
                          }
                          className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-primary-600"
                        >
                          <Pencil size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-line-soft flex justify-end gap-1.5">
              <button
                onClick={() => setEditing(room)}
                disabled={pendingId === room.id}
                className="w-9 h-9 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition"
              >
                <Pencil size={14} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => onDuplicate(room.id)}
                disabled={pendingId === room.id}
                className="w-9 h-9 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition"
              >
                <Copy size={14} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => onDelete(room.id)}
                disabled={pendingId === room.id}
                className="w-9 h-9 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 grid place-items-center transition"
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <RoomFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกห้องเรียบร้อย");
          }}
        />
      )}

      {packageEditing && (
        <PackageFormModal
          roomId={packageEditing.roomId}
          pkg={packageEditing.pkg}
          onClose={() => setPackageEditing(null)}
          onDelete={async (id) => {
            await deletePackage(id);
            setPackageEditing(null);
            notify("ลบแพ็กเกจแล้ว");
          }}
          onSaved={() => {
            setPackageEditing(null);
            notify("บันทึกแพ็กเกจเรียบร้อย");
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

const DAYS = [
  { id: 1, label: "จ" },
  { id: 2, label: "อ" },
  { id: 3, label: "พ" },
  { id: 4, label: "พฤ" },
  { id: 5, label: "ศ" },
  { id: 6, label: "ส" },
  { id: 0, label: "อา" },
];

function RoomFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: RoomWithPkg;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    name: initial.name,
    size: initial.size,
    capacity_min: initial.capacity_min ?? 1,
    capacity_max: initial.capacity_max ?? 4,
    hourly_rate: initial.hourly_rate,
    buffer_minutes: initial.buffer_minutes ?? 15,
    amenities: (initial.amenities ?? []).join(", "),
    perks: (initial.perks ?? []).join(", "),
    floor: initial.floor ?? "",
    room_number: initial.room_number ?? "",
    color: initial.color ?? "#3b5bdb",
    thumbnail_url: initial.thumbnail_url ?? "",
    status: initial.status,
    allow_internal: initial.allow_internal,
    service_days: initial.service_days ?? [1, 2, 3, 4, 5, 6, 0],
    display_order: initial.display_order ?? 0,
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(d: number) {
    setForm((f) => ({
      ...f,
      service_days: f.service_days.includes(d)
        ? f.service_days.filter((x: number) => x !== d)
        : [...f.service_days, d],
    }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertRoom({
        id: form.id,
        name: form.name,
        size: form.size as "small" | "large" | "vip",
        capacity_min: form.capacity_min,
        capacity_max: form.capacity_max,
        hourly_rate: form.hourly_rate,
        buffer_minutes: form.buffer_minutes,
        amenities: form.amenities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        perks: form.perks
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        floor: form.floor || undefined,
        room_number: form.room_number || undefined,
        color: form.color,
        thumbnail_url: form.thumbnail_url || null,
        status: form.status,
        allow_internal: form.allow_internal,
        service_days: form.service_days,
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
        className="w-full max-w-2xl surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden"
      >
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight text-lg">
              {form.id ? "แก้ไขห้อง" : "เพิ่มห้องใหม่"}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              ตั้งค่าทุกอย่างที่เกี่ยวกับห้อง — name, capacity, rate, buffer,
              วันให้บริการ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ชื่อห้อง *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>ขนาด</Label>
              <Select
                value={form.size}
                onChange={(e) =>
                  setForm({
                    ...form,
                    size: e.target.value as "small" | "large" | "vip",
                  })
                }
              >
                <option value="small">Small</option>
                <option value="large">Large</option>
                <option value="vip">VIP</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>จุได้ขั้นต่ำ</Label>
              <Input
                type="number"
                min={1}
                value={form.capacity_min}
                onChange={(e) =>
                  setForm({ ...form, capacity_min: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>จุได้สูงสุด</Label>
              <Input
                type="number"
                min={1}
                value={form.capacity_max}
                onChange={(e) =>
                  setForm({ ...form, capacity_max: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>ค่าใช้บริการ (บาท/ชม.)</Label>
              <Input
                type="number"
                min={0}
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm({ ...form, hourly_rate: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Buffer (นาที)</Label>
              <Input
                type="number"
                min={0}
                value={form.buffer_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    buffer_minutes: Number(e.target.value),
                  })
                }
              />
              <p className="text-[10px] text-ink-3 mt-1">
                เวลาเตรียมระหว่างการจอง
              </p>
            </div>
            <div>
              <Label>ชั้น</Label>
              <Input
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
              />
            </div>
            <div>
              <Label>เลขห้อง</Label>
              <Input
                value={form.room_number}
                onChange={(e) =>
                  setForm({ ...form, room_number: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>สี (hex)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.color}
                  onChange={(e) =>
                    setForm({ ...form, color: e.target.value })
                  }
                />
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm({ ...form, color: e.target.value })
                  }
                  className="h-11 w-12 rounded-input border border-line"
                />
              </div>
            </div>
            <div>
              <Label>สถานะ</Label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as
                      | "active"
                      | "maintenance"
                      | "inactive",
                  })
                }
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <ImageUploader
            label="รูปประจำห้อง (Thumbnail)"
            hint="แนะนำ 1536×1384 px · PNG · JPG · WEBP · GIF · ไม่เกิน 10 MB · เห็นเต็มภาพไม่ถูกตัด"
            value={form.thumbnail_url || null}
            onChange={(url) =>
              setForm({ ...form, thumbnail_url: url ?? "" })
            }
          />

          <div>
            <Label>วันให้บริการ</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d) => {
                const on = form.service_days.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      "w-10 h-9 rounded-pill text-xs font-medium transition border",
                      on
                        ? "bg-primary-600 border-primary-600 text-white"
                        : "bg-white border-line text-ink-2 hover:border-primary-200",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>สิ่งอำนวยความสะดวก (คั่นด้วย ,)</Label>
            <Textarea
              rows={2}
              value={form.amenities}
              onChange={(e) =>
                setForm({ ...form, amenities: e.target.value })
              }
              placeholder="WiFi, HDMI, ไมโครโฟน, จอ 75 นิ้ว, แอร์"
            />
          </div>

          <div>
            <Label>สิทธิ์ฟรี (คั่นด้วย ,)</Label>
            <Textarea
              rows={2}
              value={form.perks}
              onChange={(e) => setForm({ ...form, perks: e.target.value })}
              placeholder="กาแฟ, น้ำดื่ม, แท่นวิทยากร"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allow_internal}
              onChange={(e) =>
                setForm({ ...form, allow_internal: e.target.checked })
              }
              className="w-4 h-4 accent-primary-600"
            />
            อนุญาตให้สมาชิกภายในจองได้
          </label>

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

function PackageFormModal({
  roomId,
  pkg,
  onClose,
  onSaved,
  onDelete,
}: {
  roomId: string;
  pkg?: RoomPackage;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(pkg?.name ?? "");
  const [hours, setHours] = useState(pkg?.hours ?? 3);
  const [price, setPrice] = useState(pkg?.price ?? 0);
  const [notes, setNotes] = useState(pkg?.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertPackage({
        id: pkg?.id,
        room_id: roomId,
        name,
        hours,
        price,
        notes: notes || null,
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
            {pkg ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}
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
            <Label>ชื่อแพ็กเกจ *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>จำนวนชั่วโมง</Label>
              <Input
                type="number"
                step={0.5}
                min={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>ราคา (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="shrink-0 px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          {pkg && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => onDelete(pkg.id)}
              className="mr-auto"
            >
              ลบ
            </Button>
          )}
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
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}
