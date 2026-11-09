"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal, ModalBody } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { issueBookingFeedKey, revokeBookingFeedKey } from "@/lib/actions/booking-feed";
import type { FeedKey } from "@/lib/server/booking-feed";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "ยังไม่เคยใช้";

export function FeedKeys({ base, orgs, keys }: { base: string; orgs: Array<{ id: string; name: string }>; keys: FeedKey[] }) {
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ token: string; label: string } | null>(null);
  const [revoking, setRevoking] = useState<FeedKey | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>รหัสที่ออกไปแล้ว</CardTitle>
            <CardSubtitle>ระบบเก็บไว้แค่ตัวย่อ รหัสเต็มเห็นได้ครั้งเดียวตอนออก ถ้าทำหายให้ยกเลิกแล้วออกใหม่</CardSubtitle>
          </div>
          <Button onClick={() => setIssuing(true)} iconLeft={<Plus size={16} />}>
            ออกรหัสใหม่
          </Button>
        </div>
        {keys.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={KeyRound} title="ยังไม่มีรหัส" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-3 text-xs">
                <tr className="border-b border-line">
                  <th className="text-left font-medium py-2 pr-3">ชื่อ</th>
                  <th className="text-left font-medium py-2 pr-3">เห็นข้อมูล</th>
                  <th className="text-left font-medium py-2 pr-3">ตัวย่อ</th>
                  <th className="text-left font-medium py-2 pr-3">ออกเมื่อ</th>
                  <th className="text-left font-medium py-2 pr-3">ใช้ล่าสุด</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-3 font-medium">{k.label}</td>
                    <td className="py-3 pr-3">
                      {k.scopeName}
                      <span className="block text-xs text-ink-3">{k.showNames ? "ห้อง เวลา ชื่อประชุม ผู้จอง" : "ห้องและเวลาเท่านั้น"}</span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">{k.prefix}…</td>
                    <td className="py-3 pr-3 text-xs text-ink-2">
                      {when(k.createdAt)}
                      <span className="block text-ink-3">โดย {k.createdBy}</span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-ink-2">{when(k.lastUsedAt)}</td>
                    <td className="py-3 text-right">
                      {k.revokedAt ? (
                        <Badge tone="muted">ยกเลิกแล้ว</Badge>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => setRevoking(k)}>
                          ยกเลิก
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>ใช้รหัสยังไง</CardTitle>
        <div className="mt-3 space-y-3 text-sm text-ink-2">
          <p>
            <b className="text-ink-1">บอทหรือโปรแกรม</b> เรียก <code className="font-mono text-xs">GET {base}/api/feed/bookings?from=2026-11-01&to=2026-11-30</code>{" "}
            ใส่รหัสในหัว <code className="font-mono text-xs">Authorization: Bearer รหัส</code> ได้รายการจองเป็น JSON ตรงกับในระบบทุกครั้งที่เรียก
          </p>
          <p>
            <b className="text-ink-1">Google Calendar</b> เพิ่มปฏิทิน → จาก URL → วางลิงก์{" "}
            <code className="font-mono text-xs">{base}/api/feed/calendar?key=รหัส</code> Google อัปเดตเองทุกไม่กี่ชั่วโมง ถ้าต้องการตรงทันทีให้บอทดึงจากแบบแรก
          </p>
        </div>
      </Card>

      {issuing && (
        <IssueModal
          orgs={orgs}
          onClose={() => setIssuing(false)}
          onIssued={(token, label) => {
            setIssuing(false);
            setIssued({ token, label });
          }}
        />
      )}
      {issued && <RevealModal base={base} {...issued} onClose={() => setIssued(null)} />}
      {revoking && <RevokeModal k={revoking} onClose={() => setRevoking(null)} />}
    </div>
  );
}

