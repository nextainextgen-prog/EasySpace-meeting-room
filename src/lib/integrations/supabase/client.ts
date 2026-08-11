"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import {
  authCookieOptions,
  readRememberFlag,
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE,
} from "./cookie-options";

/**
 * Persist the user's "จำการเข้าสู่ระบบ" choice *before* signing in, so the
 * session cookie the sign-in is about to write already carries the right
 * lifetime. Writing it afterwards would be too late — the cookie is created
 * during `signInWithPassword`.
 */
export function setRememberPreference(remember: boolean) {
  if (typeof document === "undefined") return;
  // The opt-out is stored as an explicit "0" rather than by deleting the
  // cookie: OAuth logins have no checkbox and default to remembering, so
  // "absent" and "declined" must not look the same.
  document.cookie = `${REMEMBER_COOKIE}=${
    remember ? "1" : "0"
  }; path=/; max-age=${REMEMBER_MAX_AGE}; SameSite=Lax`;
}

export function createSupabaseBrowserClient(opts?: { remember?: boolean }) {
  const remember =
    opts?.remember ??
    readRememberFlag(
      typeof document === "undefined" ? undefined : document.cookie,
    );

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Pin cookie attributes so the PKCE code-verifier cookie set here in the
      // browser is written with the SAME name/path/flags the server callback
      // reads back during exchangeCodeForSession. A mismatch (e.g. a non-Secure
      // verifier dropped on the cross-site redirect back from Google) is the
      // classic cause of "first Google login fails, retry works".
      cookieOptions: authCookieOptions(remember),
    },
  );
}
