import { AdminTopbar } from "@/components/admin/topbar";
import { requireRole } from "@/lib/auth";
import { listSlips, SLIP_STATUS_LABEL } from "@/lib/server/payment-slips";
import { SlipsBoard } from "./slips-board";

export const dynamic = "force-dynamic";

export default async function SlipsPage() {
  await requireRole("accountant");
  const { rows, tableMissing } = await listSlips();

  return (
    <>
      <AdminTopbar title="ตรวจสลิป" subtitle="สลิปที่ลูกค้าแนบจากหน้าจองออนไลน์ · ตรวจอัตโนมัติด้วย EasySlip" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        {tableMissing ? (
          <div className="rounded-card border border-line bg-white p-5 text-sm text-ink-1">
            ยังไม่ได้รัน migration <code className="font-mono">00000000000016_online_payment.sql</code> ใน Supabase SQL
            editor — รันแล้วหน้านี้จะแสดงรายการสลิป
          </div>
        ) : (
          <SlipsBoard
            rows={rows.map((r) => ({
              id: r.id,
              createdAt: r.created_at,
              status: r.status,
              statusLabel: SLIP_STATUS_LABEL[r.status] ?? r.status,
              apiStatus: r.api_status,
              apiMessage: r.api_message,
              transRef: r.trans_ref,
              amount: r.amount == null ? null : Number(r.amount),
              expected: r.expected_amount == null ? null : Number(r.expected_amount),
              slipDate: r.slip_date,
              slipType: r.slip_type,
              senderBank: r.sender_bank,
              senderName: r.sender_name,
              senderAccount: r.sender_account,
              receiverBank: r.receiver_bank,
              receiverName: r.receiver_name,
              receiverAccount: r.receiver_account,
              imagePath: r.image_path,
              reviewNote: r.review_note,
              reviewedAt: r.reviewed_at,
              customerName: r.customer?.display_name ?? null,
              company: r.booking?.metadata?.public?.company || r.customer?.company_name || null,
              phone: r.customer?.phone ?? null,
              bookingRef: r.booking?.reference_code ?? null,
              roomName: r.booking?.room?.name ?? null,
              startsAt: r.booking?.starts_at ?? null,
              endsAt: r.booking?.ends_at ?? null,
              bookingStatus: r.booking?.booking_status ?? null,
              paymentStatus: r.booking?.payment_status ?? null,
              total: r.booking ? Number(r.booking.total_amount) : null,
              paid: r.booking ? Number(r.booking.paid_amount) : null,
            }))}
          />
        )}
      </div>
    </>
  );
}
