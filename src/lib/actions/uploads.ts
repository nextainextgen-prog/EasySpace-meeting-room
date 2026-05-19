"use server";

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { requireAuth } from "@/lib/auth";

const ROOM_BUCKET = "room-images";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export interface UploadResult {
  ok: true;
  publicUrl: string;
  path: string;
}

export interface UploadFailure {
  ok: false;
  error: string;
}

/**
 * Upload a room image to Supabase Storage via the service-role admin client.
 * Returns the public URL. Auth-gated: any signed-in admin/staff may upload.
 */
export async function uploadRoomImage(formData: FormData): Promise<UploadResult | UploadFailure> {
  const profile = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด" };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      error: `รองรับเฉพาะ PNG · JPG · WEBP · GIF (ได้รับ ${file.type || "unknown"})`,
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `ไฟล์ใหญ่เกิน 10 MB (ขนาดปัจจุบัน ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    };
  }

  const supabase = createSupabaseAdminClient();
  const ext =
    file.name.split(".").pop()?.toLowerCase() ??
    (file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg");
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "jpg";
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${profile.id}/${Date.now()}-${rand}.${safeExt}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(ROOM_BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });

  if (upErr) {
    // Common cause: bucket missing because migration not yet run on the
    // remote DB. Try to create it on the fly so the first deploy still works.
    if (
      upErr.message.toLowerCase().includes("bucket") &&
      upErr.message.toLowerCase().includes("not")
    ) {
      const { error: bucketErr } = await supabase.storage.createBucket(
        ROOM_BUCKET,
        {
          public: true,
          fileSizeLimit: MAX_BYTES,
          allowedMimeTypes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
        },
      );
      if (bucketErr && !bucketErr.message.includes("exists")) {
        return { ok: false, error: `bucket: ${bucketErr.message}` };
      }
      const retry = await supabase.storage
        .from(ROOM_BUCKET)
        .upload(path, bytes, {
          contentType: file.type,
          upsert: false,
          cacheControl: "public, max-age=31536000, immutable",
        });
      if (retry.error) {
        return { ok: false, error: retry.error.message };
      }
    } else {
      return { ok: false, error: upErr.message };
    }
  }

  const { data: pub } = supabase.storage
    .from(ROOM_BUCKET)
    .getPublicUrl(path);
  if (!pub?.publicUrl) {
    return { ok: false, error: "สร้าง public URL ไม่สำเร็จ" };
  }
  return { ok: true, publicUrl: pub.publicUrl, path };
}

/**
 * Remove an image previously uploaded to the room-images bucket. Best-effort:
 * a missing object is treated as success (idempotent).
 */
export async function deleteRoomImage(publicUrl: string) {
  await requireAuth();
  const supabase = createSupabaseAdminClient();
  // Extract the path part after "/storage/v1/object/public/room-images/"
  const match = publicUrl.match(/\/room-images\/(.+)$/);
  if (!match) return { ok: false as const, error: "ไม่ใช่ URL ของระบบ" };
  const path = match[1];
  const { error } = await supabase.storage.from(ROOM_BUCKET).remove([path]);
  if (error && !error.message.toLowerCase().includes("not found")) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}
