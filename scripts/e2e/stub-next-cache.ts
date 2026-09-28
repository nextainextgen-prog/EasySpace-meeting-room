// revalidatePath/revalidateTag need a Next request context; outside one they
// throw. Recording them keeps the assertions honest about what was revalidated.
export const revalidated: string[] = [];
export function revalidatePath(p: string) { revalidated.push(p); }
export function revalidateTag(t: string) { revalidated.push(`tag:${t}`); }
export function unstable_cache<T>(fn: T) { return fn; }
