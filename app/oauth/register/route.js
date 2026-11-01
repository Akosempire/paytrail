import { createSupabaseService } from "@/lib/supabase/server";
import { registerClient } from "@/lib/ai/oauth";
import { json, preflight } from "@/lib/ai/http";
import { clientIp, underLimit } from "@/lib/guard";

// RFC 7591 Dynamic Client Registration: ChatGPT, Claude or Grok registers
// itself the first time someone connects it
export async function POST(request) {
  if (!(await underLimit("oauth_register", await clientIp(), 3600, 30))) return json({ error: "slow_down", error_description: "Too many registrations. Try again later." }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_client_metadata", error_description: "Send the app's details as JSON." }, 400); }
  const r = await registerClient(createSupabaseService(), body);
  if (r.error) return json({ error: r.error, error_description: r.description }, r.error === "server_error" ? 500 : 400);
  return json(r, 201);
}
export const OPTIONS = preflight;
