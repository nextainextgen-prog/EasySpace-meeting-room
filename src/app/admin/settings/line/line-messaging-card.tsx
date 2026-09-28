"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveSecret, testLineMessaging, updatePublicConfig } from "@/lib/actions/online-payment";
import { cn } from "@/lib/cn";

export function LineMessagingCard({
  liffId: initialLiff,
  token,
  baseUrl,
}: {
  liffId: string;
  token: { masked: string | null; source: "env" | "db" | "none" };
  baseUrl: string;
}) {
  const [liffId, setLiffId] = useState(initialLiff);
  const [tok, setTok] = useState("");
  const [masked, setMasked] = useState(token.masked);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = Boolean(masked) && Boolean(initialLiff);

  function flash(tone: "ok" | "err", text: string) {
    setMsg({ tone, text });
    setTimeout(() => setMsg(null), 5000);
  }
  function copy(text: string, k: string) {
    void navigator.clipboard.writeText(text);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  }

  const endpoint = `${baseUrl}/rooms`;
  const richMenu = liffId ? `https://liff.line.me/${liffId}` : null;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold tracking-tight">ส่งข้อความถึงลูกค้า (Messaging API + LIFF)</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Flex message ยืนยันการจอง / ยืนยันการชำระเงิน / ยกเลิก เด้งเข้าแชท LINE ของลูกค้า
          </p>
        </div>
        <Badge tone={ready ? "success" : "warning"} className="!text-[10px]">
          {ready ? "พร้อมใช้งาน" : "ยังไม่ได้เชื่อม"}
        </Badge>
      </div>

      <div className="space-y-3">
        {/* Token */}
        <div className="rounded-input border border-line bg-surface-subtle/60 p-3">
          <p className="mb-1 text-sm font-semibold tracking-tight">Channel access token (long-lived)</p>
          <p className="mb-2 text-xs text-ink-3">
            LINE Developers → Messaging API channel ของ OA → แท็บ Messaging API → Channel access token
          </p>
          {token.source === "env" ? (
            <p className="text-xs text-ink-2">
              ใช้ค่าจาก <code className="font-mono">LINE_CHANNEL_ACCESS_TOKEN</code> ({masked})
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={tok}
                onChange={(e) => setTok(e.target.value)}
                placeholder={masked ? `ปัจจุบัน ${masked} — วางค่าใหม่เพื่อเปลี่ยน` : "วาง Channel access token"}
                className="!h-9 flex-1 !text-sm"
              />
              <Button
                size="sm"
                disabled={pending || !tok.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await saveSecret("lineToken", tok);
                    if (!r.ok) return flash("err", r.error);
                    setMasked(r.masked ?? null);
                    setTok("");
                    flash("ok", "บันทึก token แล้ว (ทดสอบเชื่อมต่อผ่าน)");
                  })
                }
              >
                บันทึก
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await testLineMessaging();
                if (r.ok) flash("ok", `เชื่อมต่อสำเร็จ · ${r.displayName} (${r.basicId})`);
                else flash("err", r.message);
              })
            }
          >
            ทดสอบเชื่อมต่อ
          </Button>
        </div>

        {/* LIFF */}
        <div>
          <Label>LIFF ID</Label>
          <div className="flex gap-2">
            <Input
              value={liffId}
              onChange={(e) => setLiffId(e.target.value.trim())}
              placeholder="เช่น 2001234567-AbCdEfGh"
              className="flex-1"
            />
            <Button
              size="sm"
              disabled={pending || liffId === initialLiff}
              onClick={() =>
                start(async () => {
                  const r = await updatePublicConfig({ liff_id: liffId });
                  if (!r.ok) return flash("err", r.error);
                  flash("ok", "บันทึก LIFF ID แล้ว");
                })
              }
            >
              บันทึก
            </Button>
          </div>
        </div>

        <div className="rounded-input border border-primary-100 bg-primary-50/40 p-3 text-xs text-ink-2">
          <p className="mb-2 font-semibold text-primary-700">วิธีตั้งค่าใน LINE Developers</p>
          <ol className="list-inside list-decimal space-y-1.5">
            <li>
              สร้าง <b>LINE Login channel</b> ใน Provider เดียวกับ Messaging API ของ OA (สำคัญ — ไม่งั้นส่งข้อความไม่ถึง)
            </li>
            <li>
              แท็บ LIFF → Add · Size: <b>Full</b> · Scope: <b>profile</b> · Bot link feature: <b>On (Aggressive)</b>
            </li>
            <li className="space-y-1">
              <span>Endpoint URL:</span>
              <CopyRow value={endpoint} copied={copied === "ep"} onCopy={() => copy(endpoint, "ep")} />
            </li>
            <li>นำ LIFF ID ที่ได้มาใส่ด้านบน แล้วกดบันทึก</li>
            {richMenu && (
              <li className="space-y-1">
                <span>
                  เปลี่ยนลิงก์ปุ่มริชเมนู LINE OA เป็น (เพื่อให้ระบบรู้ว่าลูกค้าคือใครและส่งข้อความได้):
                </span>
                <CopyRow value={richMenu} copied={copied === "rm"} onCopy={() => copy(richMenu, "rm")} />
              </li>
            )}
          </ol>
          <p className="mt-2 text-ink-3">
            ลูกค้าที่สแกน QR ด้วยกล้องมือถือจะเห็นปุ่ม &quot;รับการยืนยันทาง LINE&quot; หลังจอง เพื่อผูกกับ LINE ได้เช่นกัน
          </p>
        </div>

        {msg && (
          <p className={cn("text-xs", msg.tone === "ok" ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>
        )}
      </div>
    </Card>
  );
}

function CopyRow({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-md bg-white px-2 py-1 font-mono text-ink-1 ring-1 ring-line">{value}</code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex h-7 items-center gap-1 rounded-pill border border-primary-100 bg-white px-2.5 text-[11px] font-semibold text-primary-700"
      >
        {copied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="light" />}
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </span>
  );
}
