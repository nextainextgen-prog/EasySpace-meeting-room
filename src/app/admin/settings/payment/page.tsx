import { AdminTopbar } from "@/components/admin/topbar";
import { listBankAccounts } from "@/lib/data";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";
import { BankAccountsManager } from "./bank-accounts-manager";

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
  const [banks, methods] = await Promise.all([
    listBankAccounts(),
    getSettingValue("finance.payment_methods"),
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
          description="บัญชีธนาคารที่ใช้รับโอน + ช่องทางชำระเงินที่เปิดให้ลูกค้าเลือก"
        >
          <div className="space-y-5">
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
