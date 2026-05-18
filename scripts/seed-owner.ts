/**
 * One-shot script to provision the EasySpace owner account.
 *
 * Usage (NEVER commit credentials):
 *   OWNER_EMAIL=...@easyspace.co.th \
 *   OWNER_PASSWORD='...' \
 *   OWNER_NAME='เจ้าของระบบ' \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/seed-owner.ts
 *
 * Re-runnable: if the email already exists in auth.users, updates the
 * password and re-stamps the profile row to role=owner.
 *
 * Supabase Auth handles password hashing internally (bcrypt with secure
 * defaults). Do not roll your own.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const OWNER_NAME = process.env.OWNER_NAME ?? "เจ้าของระบบ";

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_KEY) fail("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!OWNER_EMAIL) fail("Missing OWNER_EMAIL");
if (!OWNER_PASSWORD) fail("Missing OWNER_PASSWORD");
if (OWNER_PASSWORD.length < 12) {
  fail("OWNER_PASSWORD must be ≥12 chars for the system owner");
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`→ Provisioning owner: ${OWNER_EMAIL}`);

  // 1. Look up existing user by email
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) fail(`listUsers failed: ${listErr.message}`);
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === OWNER_EMAIL!.toLowerCase(),
  );

  let userId: string;
  if (existing) {
    console.log(`  ✓ Found existing auth user (${existing.id})`);
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: OWNER_NAME },
    });
    if (error) fail(`updateUserById failed: ${error.message}`);
    userId = existing.id;
    console.log("  ✓ Password reset + email confirmed");
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: OWNER_NAME },
    });
    if (error || !data.user) fail(`createUser failed: ${error?.message}`);
    userId = data.user!.id;
    console.log(`  ✓ Created auth user (${userId})`);
  }

  // 2. Upsert profile row with role=owner
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: OWNER_EMAIL,
      full_name: OWNER_NAME,
      role: "owner",
      is_active: true,
      two_factor_enabled: false,
    } as never,
    { onConflict: "id" },
  );
  if (profileErr) fail(`profile upsert failed: ${profileErr.message}`);
  console.log("  ✓ Profile upserted with role=owner");

  console.log("\n✓ Done. Sign in at /login with the email + password above.");
}

main().catch((err) => fail((err as Error).message));
