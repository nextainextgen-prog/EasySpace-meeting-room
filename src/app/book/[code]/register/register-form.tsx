"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { registerMember } from "@/lib/actions/members";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

interface Props {
  inviteCode: string;
  allowedDomains: string[];
}

const REGISTER_COOKIE = "easyspace.register_intent";

export function RegisterForm({ inviteCode, allowedDomains }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [pending, startTransition] = useTransition();
  const [oauthPending, setOauthPending] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success" }
    | { kind: "error"; message: string; allowedDomains?: string[] }
    | null
  >(null);
  const [showManual, setShowManual] = useState(false);

  function requireBasics(): boolean {
    if (!fullName.trim()) {
      setFeedback({ kind: "error", message: "กรอกชื่อ-นามสกุล" });
      return false;
    }
    return true;
  }

  async function continueWithGoogle() {
    setFeedback(null);
    if (!requireBasics()) return;

    const intent = {
      inviteCode,
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      position: position.trim() || undefined,
      department: department.trim() || undefined,
    };
    document.cookie = `${REGISTER_COOKIE}=${encodeURIComponent(
      JSON.stringify(intent),
    )}; path=/; max-age=900; SameSite=Lax`;

    setOauthPending(true);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/api/auth/callback` },
    });
    if (error) {
      setOauthPending(false);
      setFeedback({
        kind: "error",
        message: `เปิด Google ไม่สำเร็จ: ${error.message}`,
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!requireBasics()) return;
    if (!email.trim()) {
      setFeedback({ kind: "error", message: "กรอกอีเมล" });
      return;
    }
    if (allowedDomains.length > 0) {
      const lower = email.toLowerCase();
      const ok = allowedDomains.some((d) =>
        lower.endsWith(`@${d.toLowerCase()}`),
      );
      if (!ok) {
        setFeedback({
          kind: "error",
          message: "อีเมลไม่ตรงกับ domain ที่อนุญาต",
          allowedDomains,
        });
        return;
      }
    }

    startTransition(async () => {
      const res = await registerMember({
        inviteCode,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone || undefined,
        position: position || undefined,
        department: department || undefined,
      });
      if (!res.ok) {
        setFeedback({
          kind: "error",
          message:
            res.error === "domain_not_allowed"
              ? "อีเมลไม่ตรงกับ domain ที่อนุญาต"
              : res.error === "invite_invalid"
                ? "ลิงก์เชิญไม่ถูกต้อง"
                : `ลงทะเบียนไม่สำเร็จ: ${res.error}`,
          allowedDomains:
            res.error === "domain_not_allowed"
              ? res.allowedDomains
              : undefined,
        });
        return;
      }
      setFeedback({ kind: "success" });
      setTimeout(
        () =>
          router.push(
            `/member-login?registered=1&invite=${encodeURIComponent(inviteCode)}`,
          ),
        800,
      );
    });
  }

  if (feedback?.kind === "success") {
    return (
      <div className="rounded-card-sm bg-emerald-50 border border-emerald-200 p-6 text-center">
        <div className="w-12 h-12 rounded-pill bg-emerald-500 text-white grid place-items-center mx-auto">
          <Check size={22} strokeWidth={2.5} />
        </div>
        <p className="mt-3 font-semibold tracking-tight text-emerald-900">
          ลงทะเบียนสำเร็จ
        </p>
        <p className="mt-1 text-xs text-emerald-700">
          กำลังพาไปหน้าเข้าสู่ระบบ...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Name — primary, always shown */}
      <div>
        <Label>ชื่อ-นามสกุล *</Label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="เช่น สมชาย ใจดี"
          required
        />
      </div>

      {feedback?.kind === "error" && (
        <div className="flex items-start gap-2 rounded-input bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p>{feedback.message}</p>
            {feedback.allowedDomains &&
              feedback.allowedDomains.length > 0 && (
                <p className="mt-1 text-[11px]">
                  Domains:{" "}
                  {feedback.allowedDomains.map((d) => `@${d}`).join(" / ")}
                </p>
              )}
          </div>
        </div>
      )}

      {/* Primary CTA — Google */}
      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={oauthPending || pending}
        className={cn(
          "w-full h-12 rounded-pill bg-white border border-line",
          "text-ink-1 text-[15px] font-semibold tracking-tight",
          "inline-flex items-center justify-center gap-3",
          "hover:bg-surface-subtle/60 hover:border-line transition",
          "shadow-card active:scale-[0.99]",
          "disabled:opacity-60 disabled:pointer-events-none",
        )}
      >
        {oauthPending ? (
          <Loader2 size={18} className="animate-spin text-primary-600" />
        ) : (
          <GoogleColorIcon />
        )}
        <span>
          {oauthPending
            ? "กำลังเปิด Google..."
            : "ดำเนินการต่อด้วย Google"}
        </span>
      </button>
      <p className="text-[11px] text-ink-3 text-center">
        วิธีที่แนะนำ — เร็ว ปลอดภัย ไม่ต้องตั้งรหัสผ่าน
      </p>

      {/* Manual fallback (collapsible) */}
      <button
        type="button"
        onClick={() => setShowManual((s) => !s)}
        className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-ink-3 hover:text-ink-1 pt-2"
      >
        <ChevronDown
          size={12}
          className={cn("transition", showManual && "rotate-180")}
        />
        หรือลงทะเบียนด้วยอีเมล (ไม่ใช้ Google)
      </button>

      {showManual && (
        <form
          onSubmit={handleSubmit}
          className="mt-2 space-y-3 pt-3 border-t border-line-soft"
        >
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                allowedDomains.length > 0
                  ? `you@${allowedDomains[0]}`
                  : "you@example.com"
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ตำแหน่ง (ไม่บังคับ)</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Manager"
              />
            </div>
            <div>
              <Label>แผนก (ไม่บังคับ)</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Sales"
              />
            </div>
          </div>
          <div>
            <Label>เบอร์โทร (ไม่บังคับ)</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          <button
            type="submit"
            disabled={pending || oauthPending}
            className={cn(
              "w-full h-11 rounded-pill bg-ink-1 text-white",
              "text-sm font-semibold tracking-tight",
              "inline-flex items-center justify-center gap-2",
              "hover:bg-ink-2 transition",
              "disabled:opacity-60 disabled:pointer-events-none",
            )}
          >
            {pending ? "กำลังลงทะเบียน..." : "ลงทะเบียน"}
            {!pending && <ArrowRight size={14} />}
          </button>
        </form>
      )}
    </div>
  );
}

function GoogleColorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
