import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import {
  authCookieOptions,
  isSupabaseAuthCookie,
} from "@/lib/integrations/supabase/cookie-options";

const LAST_INVITE_COOKIE = "easyspace.last_invite";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function POST(request: NextRequest) {
  // Route back to the appropriate login screen based on where the user was.
  // Members must NEVER land on the admin-styled /member-login page — they go
  // back to their org's /book/<code> landing if we still know the invite code.
  const referer = request.headers.get("referer") ?? "";
  const explicitNext = request.nextUrl.searchParams.get("next");
  const lastInvite = request.cookies.get(LAST_INVITE_COOKIE)?.value ?? null;

  let dest = "/login?error=signed_out";
  let isMember = false;
  try {
    const refUrl = referer ? new URL(referer) : null;
    const path = refUrl?.pathname ?? "";
    if (
      explicitNext === "member" ||
      path.startsWith("/app") ||
      path.startsWith("/book") ||
      path === "/member-login"
    ) {
      isMember = true;
      dest = lastInvite
        ? `/book/${encodeURIComponent(lastInvite)}?signed_out=1`
        : "/";
    }
  } catch {
    // referer not parseable — fall back to admin login
  }

  const response = NextResponse.redirect(new URL(dest, request.url), {
    status: 303,
  });

  // The client must write its cookie deletions onto THIS response. Going
  // through `cookies()` and then returning a freshly built redirect silently
  // drops them, leaving a revoked `sb-*` token in the browser — which then
  // poisons the next Google login and makes it fail on the first attempt.
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
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.signOut();

  // Belt and braces: expire every Supabase cookie still on the request,
  // including the chunked `.0`/`.1` parts and a stale PKCE verifier. signOut()
  // only clears the ones it knows about in this runtime.
  for (const c of request.cookies.getAll()) {
    if (isSupabaseAuthCookie(c.name)) {
      response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  // Clear the last_invite hint after a member logout so a future admin
  // logout on the same browser doesn't bounce to a member page.
  if (isMember) {
    response.cookies.set(LAST_INVITE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
