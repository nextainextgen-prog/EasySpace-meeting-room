"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

/**
 * Phase 1 2FA card: enrolls a TOTP factor via Supabase Auth's MFA API.
 *
 *  enroll() → returns QR + secret → user adds in their app
 *  verify(challenge, code) → confirms factor → row in auth.mfa_factors
 *  unenroll(factorId) → removes the factor
 *
 * The `profiles.two_factor_enabled` boolean is updated server-side on auth
 * state change (see /api/auth/callback). For Phase 1 we show the same flag
 * client-side based on initial props.
 */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [stage, setStage] = useState<"idle" | "enrolling" | "confirming">(
    "idle",
  );
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(enabled);

  function startEnrollment() {
    setError(null);
    setStage("enrolling");
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "EasySpace",
      });
      if (error || !data) {
        setError(error?.message ?? "ไม่สามารถเริ่ม 2FA ได้");
        setStage("idle");
        return;
      }
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStage("confirming");
    });
  }

  function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        setError(challenge.error?.message ?? "เริ่ม challenge ล้มเหลว");
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      if (verify.error) {
        setError("รหัสยืนยันไม่ถูกต้อง ลองใหม่อีกครั้ง");
        return;
      }
      // Mark on profiles
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase
          .from("profiles")
          .update({ two_factor_enabled: true } as never)
          .eq("id", u.user.id);
      }
      setDone(true);
      setActive(true);
      setStage("idle");
    });
  }

  function disable() {
    if (!confirm("ปิด 2FA จะทำให้บัญชีปลอดภัยน้อยลง ดำเนินการต่อ?")) return;
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: list } = await supabase.auth.mfa.listFactors();
      const totp = list?.totp?.[0];
      if (totp) {
        await supabase.auth.mfa.unenroll({ factorId: totp.id });
      }
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase
          .from("profiles")
          .update({ two_factor_enabled: false } as never)
          .eq("id", u.user.id);
      }
      setActive(false);
      setDone(false);
    });
  }

  if (active && stage === "idle") {
    return (
      <div className="mt-5">
        <div className="flex items-center gap-3 rounded-input bg-emerald-50 border border-emerald-100 px-4 py-3 mb-3">
          <ShieldCheck size={18} className="text-emerald-600" strokeWidth={2} />
          <div className="flex-1 text-sm">
            <p className="font-medium text-emerald-800">2FA เปิดใช้งานอยู่</p>
            <p className="text-emerald-700 text-xs">
              ระบบจะถามรหัส 6 หลักจาก authenticator ทุกครั้งที่เข้าสู่ระบบ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={disable}
          disabled={pending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-pill border border-line text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <ShieldOff size={15} strokeWidth={2} />
          ปิด 2FA
        </button>
        {error && (
          <p className="text-xs text-red-700 mt-2">{error}</p>
        )}
      </div>
    );
  }

  if (stage === "confirming" && qrSvg && secret) {
    return (
      <form onSubmit={confirmCode} className="mt-5 space-y-4 max-w-md">
        <div className="rounded-card-sm border border-line bg-surface-subtle p-5">
          <p className="text-sm text-ink-2 mb-3">
            1. สแกน QR ด้วยแอป Authenticator (Google Authenticator, 1Password, Authy)
          </p>
          <div
            className="bg-white rounded-input p-3 inline-block"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-xs text-ink-3 mt-3">
            หรือพิมพ์ secret นี้ในแอป:
          </p>
          <code className="block mt-1.5 text-xs font-mono bg-white border border-line rounded px-2 py-1.5 select-all break-all">
            {secret}
          </code>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-ink-2 mb-1.5">
            2. ใส่รหัส 6 หลักจากแอป
          </span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            pattern="\d{6}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            placeholder="123 456"
            className="h-12 w-full px-4 rounded-input bg-white border border-line text-base font-mono tracking-[0.3em] text-center focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
          />
        </label>
        {error && (
          <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || code.length !== 6}
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
                กำลังตรวจสอบ…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} strokeWidth={2} />
                ยืนยันการเปิด 2FA
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage("idle");
              setQrSvg(null);
              setSecret(null);
              setCode("");
              setError(null);
            }}
            className="h-11 px-5 rounded-pill border border-line text-sm font-medium text-ink-2 hover:bg-surface-subtle"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-5">
      {done && (
        <div className="flex items-center gap-2 rounded-input bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3.5 py-2.5 mb-3">
          <CheckCircle2 size={16} strokeWidth={2} />
          เปิด 2FA สำเร็จ
        </div>
      )}
      <div className="flex items-start gap-3 rounded-input bg-amber-50 border border-amber-100 px-4 py-3 mb-3">
        <ShieldAlert
          size={18}
          className="text-amber-600 mt-0.5"
          strokeWidth={2}
        />
        <div className="text-sm">
          <p className="font-medium text-amber-800">2FA ยังไม่เปิด</p>
          <p className="text-amber-700 text-xs mt-0.5">
            แนะนำให้เปิดสำหรับบัญชีระดับ admin ขึ้นไป
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={startEnrollment}
        disabled={pending}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-60"
      >
        {pending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <ShieldCheck size={15} strokeWidth={2} />
        )}
        เปิด 2FA
      </button>
      {error && (
        <p className="text-xs text-red-700 mt-2">{error}</p>
      )}
    </div>
  );
}
