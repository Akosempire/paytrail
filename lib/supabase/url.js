// The Supabase project address, cleaned up: "https://xxxx.supabase.co".
// People often paste it with /rest/v1 (the API docs show that), /auth/v1,
// a trailing slash or spaces; any of those breaks sign-in, so strip them.
// Safe on server and browser (NEXT_PUBLIC_* is built into both).
export function supabaseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "");
  return raw.replace(/\/+(rest|auth|storage|realtime|functions)\/v1\/?.*$/i, "").replace(/\/+$/, "");
}
