"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { issueQuotation, rejectRequest } from "@/lib/server/quotations";
import { recordAudit } from "./audit";

const IssueSchema = z.object({
  bookingId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        qty: z.number().positive().max(10_000),
        unitPrice: z.number().min(0).max(10_000_000),
      }),
    )
    .min(1)
    .max(30),
  discount: z.number().min(0).max(10_000_000).default(0),
  withholding: z.boolean().default(false),
  validHours: z.number().int().min(1).max(24 * 30),
  note: z.string().trim().max(1000).optional(),
});

export async function issueQuotationAction(raw: z.infer<typeof IssueSchema>) {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "staff")) return { ok: false, message: "ไม่มีสิทธิ์" };
  const parsed = IssueSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const r = await issueQuotation({
    ...parsed.data,
    note: parsed.data.note ?? null,
    actorId: me.id,
    actorName: me.full_name ?? me.email,
  });
  if (r.ok) {
    await recordAudit({ action: "quotation_issued", targetType: "booking", targetId: parsed.data.bookingId, changes: { number: r.number } });
    revalidatePath("/admin/requests");
    revalidatePath("/admin/calendar");
  }
  return r;
}

export async function rejectRequestAction(bookingId: string, reason: string) {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "staff")) return { ok: false, message: "ไม่มีสิทธิ์" };
  const why = String(reason ?? "").trim();
  if (!why) return { ok: false, message: "กรุณาระบุเหตุผลที่แจ้งลูกค้า" };
  const r = await rejectRequest({ bookingId, reason: why.slice(0, 300), actorName: me.full_name ?? me.email });
  if (r.ok) {
    await recordAudit({ action: "request_rejected", targetType: "booking", targetId: bookingId, reason: why });
    revalidatePath("/admin/requests");
    revalidatePath("/admin/calendar");
  }
  return r;
}
