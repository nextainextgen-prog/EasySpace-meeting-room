// Test double for @/lib/auth — a signed-in accountant, for server actions
// that check the role before doing anything.
export interface AuthProfile { id: string; email: string; full_name: string | null; role: string }
// The id must be a real profile (invoices reference it); the test sets it.
const ME = (): AuthProfile => ({ id: process.env.E2E_PROFILE_ID ?? "", email: "e2e-accountant@example.com", full_name: "E2E บัญชี", role: "accountant" });
export async function getCurrentUser() { return null; }
export async function getCurrentProfile(): Promise<AuthProfile | null> { return null; }
export async function requireAuth(): Promise<AuthProfile> { return ME(); }
export async function requireRole(): Promise<AuthProfile> { return ME(); }
export function hasRole() { return true; }
export async function recordLogin() {}
export const ROUTE_ROLE_REQUIREMENTS: Array<{ prefix: string; role: string }> = [];
export function requiredRoleForPath() { return null; }
export function roleRank() { return 0; }
