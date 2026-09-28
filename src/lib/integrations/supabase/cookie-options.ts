/**
 * One source of truth for how Supabase auth cookies are written.
 *
 * Every client that touches an auth cookie — browser, server, route handler —
 * must use identical name/path/flags, otherwise the PKCE verifier written in
 * the browser is invisible to the server callback and the first Google login
 * fails while the retry works.
 *
 * Note on lifetime: @supabase/ssr hard-overrides `maxAge` to its own 400-day
 * default *after* spreading whatever we pass (see cookies.js `setCookieOptions`),
 * so the session cookie always outlives the browser and there is no point
 * setting a lifetime here. "จำการเข้าสู่ระบบ" is therefore enforced by
 * <SessionKeeper />, which signs the user out on the next browser launch when
 * they declined it.
 *
 * Kept free of `next/headers` so the browser bundle can import it too.
 */

/** Records the user's "จำการเข้าสู่ระบบ" choice: "1" keep me signed in,
 *  "0" declined, absent means never asked (OAuth logins). Plain, non-httpOnly
 *  cookie on purpose — the browser needs to read it on the next launch. */
export const REMEMBER_COOKIE = "easyspace.remember";

/** How long the *preference* itself is remembered. */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 400;

export type AuthCookieOptions = {
  path: string;
  sameSite: "lax";
  secure: boolean;
};

export function authCookieOptions(): AuthCookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

/** Reads the remember flag out of a raw `document.cookie` / `Cookie:` string.
 *  Absent counts as remembered: OAuth has no checkbox to decline. */
export function readRememberFlag(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return true;
  return !cookieHeader
    .split(";")
    .some((c) => c.trim() === `${REMEMBER_COOKIE}=0`);
}

/** True for any cookie Supabase owns, including the chunked `.0` / `.1` parts
 *  and the PKCE `-code-verifier`. Used to hard-clear a session on logout. */
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-");
}

/** The PKCE code-verifier cookie (possibly chunked), as opposed to the
 *  session token cookies. */
export function isSupabaseVerifierCookie(name: string): boolean {
  return isSupabaseAuthCookie(name) && name.includes("-code-verifier");
}

/** The session token cookies — everything Supabase owns except the verifier. */
export function isSupabaseSessionCookie(name: string): boolean {
  return isSupabaseAuthCookie(name) && !isSupabaseVerifierCookie(name);
}
