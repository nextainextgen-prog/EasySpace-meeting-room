"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Send, Wallet, Ban, FileText, Loader2 } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal, ModalBody } from "@/components/ui/modal";
import { recordOrgInvoicePayment, sendOrgInvoice, voidOrgInvoice } from "@/lib/actions/org-billing";
import type { InvoiceEvent, InvoicePayment, OrgInvoice, OrgMonth } from "@/lib/server/org-billing";
import { IssueModal } from "../billing-board";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const METHOD: Record<string, string> = {
  bank_transfer: "โอนเงิน",
  promptpay: "พร้อมเพย์",
  qr: "QR",
  cash: "เงินสด",
  credit_card: "บัตรเครดิต",
};

const ACTION: Record<string, string> = {
  issued: "ออกใบแจ้งหนี้",
  reissued: "ออกใบแจ้งหนี้แทนใบที่ยกเลิก",
  sent: "ส่งใบแจ้งหนี้",
  payment: "บันทึกรับเงิน",
  void: "ยกเลิกใบแจ้งหนี้",
};

function describe(e: InvoiceEvent): string {
  const d = e.detail ?? {};
  switch (e.action) {
    case "issued":
    case "reissued":
      return `ยอดชำระ ${baht(Number(d.netPayable ?? 0))} บาท · ${d.bookings ?? 0} รายการ`;
    case "sent":
      return d.viaEmail ? `อีเมลถึง ${d.to}` : `บันทึกว่าส่งให้ ${d.to} แล้ว`;
    case "payment":
      return `${baht(Number(d.amount ?? 0))} บาท · ${METHOD[String(d.method)] ?? d.method}${d.reference ? ` · อ้างอิง ${d.reference}` : ""} · คงค้าง ${baht(Number(d.balance ?? 0))}`;
    case "void":
      return `เหตุผล: ${d.reason ?? "-"}`;
    default:
      return "";
  }
}

