"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

/**
 * Keeps the Supabase session alive in the browser.
 *
 * Every protected page calls `getUser()` on the server, which *would* refresh
 * an expiring token — except a Server Component cannot write cookies, so the
 * refreshed token is computed and thrown away (see supabase/server.ts). With
 * middleware disabled for Edge-runtime reasons, nothing else persists it, so
 * the session died roughly an hour after login no matter what the user ticked.
 *
 * Mounting the browser client fixes that: it owns `autoRefreshToken`, and it
 * writes through `document.cookie`, where the write actually lands. The extra
 * `getSession()` on tab focus covers laptops that were asleep past expiry — the
 * auto-refresh timer doesn't fire while suspended.
 */
export function SessionKeeper() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
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
