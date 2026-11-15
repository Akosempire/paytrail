"use server";
import { requireBusiness } from "@/lib/context";
import { featuresOf, hasFeature } from "@/lib/entitlements";
import { whatsappConfig } from "@/lib/whatsapp/config";
import { askJson } from "@/lib/whatsapp/ai";
import { PASTE_AI_MAX, pasteAiPrompt, readPasteAi } from "@/lib/paste-ai";

// "Paste a list" with AI: reads a customer's message into invoice lines with
// the free AI set in Admin → Integrations → WhatsApp → AI. Paid plans.
// Anything that goes wrong answers { fallback } and the editor uses its own
// simple reading instead, so pasting always works.
const recent = new Map(); // business → times of recent reads (per server; a light brake on the free quota)

export async function readPastedList(text, currency = "NGN") {
  const t = String(text || "").trim().slice(0, PASTE_AI_MAX);
  if (t.length < 3) return { fallback: "empty" };
  try {
    const ctx = await requireBusiness();
    if (!hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "ai_full")) return { fallback: "plan" };
    const cfg = await whatsappConfig();
    if (!cfg.ai) return { fallback: "off" };
    const now = Date.now();
    const times = (recent.get(ctx.business.id) || []).filter((x) => now - x < 60_000);
    if (times.length >= 12) return { fallback: "busy" };
    recent.set(ctx.business.id, [...times, now]);
    const reply = await askJson(cfg.ai, pasteAiPrompt(String(currency || "NGN").slice(0, 3)), t);
    const read = readPasteAi(reply, t);
    return read ? { ai: true, ...read } : { fallback: "unreadable" };
  } catch (e) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return { fallback: "signed-out" };
    console.error("paste_ai.failed", { message: String(e?.message || "").slice(0, 200) });
    return { fallback: "error" };
  }
}
