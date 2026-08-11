/**
 * Detects the "your tab is running last week's JavaScript" failure.
 *
 * Every deploy mints new Server Action IDs. A tab left open still holds the
 * previous build's IDs, so the next action it fires — a click, or one of the
 * calendar's background refreshes — resolves to nothing on the server and
 * throws. The data is fine; only the tab is out of date, and the cure is
 * always the same: load the page again.
 *
 * Vercel's Skew Protection would route those stale requests back to the old
 * deployment, but it is a Pro/Enterprise feature and this project runs on a
 * personal account, so we handle it ourselves.
 */

const RELOAD_MARK = "easyspace.stale-reload-at";
/** Long enough that a genuinely broken action can't drive a reload loop. */
const RELOAD_COOLDOWN_MS = 60_000;

export function isStaleDeploymentError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  return (
    message.includes("Failed to find Server Action") ||
    /Server Action .* was not found on the server/.test(message)
  );
}

/**
 * Reload once to pick up the current build. Returns true when it handled the
 * error, so callers can skip showing a dead-end message for something the user
 * can do nothing about.
 */
export function reloadForStaleDeployment(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleDeploymentError(error)) return false;

  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARK) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  } catch {
    // Private mode with storage disabled — reloading once is still better
    // than leaving the user stuck on a tab that cannot talk to the server.
  }

  window.location.reload();
  return true;
}
