"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: "danger" | "warning" | "info" | "success";
  suggestions: string[];
};

const COMMON = new Set([
  "password",
  "12345678",
  "qwerty",
  "abc12345",
  "letmein",
  "iloveyou",
  "admin",
  "easyspace",
]);

function scorePassword(pw: string): Strength {
  if (!pw)
    return {
      score: 0,
      label: "—",
      tone: "danger",
      suggestions: [],
    };
  let score = 0;
  const sug: string[] = [];

  if (pw.length >= 12) score += 2;
  else if (pw.length >= 8) score += 1;
  else sug.push("ใช้อย่างน้อย 12 ตัวอักษร");

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const varieties = [hasLower, hasUpper, hasDigit, hasSymbol].filter(
    Boolean,
  ).length;
  score += Math.max(0, varieties - 2);
  if (varieties < 3)
    sug.push("ผสมตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ");

  if (COMMON.has(pw.toLowerCase())) {
    score = 0;
    sug.push("รหัสนี้ใช้กันแพร่หลาย — เลือกใหม่");
  }

  const repeats = /(.)\1{2,}/.test(pw);
  if (repeats) {
    score = Math.max(0, score - 1);
    sug.push("หลีกเลี่ยงตัวอักษรซ้ำเรียงกัน");
  }

  const clamped = Math.min(4, Math.max(0, score)) as Strength["score"];
  const meta: Array<{ label: string; tone: Strength["tone"] }> = [
    { label: "อ่อนมาก", tone: "danger" },
    { label: "อ่อน", tone: "danger" },
    { label: "พอใช้", tone: "warning" },
    { label: "ดี", tone: "info" },
    { label: "แข็งแรง", tone: "success" },
  ];
  return {
    score: clamped,
    label: meta[clamped].label,
    tone: meta[clamped].tone,
    suggestions: sug.slice(0, 2),
  };
}

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const strength = useMemo(() => scorePassword(next), [next]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (strength.score < 2) {
      setError("รหัสผ่านอ่อนเกินไป — เพิ่มความซับซ้อนก่อน");
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
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="block text-xs font-medium text-ink-2">
            รหัสผ่านใหม่
          </span>
          <button
            type="button"
            onClick={() => setShowNext((s) => !s)}
            className="text-[11px] text-ink-3 hover:text-ink-1 inline-flex items-center gap-0.5"
          >
            {showNext ? <EyeOff size={11} /> : <Eye size={11} />}
            {showNext ? "ซ่อน" : "ดู"}
          </button>
        </div>
        <input
          type={showNext ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          disabled={pending}
          required
          className="h-11 w-full px-4 rounded-input bg-white border border-line text-sm text-ink-1 focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50 transition-all"
        />
        {next.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "flex-1 h-1.5 rounded-pill transition",
                    i < strength.score
                      ? strength.tone === "danger"
                        ? "bg-red-500"
                        : strength.tone === "warning"
                          ? "bg-amber-500"
                          : strength.tone === "info"
                            ? "bg-blue-500"
                            : "bg-emerald-500"
                      : "bg-line",
                  )}
                />
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-[11px] font-semibold tracking-tight",
                  strength.tone === "danger" && "text-red-700",
                  strength.tone === "warning" && "text-amber-700",
                  strength.tone === "info" && "text-blue-700",
                  strength.tone === "success" && "text-emerald-700",
                )}
              >
                {strength.label}
              </span>
              {strength.suggestions.length > 0 && (
                <span className="text-[10px] text-ink-3">
                  {strength.suggestions.join(" · ")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
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
