import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/book", // /book/[code] landing page must remain public
];

function isPublic(pathname: string) {
  if (pathname.startsWith("/api/cron")) return true; // protected by header
  if (pathname.startsWith("/api/telegram")) return true; // protected by token
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refreshes Supabase auth cookies on every navigation and bounces unsigned-in
 * users away from `/admin/*` and `/app/*`. Role-level enforcement happens at
 * the page boundary via `requireRole()` to avoid a DB round trip per request.
 */
export async function updateSupabaseSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublic(pathname)) {
    return supabaseResponse;
  }

  const needsAuth =
    pathname.startsWith("/admin") || pathname.startsWith("/app");

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
