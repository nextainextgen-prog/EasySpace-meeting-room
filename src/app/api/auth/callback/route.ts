import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

/**
 * Handles Supabase Auth callback for OAuth providers and magic links.
 * Provider flow:
 *   1. Browser hits `/login` → Supabase redirects to Google
 *   2. Google redirects to `/api/auth/callback?code=...`
 *   3. We exchange code for session, then send the user to `next` (or /admin)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
