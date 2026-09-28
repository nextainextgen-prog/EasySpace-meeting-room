import { AdminTopbar } from "@/components/admin/topbar";
import { listBankAccounts } from "@/lib/data";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";
import { BankAccountsManager } from "./bank-accounts-manager";
import { OnlinePaymentCard } from "./online-payment-card";
import { PricingCard } from "./pricing-card";
import { getPublicRoomConfig } from "@/lib/data/public-rooms";
import { getPaymentSetup } from "@/lib/server/payment-slips";
import { getIntegrationStatus } from "@/lib/actions/online-payment";

export const dynamic = "force-dynamic";

const DEFAULT_PAYMENT_METHODS = {
  promptpay_id: "",
  cash: { enabled: true },
  bank_transfer: { enabled: true, instruction: "" },
  promptpay: { enabled: true, qr_url: "" },
  qr: { enabled: false },
  credit_card: { enabled: false, gateway: "omise" },
};

export default async function PaymentSettingsPage() {
  const [banks, methods, cfg, setup, integrations] = await Promise.all([
    listBankAccounts(),
    getSettingValue<{ promptpay_id?: string }>("finance.payment_methods"),
    getPublicRoomConfig(),
    getPaymentSetup(),
    getIntegrationStatus(),
  ]);

  return (
    <>
      <AdminTopbar
        title="การชำระเงิน"
        subtitle="บัญชีธนาคาร · PromptPay · Gateway"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="การชำระเงิน"
          description="ชำระเงินออนไลน์ (มัดจำ/เต็มจำนวน + ตรวจสลิป EasySlip) · บัญชีธนาคารที่ใช้รับโอน — แก้ชื่อ/เลขบัญชีได้ที่การ์ดบัญชีธนาคาร"
        >
          <div className="space-y-5">
            <OnlinePaymentCard
              config={{
                payment_enabled: cfg.payment_enabled,
                payment_mode: cfg.payment_mode,
                deposit_percent: cfg.deposit_percent,
                payment_hold_minutes: cfg.payment_hold_minutes,
              }}
              promptpayId={methods?.promptpay_id ?? ""}
              easyslip={integrations?.easyslip ?? { masked: null, source: "none" }}
              missing={setup.missing}
              ready={setup.ready}
            />
            <PricingCard initial={cfg.pricing} />
            <BankAccountsManager banks={banks} />
            <JsonSettingEditor
              settingKey="finance.payment_methods"
              category="finance"
              defaultValue={DEFAULT_PAYMENT_METHODS}
              initial={methods}
              hint="เปิด/ปิดวิธีชำระเงินที่แสดงในหน้าจอง · ใส่ promptpay_id และ qr_url ที่นี่"
            />
          </div>
        </SettingsShell>
      </div>
    </>
  );
}
