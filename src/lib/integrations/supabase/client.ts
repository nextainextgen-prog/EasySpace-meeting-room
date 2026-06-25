"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Pin cookie attributes so the PKCE code-verifier cookie set here in the
      // browser is written with the SAME name/path/flags the server callback
      // reads back during exchangeCodeForSession. A mismatch (e.g. a non-Secure
      // verifier dropped on the cross-site redirect back from Google) is the
      // classic cause of "first Google login fails, retry works".
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}
