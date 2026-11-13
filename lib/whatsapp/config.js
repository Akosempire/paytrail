import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { siteUrl } from "@/lib/site";

// The WhatsApp bot's settings (Admin → Integrations → WhatsApp), read with the
// service key and kept for 60 seconds. Secrets are decrypted only here.
let cache = null;
export function forgetWhatsappConfig() { cache = null; }

export const webhookUrl = () => `${siteUrl()}/api/whatsapp/webhook`;

export const AI_DEFAULT_MODEL = { anthropic: "claude-haiku-5-5", openai: "gpt-4.1-mini" };

export async function whatsappConfig() {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  let row = null;
  try {
    const { data, error } = await createSupabaseService().from("platform_settings")
      .select("wa_enabled, wa_account_sid, wa_auth_token_enc, wa_token_hint, wa_from, wa_account_name, wa_checked_at, wa_tpl_invoice, wa_tpl_quote, wa_tpl_receipt, wa_ai_provider, wa_ai_key_enc, wa_ai_key_hint, wa_ai_model, wa_ai_checked_at")
      .eq("id", true).maybeSingle();
    if (error) return { ready: false, missingSql: /wa_|column|schema cache/i.test(error.message || ""), ai: null, saved: null };
    row = data;
  } catch {
    return { ready: false, ai: null, saved: null };
  }
  const r = row || {};
  const open = (v) => { try { return decryptSecret(v); } catch { return ""; } };
  const token = r.wa_auth_token_enc ? open(r.wa_auth_token_enc) : "";
  const aiKey = r.wa_ai_key_enc ? open(r.wa_ai_key_enc) : "";
  const provider = ["anthropic", "openai"].includes(r.wa_ai_provider) ? r.wa_ai_provider : "off";
  const connected = Boolean(r.wa_account_sid && token && r.wa_from);
  const value = {
    connected,
    ready: connected && Boolean(r.wa_enabled),
    enabled: Boolean(r.wa_enabled),
    accountSid: r.wa_account_sid || "",
    authToken: token,
    from: r.wa_from || "",
    templates: { invoice: r.wa_tpl_invoice || "", quote: r.wa_tpl_quote || "", receipt: r.wa_tpl_receipt || "" },
    ai: provider !== "off" && aiKey ? { provider, key: aiKey, model: r.wa_ai_model || AI_DEFAULT_MODEL[provider] } : null,
    saved: row ? {
      enabled: Boolean(r.wa_enabled), accountSid: r.wa_account_sid || "", tokenHint: r.wa_token_hint || "", from: r.wa_from || "",
      accountName: r.wa_account_name || "", checkedAt: r.wa_checked_at, templates: { invoice: r.wa_tpl_invoice || "", quote: r.wa_tpl_quote || "", receipt: r.wa_tpl_receipt || "" },
      aiProvider: provider, aiKeyHint: r.wa_ai_key_hint || "", aiModel: r.wa_ai_model || "", aiCheckedAt: r.wa_ai_checked_at, hasToken: Boolean(r.wa_auth_token_enc), hasAiKey: Boolean(r.wa_ai_key_enc),
    } : null,
  };
  cache = { at: Date.now(), value };
  return value;
}
