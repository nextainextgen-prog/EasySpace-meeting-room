"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Save, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { uploadAvatar, updateMyProfile } from "@/lib/actions/account";

export function ProfileCard({
  initial,
}: {
  initial: {
    email: string;
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
}) {
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [avatar, setAvatar] = useState<string | null>(initial.avatar_url);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    const r = await uploadAvatar(fd);
    setUploading(false);
    if (r.ok) {
      setAvatar(r.url);
      setHint("อัปโหลดรูปสำเร็จ");
      setTimeout(() => setHint(null), 2000);
    } else {
      setErr(
        r.error === "file_too_large"
          ? "ไฟล์ใหญ่เกิน 2MB"
          : r.error === "no_file"
            ? "ไม่พบไฟล์"
            : `อัปโหลดไม่สำเร็จ: ${r.error} — ตรวจว่ามี Storage bucket "avatars" หรือยัง`,
      );
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setHint(null);
    startTransition(async () => {
      const r = await updateMyProfile({
        fullName,
        phone: phone || null,
        avatarUrl: avatar,
      });
      if (r.ok) {
        setHint("บันทึก profile แล้ว");
        setTimeout(() => setHint(null), 2000);
      } else setErr(r.error);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-card-sm bg-primary-100 text-primary-700 grid place-items-center font-bold text-2xl overflow-hidden">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              (fullName || initial.email).slice(0, 1).toUpperCase()
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-pill bg-primary-600 hover:bg-primary-700 text-white grid place-items-center shadow-card disabled:opacity-60"
            title="เปลี่ยนรูป"
          >
            <Camera size={13} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
          />
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-pill bg-white border border-line grid place-items-center text-ink-3 hover:text-red-600"
              title="ลบรูป"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
          <div>
            <Label>ชื่อ-นามสกุล</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label>เบอร์โทร</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Email</Label>
            <Input value={initial.email} disabled />
            <p className="text-[10px] text-ink-3 mt-1">
              ติดต่อ super admin เพื่อเปลี่ยน email
            </p>
          </div>
        </div>
      </div>

      {hint && (
        <p className="text-xs text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 size={12} /> {hint}
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          iconLeft={<Save size={12} />}
          disabled={pending || uploading}
        >
          {pending ? "บันทึก..." : uploading ? "อัปโหลด..." : "บันทึก"}
        </Button>
      </div>
    </form>
  );
}
