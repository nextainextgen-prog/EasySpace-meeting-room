import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

const LAST_INVITE_COOKIE = "easyspace.last_invite";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

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

  const url = new URL(dest, request.url);
  const response = NextResponse.redirect(url, { status: 303 });
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
