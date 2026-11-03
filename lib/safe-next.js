// Where to send someone after signing in: only a path on this site. Rejects
// "//evil.com", "/\\evil.com", tabs and other tricks browsers turn into
// another site's address.
export function safeNext(value, fallback = "/app") {
  const next = String(value || "");
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\s\x00-\x1f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://usetally.invalid");
    return u.origin === "https://usetally.invalid" ? u.pathname + u.search + u.hash : fallback;
  } catch { return fallback; }
}
