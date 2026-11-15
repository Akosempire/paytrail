"use server";
import { requireBusiness } from "@/lib/context";
import { featuresOf, hasFeature } from "@/lib/entitlements";
import { whatsappConfig } from "@/lib/whatsapp/config";
import { readMessageWithAi } from "@/lib/paste-ai-run";
import { PASTE_AI_MAX } from "@/lib/paste-ai";

// "Paste a list" with AI: reads a customer's message into invoice lines with
// the AI set in Admin → Integrations → WhatsApp → AI. Paying businesses only:
// not the Free plan, not the free trial. Everyone else gets the simple reading.
// Anything that goes wrong answers { fallback } and the editor uses its own
// simple reading instead, so pasting always works.
const recent = new Map(); // business → times of recent reads (per server; a light brake on the free quota)

// on a paid plan right now (a trial or the Free plan doesn't count), and the plan includes AI
async function isPaying(ctx) {
  const { data: a } = await ctx.supabase.rpc("business_allowance", { target: ctx.business.id });
  if (!["plan", "plan_limit"].includes(a?.reason)) return false;
  return hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "ai_full");
}

// whether this business may use AI reading (the editor asks once, to show the switch or the upgrade note)
export async function pasteAiAccess() {
  try {
    const ctx = await requireBusiness();
    if (!(await isPaying(ctx))) return { ai: false, reason: "plan" };
    return (await whatsappConfig()).ai ? { ai: true } : { ai: false, reason: "off" };
  } catch { return { ai: false, reason: "error" }; }
}

export async function readPastedList(text, currency = "NGN") {
  const t = String(text || "").trim().slice(0, PASTE_AI_MAX);
  if (t.length < 3) return { fallback: "empty" };
  try {
    const ctx = await requireBusiness();
    if (!(await isPaying(ctx))) return { fallback: "plan" };
    const cfg = await whatsappConfig();
    if (!cfg.ai) return { fallback: "off" };
    const now = Date.now();
    const times = (recent.get(ctx.business.id) || []).filter((x) => now - x < 60_000);
    if (times.length >= 12) return { fallback: "busy" };
    recent.set(ctx.business.id, [...times, now]);
    const read = await readMessageWithAi(cfg.ai, t, currency);
    return read ? { ai: true, ...read } : { fallback: "unreadable" };
  } catch (e) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return { fallback: "signed-out" };
    const message = String(e?.message || "");
    console.error("paste_ai.failed", { message: message.slice(0, 200) });
    // say why, in words: over the free limit, a key problem, or the AI being slow
    if (/limit|credit|429/i.test(message)) return { fallback: "error", why: "The AI is over its limit right now. Try again in a minute." };
    if (/key|accept/i.test(message)) return { fallback: "error", why: "The AI key isn't working. Ask your admin to check it." };
    if (/timeout|abort|reach/i.test(message)) return { fallback: "error", why: "The AI took too long. Try again." };
    return { fallback: "error", why: "" };
  }
}
