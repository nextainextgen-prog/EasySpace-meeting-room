import { redirect } from "next/navigation";
import { getCurrentProfile, homePathFor } from "@/lib/auth";

/**
 * Root entry: bounce to /login or to the right home based on the role.
 * - Staff and above                        → /admin/bookings
 * - Org members (a `members` row)          → /app
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
  redirect(await homePathFor(profile));
}
