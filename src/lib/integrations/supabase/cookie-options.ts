/**
 * One source of truth for how Supabase auth cookies are written.
 *
 * Every client that touches an auth cookie — browser, server, route handler —
 * must use identical name/path/flags, otherwise the PKCE verifier written in
 * the browser is invisible to the server callback and the first Google login
 * fails while the retry works.
 *
 * Kept free of `next/headers` so the browser bundle can import it too.
 */

/** Set when the user ticks "จำการเข้าสู่ระบบ" on /login. Plain (non-httpOnly)
 *  cookie on purpose: the browser client needs to read it before it can decide
 *  how long to persist the session it is about to create. */
export const REMEMBER_COOKIE = "easyspace.remember";

/** 30 days — long enough that a building admin never re-types a password in a
 *  normal month, short enough that a shared front-desk browser eventually
 *  forgets. */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthCookieOptions = {
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge?: number;
};

/**
 * Without an explicit `maxAge`, @supabase/ssr writes the session as a *session
 * cookie* — it dies when the browser closes, which is why "จำการเข้าสู่ระบบ"
 * never actually remembered anything.
 */
export function authCookieOptions(remember: boolean): AuthCookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
  };
}

/** Reads the remember flag out of a raw `document.cookie` / `Cookie:` string. */
export function readRememberFlag(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((c) => c.trim() === `${REMEMBER_COOKIE}=1`);
}

/** True for any cookie Supabase owns, including the chunked `.0` / `.1` parts
 *  and the PKCE `-code-verifier`. Used to hard-clear a session on logout. */
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-");
}
