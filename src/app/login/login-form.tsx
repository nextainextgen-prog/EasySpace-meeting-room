"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(
          error.message.toLowerCase().includes("invalid")
            ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
            : error.message,
        );
        return;
      }
      if (typeof window !== "undefined") {
        if (remember) {
          window.localStorage.setItem("easyspace.remember", "1");
        } else {
          window.localStorage.removeItem("easyspace.remember");
        }
      }
      router.replace(next ?? "/admin/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={signInWithEmail} className="mt-7 space-y-4">
      <PillInput
        icon={<Mail size={18} strokeWidth={1.75} />}
        type="email"
        placeholder="อีเมล"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        disabled={pending}
      />

      <PillInput
        icon={<KeyRound size={18} strokeWidth={1.75} />}
        type={showPassword ? "text" : "password"}
        placeholder="รหัสผ่าน"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        disabled={pending}
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

      {error && (
        <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "w-4 h-4 rounded-[5px] border grid place-items-center transition-colors",
              remember
                ? "bg-primary-600 border-primary-600"
                : "bg-white border-line",
            )}
          >
            {remember && (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className="text-white"
              >
                <path
                  d="M1.5 5L4 7.5L8.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className="text-sm text-ink-2">จำการเข้าสู่ระบบ</span>
        </label>

        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          ลืมรหัสผ่าน?
        </Link>
      </div>

      <button
        type="submit"
        disabled={pending}
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
            <span>กำลังเข้าสู่ระบบ…</span>
          </>
        ) : (
          <>
            <span>เข้าสู่ระบบ</span>
            <ArrowRight size={18} strokeWidth={2} />
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-ink-3 pt-2">
        เป็นสมาชิกในตึก?{" "}
        <Link
          href="/member-login"
          className="text-primary-600 font-medium hover:underline"
        >
          เข้าสู่ระบบสมาชิก
        </Link>
      </p>
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

