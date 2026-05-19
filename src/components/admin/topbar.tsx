import { getCurrentProfile } from "@/lib/auth";
import { TopbarRight } from "./topbar-right";

export async function AdminTopbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <header className="bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-line sticky top-0 z-20">
      <div className="h-16 px-6 lg:px-8 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-base md:text-lg font-bold tracking-tight text-ink-1 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-ink-3 truncate">{subtitle}</p>
          )}
        </div>

        <TopbarRight
          profile={
            profile
              ? {
                  name: profile.full_name ?? profile.email,
                  email: profile.email,
                  role: profile.role,
                  avatarUrl: profile.avatar_url,
                }
              : null
          }
          actions={actions}
        />
      </div>
    </header>
  );
}
