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

  async function signInWithGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/api/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
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

      <div className="flex items-center gap-3 pt-1">
        <span className="flex-1 h-px bg-line" />
        <span className="text-[11px] text-ink-3 uppercase tracking-[0.12em]">
          หรือ
        </span>
        <span className="flex-1 h-px bg-line" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className={cn(
          "w-full h-12 rounded-pill bg-white border border-line",
          "text-sm font-medium text-ink-1",
          "hover:bg-surface-subtle active:scale-[0.99] transition-all",
          "disabled:opacity-60 disabled:pointer-events-none",
          "inline-flex items-center justify-center gap-2.5",
        )}
      >
        <GoogleIcon />
        <span>เข้าสู่ระบบด้วย Google</span>
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
