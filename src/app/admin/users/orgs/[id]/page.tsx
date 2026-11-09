import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** The org dashboard moved to /admin/orgs/[id]; keep old links working. */
export default async function LegacyOrgDashboardRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/orgs/${id}`);
}
