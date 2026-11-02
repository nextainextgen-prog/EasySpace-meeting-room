"use client";

import { useEffect } from "react";
import {
  createSupabaseBrowserClient,
  isRemembered,
} from "@/lib/integrations/supabase/client";

/** Present for the life of one browser session: a cookie with no max-age is
 *  dropped when the browser closes and is shared by every tab, which is
 *  exactly the boundary "จำการเข้าสู่ระบบ" is about. (sessionStorage was used
 *  before, but it is per tab, so every new tab looked like a fresh browser
 *  launch and signed the user out.) */
const BROWSER_SESSION_COOKIE = "easyspace.browser_session";

/**
 * Keeps the Supabase session alive — and honours the user's choice not to.
 *
 * Staying signed in: every protected page calls `getUser()` on the server,
 * which *would* refresh an expiring token — except a Server Component cannot
 * write cookies, so the refreshed token is computed and thrown away (see
 * supabase/server.ts). With middleware disabled for Edge-runtime reasons,
 * nothing else persisted it, so the session died about an hour after login.
 * The browser client owns `autoRefreshToken` and writes through
 * `document.cookie`, where the write actually lands.
 *
 * Not staying signed in: @supabase/ssr forces its own 400-day cookie lifetime
 * regardless of what we ask for, so declining the checkbox cannot be expressed
 * as a shorter cookie. It is enforced here instead — first page load of a new
 * browser session, with the preference set to "no", signs the user out.
 */
export function SessionKeeper() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const freshBrowserSession = !document.cookie
      .split(";")
      .some((c) => c.trim().startsWith(`${BROWSER_SESSION_COOKIE}=`));
    document.cookie = `${BROWSER_SESSION_COOKIE}=1; path=/; SameSite=Lax`;

    if (freshBrowserSession && !isRemembered()) {
      void supabase.auth.signOut().then(() => {
        window.location.href = "/login?error=signed_out";
      });
      return;
    }

    void supabase.auth.getSession();

    function onFocus() {
      if (document.visibilityState === "visible") {
        void supabase.auth.getSession();
      }
    }
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