export function InvoiceActions({
  inv,
  payments,
  events,
  month,
}: {
  inv: OrgInvoice;
  payments: InvoicePayment[];
  events: InvoiceEvent[];
  month: OrgMonth | null;
}) {
  const [modal, setModal] = useState<null | "send" | "pay" | "void" | "reissue">(null);
  const due = Math.max(0, Math.round((inv.netPayable - inv.paidAmount) * 100) / 100);
  const live = inv.status !== "void";

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>ยอดค้าง</CardTitle>
        <p className="mt-2 text-[28px] font-bold tracking-tighter tabular-nums">{baht(due)} บาท</p>
        <p className="text-xs text-ink-3">
          จากยอดชำระ {baht(inv.netPayable)} · รับแล้ว {baht(inv.paidAmount)}
        </p>
        <div className="mt-4 grid gap-2">
          <Button variant="secondary" onClick={() => window.print()} iconLeft={<Printer size={16} />}>
            พิมพ์ / บันทึก PDF
          </Button>
          {live && (
            <Button variant="secondary" onClick={() => setModal("send")} iconLeft={<Send size={16} />}>
              {inv.sentAt ? "ส่งอีกครั้ง" : "ส่งให้บริษัท"}
            </Button>
          )}
          {live && due > 0 && (
            <Button onClick={() => setModal("pay")} iconLeft={<Wallet size={16} />}>
              บันทึกรับเงิน
            </Button>
          )}
          {live && inv.paidAmount === 0 && (
            <Button variant="danger" onClick={() => setModal("void")} iconLeft={<Ban size={16} />}>
              ยกเลิกใบนี้
            </Button>
          )}
          {!live && month && month.amount > 0 && (
            <Button onClick={() => setModal("reissue")} iconLeft={<FileText size={16} />}>
              ออกใบใหม่จากยอดล่าสุด ({baht(month.amount)} บาท)
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>การรับเงิน</CardTitle>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">ยังไม่มี</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="rounded-input border border-line px-3 py-2">
                <div className="flex justify-between font-medium tabular-nums">
                  <span>{p.paidOn}</span>
                  <span>{baht(p.amount)}</span>
                </div>
                <p className="text-xs text-ink-3">
                  {METHOD[p.method] ?? p.method}
                  {p.reference && ` · ${p.reference}`} · บันทึกโดย {p.recordedByName ?? "-"}
                </p>
                {p.notes && <p className="text-xs text-ink-2">{p.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>ประวัติ</CardTitle>
        <CardSubtitle>ทุกการกระทำกับใบนี้ บันทึกไว้แก้ไม่ได้</CardSubtitle>
        <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary-600" />
              <p className="font-medium">{ACTION[e.action] ?? e.action}</p>
              <p className="text-xs text-ink-2">{describe(e)}</p>
              <p className="text-xs text-ink-3">
                {when(e.createdAt)} · {e.actorName ?? "ระบบ"}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      {modal === "send" && <SendModal inv={inv} onClose={() => setModal(null)} />}
      {modal === "pay" && <PayModal inv={inv} due={due} onClose={() => setModal(null)} />}
      {modal === "void" && <VoidModal inv={inv} onClose={() => setModal(null)} />}
      {modal === "reissue" && month && (
        <IssueModal month={month} period={inv.period} replacesId={inv.id} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "ทำไม่สำเร็จ");
      done();
      router.refresh();
    });
  };
  return { pending, error, run };
}

function Footer({ error, pending, label, onClose, onSubmit, disabled, danger }: {
  error: string | null;
  pending: boolean;
  label: string;
  onClose: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <p className="flex-1 text-xs text-red-600">{error}</p>
      <Button variant="ghost" onClick={onClose}>
        ปิด
      </Button>
      <Button variant={danger ? "danger" : "primary"} onClick={onSubmit} disabled={pending || disabled} iconLeft={pending ? <Loader2 size={16} className="animate-spin" /> : undefined}>
        {label}
      </Button>
    </div>
  );
}

function SendModal({ inv, onClose }: { inv: OrgInvoice; onClose: () => void }) {
  const { pending, error, run } = useAction();
  const [to, setTo] = useState(inv.billTo.email);
  const [viaEmail, setViaEmail] = useState(true);
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      headerTone="default"
      title="ส่งใบแจ้งหนี้ให้บริษัท"
      subtitle={inv.invoiceNo}
      footer={
        <Footer
          error={error}
          pending={pending}
          label={viaEmail ? "ส่งอีเมล" : "บันทึกว่าส่งแล้ว"}
          onClose={onClose}
          disabled={!to.trim()}
          onSubmit={() => run(() => sendOrgInvoice({ id: inv.id, to, viaEmail }), onClose)}
        />
      }
    >
      <ModalBody>
        <div>
          <Label htmlFor="send-to">อีเมลผู้รับ</Label>
          <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" className="mt-1" checked={viaEmail} onChange={(e) => setViaEmail(e.target.checked)} />
          ส่งรายละเอียดทางอีเมลจากระบบ ถ้าไม่เลือก ระบบจะบันทึกเพียงว่าส่งให้บริษัทเองแล้ว เช่น ส่งไฟล์ PDF ทางช่องทางอื่น
        </label>
      </ModalBody>
    </Modal>
  );
}

function PayModal({ inv, due, onClose }: { inv: OrgInvoice; due: number; onClose: () => void }) {
  const { pending, error, run } = useAction();
  const [amount, setAmount] = useState(String(due));
  const [paidOn, setPaidOn] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const n = Number(amount);
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      headerTone="default"
      title="บันทึกรับเงิน"
      subtitle={`${inv.invoiceNo} · ค้าง ${baht(due)} บาท`}
      footer={
        <Footer
          error={error}
          pending={pending}
          label={`บันทึก ${Number.isFinite(n) ? baht(n) : "-"} บาท`}
          onClose={onClose}
          disabled={!(n > 0)}
          onSubmit={() =>
            run(
              () =>
                recordOrgInvoicePayment({
                  id: inv.id,
                  amount: n,
                  paidOn,
                  method: method as "bank_transfer",
                  reference: reference || undefined,
                  notes: notes || undefined,
                }),
              onClose,
            )
          }
        />
      }
    >
      <ModalBody>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pay-amount">จำนวนเงิน</Label>
            <Input id="pay-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pay-date">วันที่รับเงิน</Label>
            <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pay-method">ช่องทาง</Label>
            <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHOD).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pay-ref">เลขอ้างอิง</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="เลขที่รายการโอน" />
          </div>
        </div>
        <div>
          <Label htmlFor="pay-notes">หมายเหตุ</Label>
          <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs text-ink-3">ระบบไม่ให้บันทึกเกินยอดค้าง และไม่ให้ใช้เลขอ้างอิงซ้ำในใบเดียวกัน</p>
      </ModalBody>
    </Modal>
  );
}

function VoidModal({ inv, onClose }: { inv: OrgInvoice; onClose: () => void }) {
  const { pending, error, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      headerTone="default"
      title="ยกเลิกใบแจ้งหนี้"
      subtitle={inv.invoiceNo}
      footer={
        <Footer
          error={error}
          pending={pending}
          danger
          label="ยืนยันยกเลิก"
          onClose={onClose}
          disabled={reason.trim().length < 3}
          onSubmit={() => run(() => voidOrgInvoice({ id: inv.id, reason }), onClose)}
        />
      }
    >
      <ModalBody>
        <p className="text-sm text-ink-2">
          ใบที่ยกเลิกยังเก็บไว้ดูย้อนหลังได้ เลขที่ใบนี้จะไม่ถูกนำกลับมาใช้อีก หลังยกเลิกจะออกใบใหม่จากยอดล่าสุดได้
        </p>
        <div>
          <Label htmlFor="void-reason">เหตุผล</Label>
          <Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น มีการแก้การจองหลังออกใบ" />
        </div>
      </ModalBody>
    </Modal>
  );
}
