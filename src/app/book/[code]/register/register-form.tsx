"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { registerMember } from "@/lib/actions/members";

interface Props {
  inviteCode: string;
  allowedDomains: string[];
}

export function RegisterForm({ inviteCode, allowedDomains }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success" }
    | { kind: "error"; message: string; allowedDomains?: string[] }
    | null
  >(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!fullName.trim() || !email.trim()) {
      setFeedback({ kind: "error", message: "กรอกชื่อและ email" });
      return;
    }

    if (allowedDomains.length > 0) {
      const lower = email.toLowerCase();
      const ok = allowedDomains.some((d) => lower.endsWith(`@${d.toLowerCase()}`));
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
      // Redirect to /app after a moment for the success state to render
      setTimeout(() => router.push("/app"), 800);
    });
  }

  if (feedback?.kind === "success") {
    return (
      <div className="rounded-card-sm bg-emerald-50 border border-emerald-200 p-5 text-center">
        <div className="w-10 h-10 rounded-pill bg-emerald-500 text-white grid place-items-center mx-auto">
          <Check size={20} strokeWidth={2.5} />
        </div>
        <p className="mt-3 font-semibold tracking-tight text-emerald-900">
          ลงทะเบียนสำเร็จ
        </p>
        <p className="mt-1 text-xs text-emerald-700">
          กำลังพาไปยังหน้าจอง...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>ชื่อ-นามสกุล *</Label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="เช่น สมชาย ใจดี"
          required
        />
      </div>
      <div>
        <Label>Email * (อีเมลขององค์กร)</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={
            allowedDomains.length > 0
              ? `you@${allowedDomains[0]}`
              : "you@example.com"
          }
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>เบอร์โทร</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
          />
        </div>
        <div>
          <Label>ตำแหน่ง / แผนก</Label>
          <Input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="เช่น Frontend Dev"
          />
        </div>
      </div>

      {feedback?.kind === "error" && (
        <div className="flex items-start gap-2 rounded-input bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p>{feedback.message}</p>
            {feedback.allowedDomains && feedback.allowedDomains.length > 0 && (
              <p className="mt-1 text-[11px]">
                Domains:{" "}
                {feedback.allowedDomains.map((d) => `@${d}`).join(" / ")}
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full"
        iconRight={<ArrowRight size={16} />}
        disabled={pending}
      >
        {pending ? "กำลังลงทะเบียน..." : "สมัครและเริ่มใช้งาน"}
      </Button>
    </form>
  );
}
