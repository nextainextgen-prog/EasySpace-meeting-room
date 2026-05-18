"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

function scorePassword(p: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (p.length < 8) return { score: 0, label: "สั้นเกินไป" };
  let s = 0;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const labels = ["พอใช้", "ดี", "ดีมาก", "ดีเยี่ยม"] as const;
  return {
    score: Math.min(s, 3) as 0 | 1 | 2 | 3,
    label: labels[Math.min(s, 3)],
  };
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const strength = scorePassword(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("รหัสผ่านอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านยืนยันไม่ตรงกัน");
      return;
    }
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login?notice=password_updated");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
      <PillInput
        icon={<KeyRound size={18} strokeWidth={1.75} />}
        type={showPassword ? "text" : "password"}
        placeholder="รหัสผ่านใหม่"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        disabled={pending || !ready}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-ink-3 hover:text-ink-2 p-1 rounded"
            tabIndex={-1}
            aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          >
            {showPassword ? (
              <EyeOff size={18} strokeWidth={1.75} />
            ) : (
              <Eye size={18} strokeWidth={1.75} />
            )}
          </button>
        }
      />

      {password && (
        <div className="px-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= strength.score
                    ? strength.score >= 3
                      ? "bg-emerald-500"
                      : strength.score === 2
                        ? "bg-primary-500"
                        : "bg-amber-400"
                    : "bg-line",
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-ink-3 mt-1.5">
            ความปลอดภัย:{" "}
            <span className="text-ink-2 font-medium">{strength.label}</span>
          </p>
        </div>
      )}

      <PillInput
        icon={<ShieldCheck size={18} strokeWidth={1.75} />}
        type={showPassword ? "text" : "password"}
        placeholder="ยืนยันรหัสผ่านใหม่"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        disabled={pending || !ready}
      />

      {error && (
        <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
          {error}
        </div>
      )}

      {!ready && (
        <div className="rounded-input bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3.5 py-2.5">
          กำลังตรวจสอบลิงก์รีเซ็ต… ถ้าค้างนาน
          แสดงว่าลิงก์อาจหมดอายุ — ขอลิงก์ใหม่ที่หน้า ลืมรหัสผ่าน
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !ready}
        className={cn(
          "mt-2 w-full h-14 rounded-pill bg-primary-gradient text-white",
          "text-base font-semibold tracking-tight",
          "shadow-hero hover:opacity-95 active:scale-[0.99]",
          "transition-all duration-200",
          "disabled:opacity-60 disabled:pointer-events-none",
          "inline-flex items-center justify-center gap-2",
        )}
      >
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>กำลังบันทึก…</span>
          </>
        ) : (
          <>
            <span>บันทึกรหัสผ่านใหม่</span>
            <ArrowRight size={18} strokeWidth={2} />
          </>
        )}
      </button>
    </form>
  );
}

type PillInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
};

function PillInput({ icon, trailing, className, ...rest }: PillInputProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 h-14 px-5 rounded-pill bg-white",
        "border border-line transition-colors",
        "focus-within:border-primary-500 focus-within:ring-4 focus-within:ring-primary-50",
        className,
      )}
    >
      <span className="text-ink-3 group-focus-within:text-primary-500 transition-colors">
        {icon}
      </span>
      <input
        {...rest}
        className="flex-1 bg-transparent text-sm text-ink-1 placeholder:text-ink-3 outline-none"
      />
      {trailing}
    </div>
  );
}
