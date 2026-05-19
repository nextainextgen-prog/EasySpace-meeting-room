"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Building2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { upsertBankAccount, deleteBankAccount } from "@/lib/actions/settings";
import type { BankAccount } from "@/lib/data/finance";

export function BankAccountsManager({ banks }: { banks: BankAccount[] }) {
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function onDelete(id: string) {
    if (!confirm("ปิดใช้งานบัญชีนี้?")) return;
    const r = await deleteBankAccount(id);
    notify(r.ok ? "ปิดใช้งานแล้ว" : `ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold tracking-tight">บัญชีธนาคาร</p>
            <p className="text-xs text-ink-3 mt-0.5">
              {banks.length} บัญชี · ใช้แสดงในใบเสร็จและตอนแจ้งการโอน
            </p>
          </div>
          <Button
            size="sm"
            iconLeft={<Plus size={12} />}
            onClick={() =>
              setEditing({
                id: "",
                bank_name: "",
                account_number: "",
                account_name: "",
                is_default: false,
                is_active: true,
                display_order: banks.length,
              })
            }
          >
            เพิ่มบัญชี
          </Button>
        </div>

        {banks.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">ยังไม่มีบัญชี</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {banks.map((b) => (
              <li
                key={b.id}
                className="rounded-input border border-line p-3 flex items-start gap-3 group"
              >
                <span className="w-9 h-9 rounded-input bg-primary-50 text-primary-700 grid place-items-center shrink-0">
                  <Building2 size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold tracking-tight text-sm">
                      {b.bank_name}
                    </p>
                    {b.is_default && (
                      <Badge tone="primary" className="!text-[9px]">
                        default
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-3 font-mono tabular-nums">
                    {b.account_number}
                  </p>
                  <p className="text-[11px] text-ink-3">{b.account_name}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => setEditing(b)}
                    className="w-7 h-7 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => onDelete(b.id)}
                    className="w-7 h-7 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 grid place-items-center"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <BankAccountForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("บันทึกบัญชีเรียบร้อย");
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

function BankAccountForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: BankAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    bank_name: initial.bank_name,
    account_number: initial.account_number,
    account_name: initial.account_name,
    is_default: initial.is_default,
    display_order: initial.display_order,
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await upsertBankAccount({
        id: form.id,
        bank_name: form.bank_name,
        account_number: form.account_number,
        account_name: form.account_name,
        is_default: form.is_default,
        display_order: form.display_order,
      });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-1/40 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md surface-card !p-0 overflow-hidden"
      >
        <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <p className="font-bold tracking-tight">
            {form.id ? "แก้ไขบัญชี" : "เพิ่มบัญชีใหม่"}
          </p>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <Label>ธนาคาร *</Label>
            <Input
              value={form.bank_name}
              onChange={(e) =>
                setForm({ ...form, bank_name: e.target.value })
              }
              placeholder="ไทยพาณิชย์ / กสิกรไทย / กรุงเทพ"
              required
            />
          </div>
          <div>
            <Label>เลขที่บัญชี *</Label>
            <Input
              value={form.account_number}
              onChange={(e) =>
                setForm({ ...form, account_number: e.target.value })
              }
              placeholder="123-4-56789-0"
              required
            />
          </div>
          <div>
            <Label>ชื่อบัญชี *</Label>
            <Input
              value={form.account_name}
              onChange={(e) =>
                setForm({ ...form, account_name: e.target.value })
              }
              placeholder="บริษัท อีซี่สเปซ จำกัด"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) =>
                setForm({ ...form, is_default: e.target.checked })
              }
              className="w-4 h-4 accent-primary-600"
            />
            ใช้เป็นบัญชี default
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
