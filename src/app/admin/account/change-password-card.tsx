"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (next !== confirm) {
      setError("ยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    if (current === next) {
      setError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม");
      return;
    }
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      // Verify current password by trying signInWithPassword on this user's email.
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.email) {
        setError("ไม่พบเซสชัน — เข้าสู่ระบบใหม่");
        return;
      }
      const verify = await supabase.auth.signInWithPassword({
        email: u.user.email,
        password: current,
      });
      if (verify.error) {
        setError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        setError(error.message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 max-w-md">
      <PwField
        label="รหัสผ่านปัจจุบัน"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        disabled={pending}
      />
      <PwField
        label="รหัสผ่านใหม่"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={pending}
      />
      <PwField
        label="ยืนยันรหัสผ่านใหม่"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={pending}
      />
      {error && (
        <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-input bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3.5 py-2.5">
          <CheckCircle2 size={16} strokeWidth={2} />
          เปลี่ยนรหัสผ่านสำเร็จ
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-11 px-5 rounded-pill bg-primary-600 hover:bg-primary-700 text-white",
          "text-sm font-semibold tracking-tight",
          "disabled:opacity-60 disabled:pointer-events-none",
          "inline-flex items-center gap-2",
        )}
      >
        {pending ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            กำลังบันทึก…
          </>
        ) : (
          <>
            <KeyRound size={15} strokeWidth={2} />
            อัปเดตรหัสผ่าน
          </>
        )}
      </button>
    </form>
  );
}

function PwField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-2 mb-1.5">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required
        className="h-11 w-full px-4 rounded-input bg-white border border-line text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50 transition-all"
      />
    </label>
  );
}
