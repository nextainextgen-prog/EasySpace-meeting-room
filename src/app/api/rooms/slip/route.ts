import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { submitSlip } from "@/lib/server/payment-slips";

export const dynamic = "force-dynamic";
// EasySlip can take a while on a cold bank lookup.
export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

/**
 * Customer uploads a transfer slip for their online booking.
 * multipart/form-data: reference, token, file
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, status: "bad_file", message: "อ่านไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
  const reference = String(form.get("reference") ?? "").slice(0, 32);
  const token = String(form.get("token") ?? "").slice(0, 64);
  const file = form.get("file");
  if (!(file instanceof File) || !ALLOWED.includes(file.type || "image/jpeg")) {
    return NextResponse.json(
      { ok: false, status: "bad_file", message: "กรุณาเลือกรูปสลิป (JPG / PNG)" },
      { status: 400 },
    );
  }

  const result = await submitSlip({
    reference,
    token,
    bytes: await file.arrayBuffer(),
    mime: file.type || "image/jpeg",
    filename: file.name || "slip.jpg",
  });

  if (result.ok) {
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/finance/slips");
  } else if (result.status !== "not_found") {
    revalidatePath("/admin/finance/slips");
  }
  return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
}
