import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

const ADMIN_TIER_ROLES = new Set([
  "owner",
  "super_admin",
  "admin",
  "staff",
  "accountant",
  "marketing",
  "viewer",
]);

/**
 * Root entry: bounce to /login or to the right home based on the role.
 * - Any internal staff role (owner..viewer) → /admin/bookings
 * - Regular org members                     → /app
 * - Logged out                              → /login
 *
 * Staff land on the booking form rather than the dashboard: logging a walk-in
 * is what the building admins open the app to do, and every other admin screen
 * is one click away in the sidebar.
 */
export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  redirect(ADMIN_TIER_ROLES.has(profile.role) ? "/admin/bookings" : "/app");
}
