import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { recordLogin } from "@/lib/auth";

/**
 * Supabase Auth callback. Handles OAuth + magic-link redirects:
 *   1. Browser hits `/login` → Supabase redirects to provider
 *   2. Provider redirects to `/api/auth/callback?code=...`
 *   3. We exchange the code for a session, stamp `profiles.last_login_at`,
 *      then redirect to `next` (or `/admin/dashboard`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const ip = forwardedFor?.split(",")[0]?.trim();
      await recordLogin(data.user.id, ip);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
