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

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence"]);

function isHeic(file: File) {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

async function convertHeicToJpeg(file: File): Promise<File> {
  // Dynamic import — keeps heic2any out of the initial bundle for users
  // who never upload HEIC.
  const mod = (await import("heic2any")) as unknown as {
    default: (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
  };
  const blob = await mod.default({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const out = Array.isArray(blob) ? blob[0] : blob;
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "image";
  return new File([out], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function ImageUploader({
  value,
  onChange,
  label = "รูปภาพ",
  hint = "PNG · JPG · WEBP · GIF · HEIC · ไม่เกิน 10 MB · เห็นเต็มภาพไม่ถูกตัด",
  aspectRatio = "1536 / 1384",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);

  function pick() {
    fileRef.current?.click();
  }

  async function upload(rawFile: File) {
    setErr(null);
    let file = rawFile;
    // iPhone uploads land as image/heic — modern Chromium can't render those,
    // so convert to JPEG in the browser before sending to Storage.
    if (isHeic(file)) {
      setConverting(true);
      try {
        file = await convertHeicToJpeg(file);
      } catch (e) {
        setConverting(false);
        setErr(
          e instanceof Error
            ? `แปลง HEIC ไม่สำเร็จ: ${e.message}`
            : "แปลง HEIC ไม่สำเร็จ",
        );
        return;
      }
      setConverting(false);
    }

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
    if (file) void upload(file);
  }

  const busy = pending || converting;

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
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
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
              disabled={busy}
              className="px-3 h-8 rounded-pill text-[11px] font-medium bg-white/95 backdrop-blur border border-line shadow-card hover:bg-white inline-flex items-center gap-1.5"
            >
              <Upload size={11} strokeWidth={1.75} />
              เปลี่ยน
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={busy}
              className="w-8 h-8 grid place-items-center rounded-pill bg-white/95 backdrop-blur border border-line shadow-card hover:bg-red-50 hover:text-red-600 transition"
              aria-label="ลบรูป"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>
          {busy && (
            <div className="absolute inset-0 bg-white/70 grid place-items-center">
              <span className="inline-flex items-center gap-2 text-xs text-primary-700 font-medium">
                <Loader2
                  size={14}
                  className="animate-spin"
                  strokeWidth={1.75}
                />
                {converting ? "กำลังแปลง HEIC..." : "กำลังอัปโหลด..."}
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
            busy && "opacity-60 pointer-events-none",
          )}
          style={{ aspectRatio }}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-2 text-primary-700">
              <Loader2 size={22} className="animate-spin" strokeWidth={1.75} />
              <p className="text-xs font-medium">
                {converting ? "กำลังแปลง HEIC..." : "กำลังอัปโหลด..."}
              </p>
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
