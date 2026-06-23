"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { cn } from "@/lib/cn";

const LAST_INVITE_COOKIE = "easyspace.last_invite";

interface Props {
  inviteCode: string;
}

export function BookGoogleButton({ inviteCode }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember which invite the user landed on so the logout/callback flow
  // can bring them back here instead of the generic /member-login page.
  useEffect(() => {
    document.cookie = `${LAST_INVITE_COOKIE}=${encodeURIComponent(
      inviteCode,
    )}; path=/; max-age=2592000; SameSite=Lax`;
  }, [inviteCode]);

  async function signIn() {
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/api/auth/callback` },
    });
    if (err) {
      setPending(false);
      setError(err.message);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-input bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className={cn(
          "w-full h-12 rounded-pill",
          "bg-gradient-to-r from-primary-600 to-primary-500 text-white",
          "text-[15px] font-semibold tracking-tight",
          "inline-flex items-center justify-center gap-3",
          "shadow-card hover:shadow-card-hover active:scale-[0.99] transition",
          "disabled:opacity-60 disabled:pointer-events-none",
        )}
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            กำลังเปิด Google...
          </>
        ) : (
          <>
            <span className="w-7 h-7 rounded-full bg-white grid place-items-center shrink-0">
              <GoogleColorIcon />
            </span>
            เข้าสู่ระบบด้วย Google
          </>
        )}
      </button>
    </div>
  );
}

/** Official Google "G" mark — full-color per Google brand guidelines. */
function GoogleColorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
