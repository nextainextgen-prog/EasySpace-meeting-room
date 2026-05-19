import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  // Route back to the appropriate login screen based on where the user was
  const referer = request.headers.get("referer") ?? "";
  const explicitNext = request.nextUrl.searchParams.get("next");

  let dest = "/login?error=signed_out";
  try {
    const refUrl = referer ? new URL(referer) : null;
    const path = refUrl?.pathname ?? "";
    if (
      explicitNext === "member" ||
      path.startsWith("/app") ||
      path.startsWith("/book") ||
      path === "/member-login"
    ) {
      dest = "/member-login?error=signed_out";
    }
  } catch {
    // referer not parseable — fall back to admin login
  }

  const url = new URL(dest, request.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
