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

/**
 * Start the Google OAuth (PKCE) redirect — safely.
 *
 * `signInWithOAuth` is the one GoTrue method that neither awaits
 * `initializePromise` nor takes the storage lock: it writes the PKCE
 * code-verifier and immediately calls `location.assign`. Meanwhile the client
 * that was just constructed is running `initialize()` → `_recoverAndRefresh()`
 * in the background, and if the visitor still has a stale session cookie that
 * ends in `_saveSession()` (refresh succeeded) or `_removeSession()` (refresh
 * failed) — and *both* of those delete the `-code-verifier` key.
 *
 * The refresh is a single network round-trip; the redirect to Google is
 * several. So the deletion almost always wins, wiping the verifier that was
 * written moments earlier, and the callback comes back to a server that finds
 * nothing: "PKCE code verifier not found in storage". The retry then works,
 * because by then there is no stale token left to refresh. That is the
 * "ต้องกดเข้าสู่ระบบสองรอบ" bug.
 *
 * Draining initialization and dropping the old session locally first leaves
 * nothing that can touch storage while the browser is on its way to Google.
 */
export async function startGoogleOAuth(redirectTo: string) {
  const supabase = createSupabaseBrowserClient();

  // Waits on initializePromise and takes the lock, so any in-flight recovery
  // or token refresh has finished before we go near the verifier.
  await supabase.auth.getSession();

  // A fresh login does not need the previous session, and clearing it also
  // means the auto-refresh ticker has nothing to refresh mid-redirect.
  // `local` scope so we never sign the person out on their other devices.
  await supabase.auth.signOut({ scope: "local" });
  await supabase.auth.stopAutoRefresh();

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
