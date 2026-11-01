import { createSupabaseService } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/ai/oauth";
import { preflight, readBody, CORS } from "@/lib/ai/http";

// RFC 7009: the app disconnects itself
export async function POST(request) {
  const b = await readBody(request);
  if (b.token) await revokeToken(createSupabaseService(), String(b.token)).catch(() => null);
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
