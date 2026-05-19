import { AdminTopbar } from "@/components/admin/topbar";
import { listExpenseCategories } from "@/lib/data";
import { SettingsShell } from "../_shell";
import { ExpenseCategoriesManager } from "./categories-manager";

export const dynamic = "force-dynamic";

export default async function ExpenseCategoriesPage() {
  const categories = await listExpenseCategories();
  return (
    <>
      <AdminTopbar
        title="หมวดรายจ่าย"
        subtitle="AI keyword · VAT default · tax deductible"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="หมวดรายจ่าย"
          description={`${categories.length} หมวด · AI ใช้ keyword จับคู่หมวดอัตโนมัติเมื่อบันทึกรายจ่าย`}
        >
          <ExpenseCategoriesManager categories={categories} />
        </SettingsShell>
      </div>
    </>
  );
}
