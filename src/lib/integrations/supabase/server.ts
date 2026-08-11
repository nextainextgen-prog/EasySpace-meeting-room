import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { authCookieOptions, REMEMBER_COOKIE } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_COOKIE)?.value === "1";

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Must mirror the browser client (client.ts) so the verifier cookie
      // written in the browser is read/cleared with identical attributes, and
      // so a token refreshed on the server keeps the user's remember-me
      // lifetime instead of silently downgrading to a session cookie.
      cookieOptions: authCookieOptions(remember),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookies are read-only there.
            // <SessionKeeper /> refreshes the session from the browser instead,
            // where the write actually lands.
          }
        },
      },
    },
  );
}
