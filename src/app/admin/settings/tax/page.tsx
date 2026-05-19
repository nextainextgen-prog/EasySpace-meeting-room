import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT_TAX = {
  vat_rate: 7,
  vat_inclusive: true,
  invoice_prefix: "INV",
  invoice_year_offset: 543,
  invoice_next_number: 1,
  e_tax: {
    enabled: false,
    rd_user: "",
    sender_name: "",
  },
  withholding: {
    enabled: true,
    default_rate: 3,
  },
  corporate_income_tax: {
    rate: 20,
    sme_rate: 10,
  },
};

export default async function TaxSettingsPage() {
  const value = await getSettingValue("finance.tax");
  return (
    <>
      <AdminTopbar
        title="ภาษี"
        subtitle="VAT 7% · ใบกำกับ · e-Tax · หัก ณ ที่จ่าย"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ภาษี"
          description="ตั้งค่าภาษีทั้งหมด — VAT, prefix ใบกำกับ, e-Tax credentials, withholding rate"
        >
          <JsonSettingEditor
            settingKey="finance.tax"
            category="finance"
            defaultValue={DEFAULT_TAX}
            initial={value}
            hint="vat_inclusive=true หมายถึงราคาที่กรอกใน booking รวม VAT แล้ว"
          />
        </SettingsShell>
      </div>
    </>
  );
}
