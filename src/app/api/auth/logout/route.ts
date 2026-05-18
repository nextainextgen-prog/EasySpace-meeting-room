import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const url = new URL("/login?error=signed_out", request.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
