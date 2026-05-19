"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Save,
  RotateCcw,
  QrCode,
  Copy,
  ExternalLink,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { setSettingValue } from "@/lib/actions/settings";
import type { PublicRoomConfig } from "@/lib/data/public-rooms";
import { cn } from "@/lib/cn";

interface Room {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_SLUGS = ["meeting", "master", "prime"];

export function QrPublicManager({
  rooms,
  config: initial,
  defaults,
}: {
  rooms: Room[];
  config: PublicRoomConfig;
  defaults: PublicRoomConfig;
}) {
  const [form, setForm] = useState<PublicRoomConfig>(initial);
  const [origin, setOrigin] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Slug rows derived from slug_map + DEFAULT_SLUGS
  const slugRows: Array<{ slug: string; roomId: string }> = (() => {
    const keys = new Set([...DEFAULT_SLUGS, ...Object.keys(form.slug_map)]);
    return Array.from(keys).map((s) => ({
      slug: s,
      roomId: form.slug_map[s] ?? "",
    }));
  })();

  function setSlugRoom(slug: string, roomId: string) {
    setForm((f) => {
      const next = { ...f.slug_map };
      if (roomId) next[slug] = roomId;
      else delete next[slug];
      return { ...f, slug_map: next };
    });
  }
  function addSlugRow(newSlug: string) {
    const cleaned = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleaned) return;
    setForm((f) => ({
      ...f,
      slug_map: { ...f.slug_map, [cleaned]: "" },
    }));
  }
  function removeSlugRow(slug: string) {
    if (DEFAULT_SLUGS.includes(slug)) return; // can't remove defaults
    setForm((f) => {
      const next = { ...f.slug_map };
      delete next[slug];
      return { ...f, slug_map: next };
    });
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      const r = await setSettingValue("public.rooms.config", form, "public");
      if (r.ok) {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 2200);
      } else setErr(r.error);
    });
  }

  function restoreDefault() {
    setForm(defaults);
  }

  return (
    <div className="space-y-5">
      {/* ── Global toggle + headline ── */}
      <Card>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold tracking-tight">ตั้งค่าทั่วไป</p>
            <p className="text-xs text-ink-3 mt-0.5">
              เปิด/ปิดทั้งระบบ · ข้อความแถบ CTA · LINE และเบอร์ติดต่อ
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savedHint && (
              <Badge tone="success" className="!text-[10px]">
                บันทึกแล้ว
              </Badge>
            )}
            <Badge
              tone={form.enabled ? "success" : "muted"}
              className="!text-[10px]"
            >
              {form.enabled ? "เปิดใช้งาน" : "ปิด"}
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-input border border-line bg-white text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm({ ...form, enabled: e.target.checked })
              }
              className="w-4 h-4 accent-primary-600"
            />
            <span>
              เปิดหน้า public ที่{" "}
              <code className="font-mono text-ink-2">/rooms/&lt;slug&gt;</code>{" "}
              — ถ้าปิดจะ 404
            </span>
          </label>

          <div>
            <Label>ข้อความ headline (เหนือปุ่ม CTA)</Label>
            <Input
              value={form.headline}
              onChange={(e) =>
                setForm({ ...form, headline: e.target.value })
              }
              placeholder="เช็กห้องว่าง · ติดต่อจองได้ทันที"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>LINE URL</Label>
              <Input
                value={form.line_url}
                onChange={(e) =>
                  setForm({ ...form, line_url: e.target.value })
                }
                placeholder="https://lin.ee/easyspace"
              />
            </div>
            <div>
              <Label>LINE ID (สำหรับโชว์)</Label>
              <Input
                value={form.line_id}
                onChange={(e) =>
                  setForm({ ...form, line_id: e.target.value })
                }
                placeholder="@easyspace"
              />
            </div>
            <div>
              <Label>เบอร์โทร</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="02-000-0000"
              />
            </div>
            <div>
              <Label>วันที่แสดงในหน้า</Label>
              <Select
                value={String(form.show_days)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    show_days: Number(e.target.value) as 1 | 2 | 3 | 7,
                  })
                }
              >
                <option value="1">วันนี้อย่างเดียว</option>
                <option value="2">วันนี้ + พรุ่งนี้</option>
                <option value="3">3 วันข้างหน้า (แนะนำ)</option>
                <option value="7">7 วัน</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-input border border-line bg-white text-sm">
              <input
                type="checkbox"
                checked={form.show_capacity}
                onChange={(e) =>
                  setForm({ ...form, show_capacity: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              แสดงจำนวนคน
            </label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-input border border-line bg-white text-sm">
              <input
                type="checkbox"
                checked={form.show_hourly_rate}
                onChange={(e) =>
                  setForm({ ...form, show_hourly_rate: e.target.checked })
                }
                className="w-4 h-4 accent-primary-600"
              />
              แสดงราคา/ชม.
            </label>
          </div>

          {err && (
            <p className="text-xs text-red-600 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<RotateCcw size={12} />}
              onClick={restoreDefault}
            >
              คืนค่าเริ่มต้น
            </Button>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Save size={12} />}
              onClick={save}
              disabled={pending}
            >
              {pending ? "บันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Slug mapping ── */}
      <Card>
        <p className="font-semibold tracking-tight mb-1">
          Slug → ห้อง mapping
        </p>
        <p className="text-xs text-ink-3 mb-3">
          แต่ละ slug = 1 ลิงก์สาธารณะ และ 1 QR Code · 3 slug แรก default
          (meeting/master/prime) ลบไม่ได้ · เพิ่ม slug ใหม่ได้
        </p>

        <div className="space-y-2">
          {slugRows.map((row) => (
            <SlugRow
              key={row.slug}
              slug={row.slug}
              roomId={row.roomId}
              rooms={rooms}
              origin={origin}
              isDefault={DEFAULT_SLUGS.includes(row.slug)}
              onChangeRoom={(id) => setSlugRoom(row.slug, id)}
              onRemove={() => removeSlugRow(row.slug)}
            />
          ))}
        </div>

        <AddSlugRow onAdd={addSlugRow} />

        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Save size={12} />}
            onClick={save}
            disabled={pending}
          >
            {pending ? "บันทึก..." : "บันทึก mapping"}
          </Button>
        </div>
      </Card>

      {/* ── Preview info ── */}
      <Card className="!bg-primary-50/30 !border-primary-100">
        <p className="font-semibold tracking-tight mb-1 inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-primary-600" /> วิธีใช้งาน
        </p>
        <ol className="text-xs text-ink-2 space-y-1 list-decimal list-inside">
          <li>
            ตั้ง mapping slug → ห้องที่ต้องการให้ public เห็น
          </li>
          <li>กดบันทึก</li>
          <li>
            กด <b>Download QR</b> หรือ <b>Print</b> ในแต่ละ slug
          </li>
          <li>นำ QR ไปติดหน้าห้อง — ลูกค้าสแกนแล้วจะเข้า /rooms/&lt;slug&gt;</li>
        </ol>
        <p className="text-[11px] text-ink-3 mt-2">
          ลิงก์ทำงานทันทีหลังบันทึก — ไม่ต้อง deploy ใหม่
        </p>
      </Card>
    </div>
  );
}

function SlugRow({
  slug,
  roomId,
  rooms,
  origin,
  isDefault,
  onChangeRoom,
  onRemove,
}: {
  slug: string;
  roomId: string;
  rooms: Room[];
  origin: string;
  isDefault: boolean;
  onChangeRoom: (id: string) => void;
  onRemove: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const url = `${origin}/rooms/${slug}`;
  const room = rooms.find((r) => r.id === roomId);

  function copy() {
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="rounded-card border border-line-soft bg-white">
      <div className="p-3 flex items-center gap-3">
        <div
          className="w-1.5 h-10 rounded-full shrink-0"
          style={{ background: room?.color ?? "#cbd5e1" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="font-mono font-bold text-primary-700">
              /rooms/{slug}
            </code>
            {isDefault && (
              <Badge tone="muted" className="!text-[9px]">
                default
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-ink-3 truncate font-mono">{url}</p>
        </div>
        <div className="shrink-0 w-48">
          <Select
            value={roomId}
            onChange={(e) => onChangeRoom(e.target.value)}
            className="!h-9 !text-xs"
          >
            <option value="">— เลือกห้อง —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={copy}
            title="คัดลอกลิงก์"
            className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center"
          >
            <Copy size={12} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="เปิดดู"
            className="w-8 h-8 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center"
          >
            <ExternalLink size={12} />
          </a>
          <button
            onClick={() => setQrOpen((s) => !s)}
            title="QR / Download"
            className={cn(
              "w-8 h-8 rounded-pill grid place-items-center",
              qrOpen
                ? "bg-primary-600 text-white"
                : "text-ink-3 hover:bg-primary-50 hover:text-primary-600",
            )}
          >
            <QrCode size={12} />
          </button>
          {!isDefault && (
            <button
              onClick={onRemove}
              title="ลบ slug"
              className="w-8 h-8 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 grid place-items-center"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {qrOpen && (
        <QrPreview slug={slug} roomName={room?.name ?? slug} url={url} />
      )}
    </div>
  );
}

function QrPreview({
  slug,
  roomName,
  url,
}: {
  slug: string;
  roomName: string;
  url: string;
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&data=${encodeURIComponent(url)}`;
  const printUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=20&data=${encodeURIComponent(url)}`;

  function downloadPng() {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `qr-${slug}.png`;
    a.target = "_blank";
    a.click();
  }

  function printPoster() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR · ${roomName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Plus Jakarta Sans", "IBM Plex Sans Thai", sans-serif; margin: 0; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
  .card { text-align: center; max-width: 500px; padding: 32px; border: 1px solid #e8ecf2; border-radius: 24px; }
  .eyebrow { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; }
  h1 { font-size: 32px; margin: 0 0 6px; letter-spacing: -0.02em; }
  p { color: #475569; margin: 0 0 28px; font-size: 14px; }
  img { width: 320px; height: 320px; display: block; margin: 0 auto 20px; }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #94a3b8; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #eef2ff; color: #2d4ef5; font-size: 11px; font-weight: 600; margin-top: 12px; }
  @media print { .noprint { display: none; } @page { size: A4; margin: 0; } }
</style></head><body>
<div class="card">
  <p class="eyebrow">EasySpace · เช็กห้องว่าง</p>
  <h1>${roomName}</h1>
  <p>สแกนเพื่อดูเวลาว่างของห้องนี้</p>
  <img src="${printUrl}" alt="QR" />
  <code>${url}</code>
  <div class="badge">📱 สแกนผ่านกล้องโทรศัพท์</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`);
    w.document.close();
  }

  return (
    <div className="border-t border-line-soft p-4 bg-surface-subtle/40">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt={`QR ${slug}`}
          className="w-32 h-32 rounded-input bg-white border border-line-soft shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-3 mb-1">
            QR สำหรับติดหน้าห้อง <b>{roomName}</b>
          </p>
          <p className="text-[10px] text-ink-3 font-mono truncate mb-3">
            {url}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Download size={12} />}
              onClick={downloadPng}
            >
              Download PNG
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Printer size={12} />}
              onClick={printPoster}
            >
              Print Poster
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSlugRow({ onAdd }: { onAdd: (slug: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="เพิ่ม slug ใหม่ (เช่น lounge / vip)"
        className="!h-9 !text-sm flex-1"
      />
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Plus size={12} />}
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim());
            setValue("");
          }
        }}
      >
        เพิ่ม
      </Button>
    </div>
  );
}