function IssueModal({ orgs, onClose, onIssued }: { orgs: Array<{ id: string; name: string }>; onClose: () => void; onIssued: (token: string, label: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("all");
  const [showNames, setShowNames] = useState(true);
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      headerTone="default"
      title="ออกรหัสอ่านข้อมูลการจอง"
      footer={
        <div className="flex items-center gap-3 w-full">
          <p className="flex-1 text-xs text-red-600">{error}</p>
          <Button variant="ghost" onClick={onClose}>
            ปิด
          </Button>
          <Button
            disabled={pending || label.trim().length < 2}
            iconLeft={pending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await issueBookingFeedKey({ label, scope, showNames });
                if (!res.ok) return setError(res.error);
                router.refresh();
                onIssued(res.token, label);
              })
            }
          >
            ออกรหัส
          </Button>
        </div>
      }
    >
      <ModalBody>
        <div>
          <Label htmlFor="feed-label">ออกให้ใคร / ใช้ทำอะไร</Label>
          <Input id="feed-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น บอทของผู้ดูแลอาคาร" />
        </div>
        <div>
          <Label htmlFor="feed-scope">เห็นการจองของ</Label>
          <Select id="feed-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">ทุกห้องในตึก (ทุกบริษัทและลูกค้าภายนอก)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                เฉพาะ {o.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" className="mt-1" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
          แสดงชื่อประชุม บริษัท และชื่อผู้จอง ถ้าไม่เลือกจะเห็นแค่ห้องกับเวลาที่ไม่ว่าง ไม่มีเบอร์โทรหรืออีเมลของใครในทุกกรณี
        </label>
      </ModalBody>
    </Modal>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <code className="flex-1 min-w-0 break-all rounded-input border border-line bg-surface-subtle px-3 py-2 font-mono text-xs">{value}</code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          iconLeft={done ? <Check size={14} /> : <Copy size={14} />}
        >
          {done ? "คัดลอกแล้ว" : "คัดลอก"}
        </Button>
      </div>
    </div>
  );
}

function RevealModal({ base, token, label, onClose }: { base: string; token: string; label: string; onClose: () => void }) {
  const api = `${base}/api/feed/bookings`;
  const ics = `${base}/api/feed/calendar?key=${token}`;
  const note = [
    `รหัสอ่านข้อมูลการจอง EasySpace (${label}) อ่านได้อย่างเดียว`,
    "",
    `Google Calendar: เพิ่มปฏิทิน > จาก URL > วางลิงก์นี้`,
    ics,
    "",
    `บอท/โปรแกรม: GET ${api}?from=YYYY-MM-DD&to=YYYY-MM-DD`,
    `ใส่หัว Authorization: Bearer ${token}`,
    "ได้ JSON: bookings[] มี room, date, start, end, status, company, title, bookedBy, reference",
  ].join("\n");
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      headerTone="default"
      closeOnBackdrop={false}
      title="ออกรหัสแล้ว"
      subtitle="คัดลอกเก็บไว้ตอนนี้ ปิดหน้าต่างแล้วจะดูรหัสเต็มอีกไม่ได้"
      footer={
        <div className="flex justify-end w-full">
          <Button onClick={onClose}>เก็บแล้ว ปิดหน้าต่าง</Button>
        </div>
      }
    >
      <ModalBody>
        <CopyRow label="รหัส" value={token} />
        <CopyRow label="ลิงก์สำหรับ Google Calendar" value={ics} />
        <CopyRow label="ข้อความพร้อมส่งให้ผู้ใช้รหัส" value={note} />
        <p className="text-xs text-ink-3">ส่งรหัสทางแชตส่วนตัวเท่านั้น ใครมีลิงก์ปฏิทินก็เห็นรายการจองได้ ถ้าหลุดให้ยกเลิกรหัสนี้แล้วออกใหม่</p>
      </ModalBody>
    </Modal>
  );
}

function RevokeModal({ k, onClose }: { k: FeedKey; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      headerTone="default"
      title="ยกเลิกรหัสนี้?"
      subtitle={k.label}
      footer={
        <div className="flex items-center gap-3 w-full">
          <p className="flex-1 text-xs text-red-600">{error}</p>
          <Button variant="ghost" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await revokeBookingFeedKey(k.id);
                if (!res.ok) return setError(res.error);
                router.refresh();
                onClose();
              })
            }
          >
            ยกเลิกรหัส
          </Button>
        </div>
      }
    >
      <ModalBody>
        <p className="text-sm text-ink-2">บอทและปฏิทินที่ใช้รหัสนี้จะดึงข้อมูลไม่ได้ทันที ยกเลิกแล้วเปิดใช้คืนไม่ได้ ต้องออกรหัสใหม่</p>
      </ModalBody>
    </Modal>
  );
}
