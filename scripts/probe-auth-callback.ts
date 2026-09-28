/**
 * Probes the deployed OAuth callback with hand-built cookies, to prove whether
 * the PKCE code-verifier is being read on the server side.
 *
 * "invalid flow state"  = the verifier arrived and was used (the fake code is
 *                         what Supabase rejected) — the server is healthy.
 * "code verifier not found" = the verifier never reached the exchange.
 *
 * Written while chasing the "first Google login always fails, retry works"
 * bug; keep it for the next time auth misbehaves.
 *
 *   npx tsx scripts/probe-auth-callback.ts
 */
const BASE = "https://easy-space-meeting-room-yjqk.vercel.app";
const REF = "njrpvtokccrfmegkplbn";
const KEY = `sb-${REF}-auth-token`;
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const enc = (v: string) => "base64-" + b64url(v);

const verifier = enc(JSON.stringify("v".repeat(56)));
const stale = enc(JSON.stringify({
  access_token: "eyJhbGciOiJIUzI1NiJ9.e30.x",
  refresh_token: "stale-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now()/1000) - 7200,
  token_type: "bearer",
  user: { id: "00000000-0000-0000-0000-000000000000", aud: "authenticated", role: "authenticated", email: "x@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
}));
const half = Math.ceil(stale.length / 2);

async function probe(label: string, cookie: string) {
  const res = await fetch(`${BASE}/api/auth/callback?code=fake-code-for-probe`, {
    redirect: "manual",
    headers: { cookie },
  });
  const loc = res.headers.get("location") ?? "";
  const reason = decodeURIComponent(new URL(loc, BASE).searchParams.get("reason") ?? "(none)");
  console.log(`\n${label}`);
  console.log(`  → ${reason.slice(0, 100)}`);
  console.log(`  ${/code verifier not found/i.test(reason) ? "✗ VERIFIER MISSING" : "✓ verifier reached the server"}`);
}

async function main() {
  await probe("1. verifier cookie only", `${KEY}-code-verifier=${verifier}`);
  await probe("2. verifier + chunked stale session (what a returning visitor sends)",
    `${KEY}.0=${stale.slice(0, half)}; ${KEY}.1=${stale.slice(half)}; ${KEY}-code-verifier=${verifier}`);
  await probe("3. stale session only, no verifier", `${KEY}.0=${stale.slice(0, half)}; ${KEY}.1=${stale.slice(half)}`);
  await probe("4. no cookies at all", "");
  console.log("");
}
main();
