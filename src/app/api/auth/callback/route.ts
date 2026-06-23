import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { recordLogin } from "@/lib/auth";
import { registerMember } from "@/lib/actions/members";

const REGISTER_COOKIE = "easyspace.register_intent";
const LAST_INVITE_COOKIE = "easyspace.last_invite";

type RegisterIntent = {
  inviteCode: string;
  fullName?: string;
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

  // Helper: route every failure to /book/<invite> when the visitor came from
  // a member invite — never to /login (admin page).
  const cookieStore = await cookies();
  const lastInvite = cookieStore.get(LAST_INVITE_COOKIE)?.value ?? null;
  const failRedirect = (errCode: string) =>
    lastInvite
      ? `${origin}/book/${encodeURIComponent(lastInvite)}?error=${errCode}`
      : `${origin}/login?error=${errCode}`;

  if (!code) {
    return NextResponse.redirect(failRedirect("oauth_failed"));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(failRedirect("oauth_failed"));
  }
  const user = data.user;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  await recordLogin(user.id, ip);

  const intentRaw = cookieStore.get(REGISTER_COOKIE)?.value;

  // ─── Flow 1: register-via-Google intent ──────────────────────────────
  if (intentRaw) {
    cookieStore.set(REGISTER_COOKIE, "", { path: "/", maxAge: 0 });
    try {
      const intent = JSON.parse(
        decodeURIComponent(intentRaw),
      ) as RegisterIntent;
      if (intent.inviteCode && user.email) {
        // Prefer the name typed in the form; fall back to Google's
        // identity metadata; final fallback to the email's local-part.
        const googleName =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          undefined;
        const fullName =
          intent.fullName?.trim() ||
          googleName ||
          user.email.split("@")[0];

        const res = await registerMember({
          inviteCode: intent.inviteCode,
          fullName,
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
          // Surface the raw error message in the URL so admins can debug
          // production failures without diving into Vercel logs every time.
          const extra =
            detail === "register" && res.error
              ? `&detail=${encodeURIComponent(res.error.slice(0, 200))}`
              : "";
          console.error("[auth/callback] registerMember failed", res.error);
          return NextResponse.redirect(
            `${origin}/book/${intent.inviteCode}?error=${detail}${extra}`,
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
      .select("id, profile_id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    const matched = memberByEmail as { id: string; profile_id: string | null } | null;
    hasMember = !!matched;
    // Self-heal: if the member was registered before the OAuth user existed
    // (email-form registration), link the auth user now so future logins
    // resolve via profile_id and we never lose the row to case quirks.
    if (matched && !matched.profile_id) {
      await admin
        .from("members")
        .update({ profile_id: user.id } as never)
        .eq("id", matched.id);
    }
  }
  if (hasMember) {
    return NextResponse.redirect(`${origin}/app`);
  }

  // ─── Unregistered ────────────────────────────────────────────────────
  // Send them back to the org's /book/<code> landing with the Google email
  // attached, so the banner can tell the user exactly which account didn't
  // match and offer a one-click register-with-this-email.
  const emailParam = user.email ? `&email=${encodeURIComponent(user.email)}` : "";
  if (lastInvite) {
    return NextResponse.redirect(
      `${origin}/book/${encodeURIComponent(lastInvite)}?error=not_registered${emailParam}`,
    );
  }
  return NextResponse.redirect(
    `${origin}/member-login?error=not_registered${emailParam}`,
  );
}
