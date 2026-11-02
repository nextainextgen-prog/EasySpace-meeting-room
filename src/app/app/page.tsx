import Link from "next/link";
import { getCurrentMember } from "@/lib/data/members";
import { ctxFromMemberContext } from "@/lib/server/member-ops";
import { loadPortalData } from "@/lib/server/portal-data";
import { PortalHome } from "./_portal/portal-home";

export const dynamic = "force-dynamic";
export const metadata = { title: "EasySpace — จองห้องประชุม" };

/** The whole member portal: one page, everything a member needs. */
export default async function PortalPage() {
  const c = await getCurrentMember();
  const ctx = c ? await ctxFromMemberContext(c) : null;
  if (!ctx) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold tracking-tight text-ink-1">บัญชีนี้ยังไม่ได้อยู่ในบริษัทไหน</h1>
        <p className="mt-2 text-sm text-ink-2">
          ใช้ลิงก์เชิญจากผู้ดูแลบริษัทของคุณเพื่อลงทะเบียน หรือเข้าสู่ระบบด้วยอีเมลที่ลงทะเบียนไว้
        </p>
        <Link href="/member-login" className="mt-6 inline-flex h-10 px-5 items-center rounded-pill bg-primary-600 text-white text-sm font-semibold">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }
  const data = await loadPortalData(ctx);
  return <PortalHome data={data} />;
}
