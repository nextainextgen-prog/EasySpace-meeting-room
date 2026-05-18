"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="mt-7 rounded-card-sm bg-primary-50 border border-primary-100 p-5 text-center">
        <div className="w-12 h-12 rounded-full bg-primary-600 text-white grid place-items-center mx-auto mb-3">
          <CheckCircle2 size={24} strokeWidth={2} />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-ink-1">
          ส่งลิงก์ไปแล้ว
        </h3>
        <p className="text-sm text-ink-2 mt-1.5">
          ตรวจสอบกล่องจดหมายของ <span className="font-medium">{email}</span>{" "}
          แล้วคลิกลิงก์เพื่อตั้งรหัสผ่านใหม่
        </p>
        <p className="text-xs text-ink-3 mt-3">
          ไม่ได้รับอีเมล? ตรวจในโฟลเดอร์ spam หรือลองอีกครั้งใน 60 วินาที
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div
        className={cn(
          "group flex items-center gap-3 h-14 px-5 rounded-pill bg-white",
          "border border-line transition-colors",
          "focus-within:border-primary-500 focus-within:ring-4 focus-within:ring-primary-50",
        )}
      >
        <span className="text-ink-3 group-focus-within:text-primary-500 transition-colors">
          <Mail size={18} strokeWidth={1.75} />
        </span>
        <input
          type="email"
          required
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={pending}
          className="flex-1 bg-transparent text-sm text-ink-1 placeholder:text-ink-3 outline-none"
        />
      </div>

      {error && (
        <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "w-full h-14 rounded-pill bg-primary-gradient text-white",
          "text-base font-semibold tracking-tight shadow-hero",
          "hover:opacity-95 active:scale-[0.99] transition-all duration-200",
          "disabled:opacity-60 disabled:pointer-events-none",
          "inline-flex items-center justify-center gap-2",
        )}
      >
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>กำลังส่งลิงก์…</span>
          </>
        ) : (
          <>
            <span>ส่งลิงก์รีเซ็ต</span>
            <ArrowRight size={18} strokeWidth={2} />
          </>
        )}
      </button>
    </form>
  );
}
