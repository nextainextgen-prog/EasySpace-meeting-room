import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { recordLogin } from "@/lib/auth";
import { registerMember } from "@/lib/actions/members";
import type { Database } from "@/lib/types/database";
import {
  authCookieOptions,
  isSupabaseAuthCookie,
  isSupabaseSessionCookie,
} from "@/lib/integrations/supabase/cookie-options";

const REGISTER_COOKIE = "easyspace.register_intent";
const LAST_INVITE_COOKIE = "easyspace.last_invite";

type CookieToSet = { name: string; value: string; options: CookieOptions };

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
 *  3. **Admin login** — profile.role >= staff → /admin/bookings.
 *  4. Anything else → /member-login?error=not_registered (unregistered email).
 *
 * Cookies are collected and attached to the redirect response we actually
 * return. Writing them through `cookies()` and then returning a freshly built
 * `NextResponse.redirect()` drops them on the floor — the session never lands
 * in the browser, the user is bounced back to the login screen, and only the
 * *second* attempt works. That was the "ต้องกด Login 2 รอบ" bug.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextOverride = searchParams.get("next");

  const pendingCookies: CookieToSet[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          // Hide the visitor's *previous* session from the client doing the
          // exchange. GoTrueClient recovers whatever session it can see the
          // moment it is constructed, and both outcomes of that recovery —
          // _saveSession() on a successful refresh, _removeSession() on a
          // failed one — delete the PKCE code-verifier. The verifier is the
          // only thing this request needs; the old session is about to be
          // replaced anyway.
          return request.cookies
            .getAll()
            .filter((c) => !isSupabaseSessionCookie(c.name));
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  /** Redirect that carries every cookie Supabase asked us to write. */
  function redirectWithSession(to: string) {
    const response = NextResponse.redirect(to);
    const written = new Set(pendingCookies.map((c) => c.name));
    // Because the old session cookies were hidden above, Supabase could not
    // clean up its own stale chunks. Expire anything it did not just rewrite,
    // or a leftover `.1` from a longer previous token would shadow the new
    // session on the very next request.
    for (const c of request.cookies.getAll()) {
      if (isSupabaseAuthCookie(c.name) && !written.has(c.name)) {
        response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
      }
    }
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  // Helper: route every failure to /book/<invite> when the visitor came from
  // a member invite — never to /login (admin page).
  const lastInvite = request.cookies.get(LAST_INVITE_COOKIE)?.value ?? null;
  const failRedirect = (errCode: string) =>
    lastInvite
      ? `${origin}/book/${encodeURIComponent(lastInvite)}?error=${errCode}`
      : `${origin}/login?error=${errCode}`;

  // Surface the real reason in the URL + server logs. Google/Supabase send
  // back ?error=...&error_description=... when consent fails; our own
  // exchange can fail when the PKCE verifier cookie is missing. Without this
  // every failure collapses to an opaque "oauth_failed".
  const reasonParam = (msg: string | null | undefined) =>
    msg ? `&reason=${encodeURIComponent(msg.slice(0, 160))}` : "";

  /** A failed exchange must not leave half-written Supabase cookies behind —
   *  they are exactly what poisons the *next* attempt. */
  function failWith(errCode: string, reason: string | null | undefined) {
    const response = NextResponse.redirect(
      failRedirect(errCode) + reasonParam(reason),
    );
    for (const c of request.cookies.getAll()) {
      if (isSupabaseAuthCookie(c.name)) {
        response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
      }
    }
    return response;
  }

  if (!code) {
    const provErr =
      searchParams.get("error_description") || searchParams.get("error");
    console.error("[auth/callback] no code in callback", provErr);
    return failWith("oauth_failed", provErr ?? "no_code");
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback] exchange failed", error?.message);
    return failWith("oauth_failed", error?.message ?? "no_user");
  }
  const user = data.user;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  await recordLogin(user.id, ip);

  const intentRaw = request.cookies.get(REGISTER_COOKIE)?.value;

  // ─── Flow 1: register-via-Google intent ──────────────────────────────
  if (intentRaw) {
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
          intent.fullName?.trim() || googleName || user.email.split("@")[0];

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
          const response = redirectWithSession(
            `${origin}/book/${intent.inviteCode}?error=${detail}${extra}`,
          );
          response.cookies.set(REGISTER_COOKIE, "", { path: "/", maxAge: 0 });
          return response;
        }
        const response = redirectWithSession(`${origin}/app?welcome=1`);
        response.cookies.set(REGISTER_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
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
    return redirectWithSession(`${origin}${nextOverride}`);
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
    return redirectWithSession(`${origin}/admin/bookings`);
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
    const matched = memberByEmail as {
      id: string;
      profile_id: string | null;
    } | null;
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
    return redirectWithSession(`${origin}/app`);
  }

  // ─── Unregistered ────────────────────────────────────────────────────
  // Send them back to the org's /book/<code> landing with the Google email
  // attached, so the banner can tell the user exactly which account didn't
  // match and offer a one-click register-with-this-email.
  const emailParam = user.email
    ? `&email=${encodeURIComponent(user.email)}`
    : "";
  if (lastInvite) {
    return redirectWithSession(
      `${origin}/book/${encodeURIComponent(lastInvite)}?error=not_registered${emailParam}`,
    );
  }
  return redirectWithSession(
    `${origin}/member-login?error=not_registered${emailParam}`,
  );
}
