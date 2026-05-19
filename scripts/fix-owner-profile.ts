/**
 * One-shot: set the owner profile row to the highest available admin role.
 *
 * Tries `owner` first; if migration 6 isn't applied on the remote DB
 * (invalid enum value), falls back to `super_admin` (which is functionally
 * identical for every role check in src/lib/auth/index.ts).
 *
 *   OWNER_EMAIL=...@... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/fix-owner-profile.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OWNER_EMAIL = process.env.OWNER_EMAIL!;
const OWNER_NAME = process.env.OWNER_NAME ?? "เจ้าของระบบ";

if (!SUPABASE_URL || !SERVICE_KEY || !OWNER_EMAIL) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Find auth user
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;
  const user = list.users.find(
    (u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase(),
  );
  if (!user) {
    console.error(`✗ auth user not found for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  console.log(`✓ auth user: ${user.id}`);

  // 2. Smoke-test service role: SELECT on profiles
  const { data: probe, error: probeErr } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();
  if (probeErr) {
    console.error(`✗ service role SELECT failed (this is the 42501 root cause if seen): ${probeErr.message} (code ${probeErr.code})`);
    process.exit(1);
  }
  console.log(`✓ service role SELECT works. Current profile:`, probe);

  // 3. Try upsert with role='owner'
  const tryRole = async (role: string) => {
    const { error } = await admin.from("profiles").upsert(
      {
        id: user.id,
        email: OWNER_EMAIL,
        full_name: OWNER_NAME,
        role,
        is_active: true,
        two_factor_enabled: false,
      } as never,
      { onConflict: "id" },
    );
    return error;
  };

  let err = await tryRole("owner");
  if (err) {
    console.log(`⚠ role='owner' failed (${err.message}). Falling back to super_admin.`);
    err = await tryRole("super_admin");
    if (err) {
      console.error(`✗ super_admin upsert also failed: ${err.message}`);
      process.exit(1);
    }
    console.log("✓ profile set to role=super_admin");
  } else {
    console.log("✓ profile set to role=owner");
  }

  // 4. Verify
  const { data: final } = await admin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  console.log("✓ final profile state:", final);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
