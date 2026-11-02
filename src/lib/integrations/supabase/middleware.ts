import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { authCookieOptions } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Persists a refreshed Supabase session before any page renders.
 *
 * Server Components cannot write cookies. Without this, a page whose access
 * token had expired still refreshed it inside `getUser()` — rotating the
 * refresh token on Supabase's side — and then threw the new pair away. The
 * browser kept the old, now-spent refresh token; the next refresh (often the
 * parallel prefetches of the portal's other pages) tripped Supabase's
 * refresh-token reuse detection, which revokes the whole session. The member
 * landed on a login screen and had to sign in again.
 *
 * `getSession()` only goes to the network when the token is actually expired,
 * so a normal navigation costs nothing extra. Authorisation still happens in
 * the layouts (`requireAuth` / `requireRole`), which call `getUser()`.
 */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getSession();
  return response;
}
