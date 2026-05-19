import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { recordLogin } from "@/lib/auth";
import { registerMember } from "@/lib/actions/members";

const REGISTER_COOKIE = "easyspace.register_intent";

type RegisterIntent = {
  inviteCode: string;
  fullName: string;
  phone?: string;
  position?: string;
  department?: string;
};

/**
 * Supabase Auth callback. Handles three flows:
 *  1. **OAuth register intent** — set by the invite/register page before
 *     redirecting to Google. We complete `registerMember` using the Google
 *     email and the form data carried in a cookie.
 *  2. **Member login** — existing member row → /app.
 *  3. **Admin login** — profile.role >= staff → /admin/dashboard.
 *  4. Anything else → /member-login?error=not_registered (unregistered email).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextOverride = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }
  const user = data.user;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  await recordLogin(user.id, ip);

  const cookieStore = await cookies();
  const intentRaw = cookieStore.get(REGISTER_COOKIE)?.value;

  // ─── Flow 1: register-via-Google intent ──────────────────────────────
  if (intentRaw) {
    cookieStore.set(REGISTER_COOKIE, "", { path: "/", maxAge: 0 });
    try {
      const intent = JSON.parse(
        decodeURIComponent(intentRaw),
      ) as RegisterIntent;
      if (intent.inviteCode && intent.fullName && user.email) {
        const res = await registerMember({
          inviteCode: intent.inviteCode,
          fullName: intent.fullName,
          email: user.email,
          phone: intent.phone || undefined,
          position: intent.position || undefined,
          department: intent.department || undefined,
        });
        if (!res.ok) {
          const detail =
            res.error === "domain_not_allowed"
              ? "domain"
              : res.error === "invite_invalid"
                ? "invite"
                : "register";
          return NextResponse.redirect(
            `${origin}/book/${intent.inviteCode}?error=${detail}`,
          );
        }
        return NextResponse.redirect(`${origin}/app?welcome=1`);
      }
    } catch {
      // Fall through to normal routing.
    }
  }

  // ─── Honor explicit next= when it's a safe internal path ─────────────
  if (
    nextOverride &&
    nextOverride.startsWith("/") &&
    !nextOverride.startsWith("//")
  ) {
    return NextResponse.redirect(`${origin}${nextOverride}`);
  }

  // ─── Flow 2/3: auto-route by role/membership ─────────────────────────
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? "viewer";
  const isStaffPlus = ["staff", "admin", "super_admin", "owner"].includes(role);
  if (isStaffPlus) {
    return NextResponse.redirect(`${origin}/admin/dashboard`);
  }

  const { data: memberByProfile } = await admin
    .from("members")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  let hasMember = !!memberByProfile;
  if (!hasMember && user.email) {
    const { data: memberByEmail } = await admin
      .from("members")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    hasMember = !!memberByEmail;
  }
  if (hasMember) {
    return NextResponse.redirect(`${origin}/app`);
  }

  // ─── Unregistered ────────────────────────────────────────────────────
  return NextResponse.redirect(`${origin}/member-login?error=not_registered`);
}
