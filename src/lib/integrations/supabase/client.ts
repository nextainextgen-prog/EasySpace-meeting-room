"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import {
  authCookieOptions,
  readRememberFlag,
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE,
} from "./cookie-options";

/** Persist the user's "จำการเข้าสู่ระบบ" choice. Stored as an explicit "0"
 *  rather than by deleting the cookie: OAuth logins have no checkbox and
 *  default to remembering, so "absent" and "declined" must not look the same. */
export function setRememberPreference(remember: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBER_COOKIE}=${
    remember ? "1" : "0"
  }; path=/; max-age=${REMEMBER_MAX_AGE}; SameSite=Lax`;
}

/** Whether the user asked to stay signed in. */
export function isRemembered() {
  return readRememberFlag(
    typeof document === "undefined" ? undefined : document.cookie,
  );
}

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Pin cookie attributes so the PKCE code-verifier cookie set here in the
      // browser is written with the SAME name/path/flags the server callback
      // reads back during exchangeCodeForSession. A mismatch (e.g. a non-Secure
      // verifier dropped on the cross-site redirect back from Google) is the
      // classic cause of "first Google login fails, retry works".
      cookieOptions: authCookieOptions(),
    },
  );
}
