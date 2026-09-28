"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import {
  cancelCustomerAndRestore,
  moveDisplaced,
  resolveWithoutMove,
  suggestSlots,
} from "@/lib/server/overrides";
import { recordAudit } from "./audit";

async function staff() {
  const me = await getCurrentProfile();
  return me && hasRole(me, "staff") ? me : null;
}

function refresh() {
  revalidatePath("/admin/overrides");
  revalidatePath("/admin/calendar");
}

export async function getSuggestions(internalId: string) {
  if (!(await staff())) return [];
  return suggestSlots(internalId);
}

export async function moveDisplacedAction(input: {
  internalId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}) {
  const me = await staff();
  if (!me) return { ok: false, message: "ไม่มีสิทธิ์" };
  const r = await moveDisplaced({ ...input, actorId: me.id, actorName: me.full_name ?? me.email });
  if (r.ok) {
    await recordAudit({ action: "override_moved", targetType: "booking", targetId: input.internalId, changes: input });
    refresh();
  }
  return r;
}

export async function resolveOverrideAction(internalId: string, kind: "member_rebook" | "acknowledged", note: string) {
  const me = await staff();
  if (!me) return { ok: false, message: "ไม่มีสิทธิ์" };
  const r = await resolveWithoutMove({ internalId, kind, note: String(note ?? "").slice(0, 300), actorName: me.full_name ?? me.email });
  if (r.ok) {
    await recordAudit({ action: `override_${kind}`, targetType: "booking", targetId: internalId, reason: note || undefined });
    refresh();
  }
  return r;
}

export async function cancelCustomerAction(internalId: string, reason: string) {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "admin")) return { ok: false, message: "ต้องเป็นแอดมินขึ้นไป" };
  if (!String(reason ?? "").trim()) return { ok: false, message: "กรุณาระบุเหตุผล" };
  const r = await cancelCustomerAndRestore({ internalId, reason: reason.slice(0, 300), actorName: me.full_name ?? me.email });
  if (r.ok) {
    await recordAudit({ action: "override_customer_cancelled", targetType: "booking", targetId: internalId, reason });
    refresh();
  }
  return r;
}
