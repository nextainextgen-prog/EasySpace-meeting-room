"use client";

import { useEffect } from "react";
import {
  createSupabaseBrowserClient,
  isRemembered,
} from "@/lib/integrations/supabase/client";

/** Present for the life of one browser session; sessionStorage is wiped when
 *  the browser (not the tab) is closed, which is exactly the boundary
 *  "จำการเข้าสู่ระบบ" is about. */
const BROWSER_SESSION_FLAG = "easyspace.browser-session";

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

    let freshBrowserSession = false;
    try {
      freshBrowserSession = !sessionStorage.getItem(BROWSER_SESSION_FLAG);
      sessionStorage.setItem(BROWSER_SESSION_FLAG, "1");
    } catch {
      // Storage blocked — treat it as a continuing session rather than
      // signing someone out on every single page load.
    }

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
