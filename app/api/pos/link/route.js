import { createSupabaseService } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { clientIp, underLimit } from "@/lib/guard";
import { fail, json, readJson } from "@/lib/pos";
import { generateKey, hashSecret, keyHint, validateLink } from "@/lib/pos-core";

// TrackOja's usetally-connect function swaps the one-time code from the
// approval page for a key. The only response that ever contains a key.
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!(await underLimit("poslink", await clientIp(), 600, 30))) return fail(429, "Too many requests. Wait a few minutes and retry.");
  const { body, response } = await readJson(request, 8_000);
  if (response) return response;
  const v = validateLink(body, { allowLocal: process.env.NODE_ENV !== "production" });
  if (!v.ok) return fail(400, v.error);
  const key = generateKey();
  const { data, error } = await createSupabaseService().rpc("pos_link", {
    hashed_code: hashSecret(v.value.code), new_key_hash: hashSecret(key), new_key_enc: encryptSecret(key), new_key_hint: keyHint(key),
    new_store_id: v.value.store_id, new_store_name: v.value.store_name, new_callback_base: v.value.callback_base,
  });
  if (error) {
    if (/POS400/.test(error.message || "")) return fail(400, "Code is invalid or expired");
    console.error("pos.link_failed", { message: String(error.message || "").slice(0, 200) });
    return fail(500, "Something went wrong. Retry later.");
  }
  return json({ key, business: data.business });
}
