"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  recordAdminPageView,
  recordAdminSessionStart,
} from "@/lib/actions/audit";

const SESSION_FLAG = "easyspace.session.started";
const PAGE_VIEW_THROTTLE_KEY = "easyspace.pageview.lastpath";

/**
 * Drops a session-start audit row once per browser session, then a
 * page_view row whenever the admin navigates to a new admin path. Cheap
 * client-side throttle prevents the same path firing twice in a row.
 */
export function AuditTracker() {
  const pathname = usePathname();
  const sentSession = useRef(false);

  useEffect(() => {
    if (!pathname?.startsWith("/admin")) return;
    if (!sentSession.current) {
      sentSession.current = true;
      try {
        const has = sessionStorage.getItem(SESSION_FLAG);
        if (!has) {
          sessionStorage.setItem(SESSION_FLAG, "1");
          void recordAdminSessionStart();
        }
      } catch {
        // ignore — privacy mode etc.
      }
    }

    try {
      const last = sessionStorage.getItem(PAGE_VIEW_THROTTLE_KEY);
      if (last === pathname) return;
      sessionStorage.setItem(PAGE_VIEW_THROTTLE_KEY, pathname);
    } catch {
      // ignore
    }
    void recordAdminPageView(pathname);
  }, [pathname]);

  return null;
}
