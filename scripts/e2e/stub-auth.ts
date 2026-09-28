// Test double for @/lib/auth — the real one wraps lookups in React's cache(),
// which only exists inside a React render.
export interface AuthProfile { id: string; email: string; full_name: string | null; role: string }
export async function getCurrentUser() { return null; }
export async function getCurrentProfile(): Promise<AuthProfile | null> { return null; }
export async function requireAuth(): Promise<AuthProfile> { throw new Error("not used in e2e"); }
export async function requireRole(): Promise<AuthProfile> { throw new Error("not used in e2e"); }
export function hasRole() { return true; }
export async function recordLogin() {}
export const ROUTE_ROLE_REQUIREMENTS: Array<{ prefix: string; role: string }> = [];
export function requiredRoleForPath() { return null; }
export function roleRank() { return 0; }
