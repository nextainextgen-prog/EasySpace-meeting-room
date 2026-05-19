"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, X, ImageIcon, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadRoomImage } from "@/lib/actions/uploads";

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  /** Aspect ratio CSS string. Defaults to "1536 / 1384" so 1536×1384 source
   * images fit perfectly without cropping. */
  aspectRatio?: string;
}

export function ImageUploader({
  value,
  onChange,
  label = "รูปภาพ",
  hint = "PNG · JPG · WEBP · GIF · ไม่เกิน 10 MB · เห็นเต็มภาพไม่ถูกตัด",
  aspectRatio = "1536 / 1384",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick() {
    fileRef.current?.click();
  }

  function upload(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const r = await uploadRoomImage(fd);
        if (r.ok) onChange(r.publicUrl);
        else setErr(r.error);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
      }
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-ink-2 mb-1.5">
          {label}
        </label>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="relative rounded-input border border-line bg-surface-subtle/40 overflow-hidden group">
          <div
            style={{ aspectRatio }}
            className="w-full grid place-items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="preview"
              className="max-w-full max-h-full object-contain"
              style={{ aspectRatio }}
            />
          </div>
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={pick}
              disabled={pending}
              className="px-3 h-8 rounded-pill text-[11px] font-medium bg-white/95 backdrop-blur border border-line shadow-card hover:bg-white inline-flex items-center gap-1.5"
            >
              <Upload size={11} strokeWidth={1.75} />
              เปลี่ยน
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={pending}
              className="w-8 h-8 grid place-items-center rounded-pill bg-white/95 backdrop-blur border border-line shadow-card hover:bg-red-50 hover:text-red-600 transition"
              aria-label="ลบรูป"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>
          {pending && (
            <div className="absolute inset-0 bg-white/70 grid place-items-center">
              <span className="inline-flex items-center gap-2 text-xs text-primary-700 font-medium">
                <Loader2
                  size={14}
                  className="animate-spin"
                  strokeWidth={1.75}
                />
                กำลังอัปโหลด...
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={pick}
          className={cn(
            "relative cursor-pointer rounded-input border-2 border-dashed transition",
            "grid place-items-center text-center px-4",
            dragOver
              ? "border-primary-500 bg-primary-50/60"
              : "border-line bg-surface-subtle/30 hover:border-primary-300 hover:bg-primary-50/30",
            pending && "opacity-60 pointer-events-none",
          )}
          style={{ aspectRatio }}
        >
          {pending ? (
            <div className="flex flex-col items-center gap-2 text-primary-700">
              <Loader2 size={22} className="animate-spin" strokeWidth={1.75} />
              <p className="text-xs font-medium">กำลังอัปโหลด...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-ink-3">
              <span className="w-12 h-12 grid place-items-center rounded-full bg-white border border-line">
                <ImageIcon size={20} strokeWidth={1.5} />
              </span>
              <p className="text-sm font-semibold text-ink-1 tracking-tight">
                ลากไฟล์มาวาง หรือคลิกเพื่อเลือก
              </p>
              <p className="text-[11px] leading-relaxed max-w-xs">{hint}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 h-8 px-4 rounded-pill bg-primary-600 text-white text-xs font-medium">
                <Upload size={12} strokeWidth={1.75} />
                เลือกรูป
              </span>
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="text-[11px] text-red-600 mt-1.5 inline-flex items-center gap-1">
          <AlertTriangle size={11} strokeWidth={1.75} />
          {err}
        </p>
      )}
    </div>
  );
}
