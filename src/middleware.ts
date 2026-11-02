import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/integrations/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  // @supabase/ssr does not run on the Edge runtime (see middleware.ts.bak);
  // Next 15.5 runs middleware on Node.js.
  runtime: "nodejs",
  // Pages only. /api routes either have no session (agent, cron, bots) or
  // manage cookies themselves (/api/auth/callback exchanges the PKCE code and
  // must not see a refreshed copy of the previous session).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
