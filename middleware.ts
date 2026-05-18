import { NextResponse, type NextRequest } from "next/server";

/**
 * Stripped-down middleware: just lets all requests through.
 *
 * Why no auth check here? @supabase/ssr 0.5.x uses Node-only globals
 * (`__dirname`) that fail in Vercel's Edge runtime, and the experimental
 * Node middleware runtime fails to resolve ESM imports. So we move auth
 * enforcement entirely to layout level — `requireAuth()` / `requireRole()`
 * in src/lib/auth/index.ts, called from each protected layout.
 *
 * Trade-off: Supabase session cookies don't auto-refresh on every nav.
 * They still refresh on getUser() calls, which every protected page does.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
