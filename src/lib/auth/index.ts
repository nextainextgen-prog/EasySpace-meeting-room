import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { Role } from "@/lib/types";

export interface AuthProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: Role;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_login_at: string | null;
}

/**
 * Memoized per-request via React `cache()`. A typical admin nav hits this
 * 2-4 times (root layout + page + topbar + sidebar) — without dedup that's
 * 2-4 round-trips to Supabase Auth (≈150-300ms each). With cache, one.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(
  async (): Promise<AuthProfile | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select(
        "id, email, full_name, phone, avatar_url, role, is_active, two_factor_enabled, last_login_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (!data) {
      // Auto-provision: first time the user signs in, bootstrap a profile row
      // from auth metadata so admin routes work immediately.
      const fallback = {
        id: user.id,
        email: user.email ?? "",
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        phone: (user.user_metadata?.phone as string | undefined) ?? null,
        avatar_url:
          (user.user_metadata?.avatar_url as string | undefined) ?? null,
        role: "viewer" as Role,
        is_active: true,
        two_factor_enabled: false,
        last_login_at: null,
      };
      await admin.from("profiles").insert(fallback as never);
      return fallback;
    }

    return data as unknown as AuthProfile;
  },
);

export async function requireAuth(): Promise<AuthProfile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!profile.is_active) {
    redirect("/login?error=disabled");
  }
  return profile;
}

/** Roles ordered by privilege; higher index = more privilege. */
const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  marketing: 1,
  accountant: 2,
  staff: 3,
  admin: 4,
  super_admin: 5,
  owner: 6,
};

export function hasRole(profile: AuthProfile, minRole: Role) {
  return ROLE_RANK[profile.role] >= ROLE_RANK[minRole];
}

export async function requireRole(minRole: Role): Promise<AuthProfile> {
  const profile = await requireAuth();
  if (!hasRole(profile, minRole)) {
    redirect("/login?error=forbidden");
  }
  return profile;
}

export async function recordLogin(userId: string, ip?: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({
      last_login_at: new Date().toISOString(),
      last_login_ip: ip ?? null,
    } as never)
    .eq("id", userId);
}

/**
 * Map of route prefix → minimum role required. Order matters — the longest
 * prefix wins. Anything not listed here that lives under `/admin` requires at
 * least "staff" (set in middleware).
 */
export const ROUTE_ROLE_REQUIREMENTS: Array<{ prefix: string; role: Role }> = [
  { prefix: "/admin/audit-log", role: "admin" },
  { prefix: "/admin/account", role: "staff" },
  { prefix: "/admin/settings", role: "admin" },
  { prefix: "/admin/users", role: "admin" },
  { prefix: "/admin/finance", role: "accountant" },
  { prefix: "/admin/promotions", role: "marketing" },
  { prefix: "/admin/notifications", role: "staff" },
  { prefix: "/admin/customers/analytics", role: "marketing" },
  { prefix: "/admin/customers", role: "staff" },
  { prefix: "/admin/calendar", role: "staff" },
  { prefix: "/admin/bookings", role: "staff" },
  { prefix: "/admin/dashboard", role: "staff" },
  { prefix: "/admin", role: "staff" },
  { prefix: "/org-admin", role: "staff" },
];

export function requiredRoleForPath(pathname: string): Role | null {
  // longest prefix wins
  const match = ROUTE_ROLE_REQUIREMENTS.find((r) =>
    pathname.startsWith(r.prefix),
  );
  return match?.role ?? null;
}

export function roleRank(role: Role) {
  return ROLE_RANK[role];
}
