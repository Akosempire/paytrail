import "server-only";
import { PROVIDERS, chatModels, simpleSchema } from "@/lib/whatsapp/providers";

// The bot's AI, called with fetch: Claude (Anthropic's own API), or OpenAI,
// Google Gemini and Groq (all through the OpenAI-style chat API). The model
// only reads and makes drafts directly; anything that sends, records money or
// cancels comes back as a change the person confirms with YES (see bot.js).
const TIMEOUT = 25_000;

function friendly(provider, status, data) {
  const who = PROVIDERS[provider]?.name || "The AI provider";
  const raw = Array.isArray(data) ? data[0] : data;
  const msg = String(raw?.error?.message || "").slice(0, 200);
  if (status === 401 || status === 403 || /api key not valid|invalid api key/i.test(msg)) return `${who} didn't accept the API key. Create a new key and paste it again.`;
  if (status === 404 || (status === 400 && /model/i.test(msg))) return `${who} doesn't offer that model to this key. Pick another from the list.`;
  if (status === 429) return `${who} says the key is over its limit${PROVIDERS[provider]?.free ? " (free tiers allow only so many messages a minute and a day)" : " or out of credit"}. Try again later or pick another model.`;
  return msg ? `${who}: ${msg}` : `${who} answered ${status}.`;
}

async function request(url, { method = "POST", headers, body }) {
  const res = await fetch(url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
const headersFor = (ai) => PROVIDERS[ai.provider].style === "anthropic"
  ? { "x-api-key": ai.key, "anthropic-version": "2023-06-01" }
  : { authorization: `Bearer ${ai.key}`, ...(ai.provider === "openrouter" ? { "x-title": "Usetally WhatsApp" } : {}) };

const chat = (ai, body) => {
  const p = PROVIDERS[ai.provider];
  if (p.style === "anthropic") return request(`${p.base}/messages`, { headers: headersFor(ai), body: { model: ai.model, ...body } });
  const { max_tokens, ...rest } = body;
  return request(`${p.base}/chat/completions`, { headers: headersFor(ai), body: { model: ai.model, [p.tokensField]: max_tokens, ...rest } });
};

// the models this key can use, chat models only, best for the bot first
export async function listModels({ provider, key }) {
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, error: "Pick a provider." };
  try {
    const r = await request(`${p.base}/models${p.style === "anthropic" ? "?limit=100" : ""}`, { method: "GET", headers: headersFor({ provider, key }) });
    if (!r.ok) return { ok: false, error: friendly(provider, r.status, r.data) };
    const models = chatModels(provider, r.data?.data || r.data?.models || []);
    return models.length ? { ok: true, models } : { ok: false, error: `${p.name} accepted the key but listed no chat models for it.` };
  } catch {
    return { ok: false, error: `Couldn't reach ${p.name}. Try again in a minute.` };
  }
}

// a tiny request to check the key and model
export async function checkAi(ai) {
  try {
    const r = await chat(ai, { max_tokens: 16, messages: [{ role: "user", content: "Say OK." }] });
    return r.ok ? { ok: true } : { ok: false, error: friendly(ai.provider, r.status, r.data) };
  } catch {
    return { ok: false, error: `Couldn't reach ${PROVIDERS[ai.provider]?.name || "the AI provider"}. Try again in a minute.` };
  }
}

// a single question whose answer should be JSON (reading a pasted list)
export async function askJson(ai, system, text) {
  const p = PROVIDERS[ai.provider];
  const body = p.style === "anthropic"
    ? { max_tokens: 1200, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: text }] }
    : { max_tokens: 1200, messages: [{ role: "system", content: system }, { role: "user", content: text }] };
  const r = await chat(ai, body);
  if (!r.ok) throw new Error(friendly(ai.provider, r.status, r.data));
  return p.style === "anthropic" ? (r.data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("") : String(r.data.choices?.[0]?.message?.content || "");
}

// One turn: the person's message plus recent turns in, the bot's reply out.
// tools: [{ name, description, schema }]; callTool(name, input) → text for the model.
// Token savings (all providers): the last 6 turns only, short replies, tool
// results trimmed, at most 4 tool rounds. Claude also caches the instructions
// and tool list, so after the first message they cost a tenth.
const HISTORY = 6, REPLY_TOKENS = 600, RESULT_CHARS = 4000;
export async function runAi({ ai, system, history, message, tools, callTool, maxSteps = 4 }) {
  const turns = [...(history || []).slice(-HISTORY), { role: "user", content: message }];
  const p = PROVIDERS[ai.provider];
  if (p.style === "anthropic") {
    const messages = turns.map((t) => ({ role: t.role, content: t.content }));
    const defs = tools.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.schema, ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
    const sys = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
    for (let step = 0; step < maxSteps; step++) {
      const r = await chat(ai, { max_tokens: REPLY_TOKENS, system: sys, tools: defs, messages });
      if (!r.ok) throw new Error(friendly(ai.provider, r.status, r.data));
      const content = r.data.content || [];
      const calls = content.filter((c) => c.type === "tool_use");
      const said = content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      if (!calls.length || r.data.stop_reason !== "tool_use") return said;
      messages.push({ role: "assistant", content });
      const results = [];
      for (const c of calls) results.push({ type: "tool_result", tool_use_id: c.id, content: String(await callTool(c.name, c.input || {})).slice(0, RESULT_CHARS) });
      messages.push({ role: "user", content: results });
    }
    return "";
  }
  const messages = [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role, content: t.content }))];
  const defs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: ai.provider === "gemini" ? simpleSchema(t.schema) : t.schema } }));
  for (let step = 0; step < maxSteps; step++) {
    const r = await chat(ai, { max_tokens: REPLY_TOKENS, tools: defs, messages });
    if (!r.ok) throw new Error(friendly(ai.provider, r.status, r.data));
    const msg = r.data.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) return String(msg.content || "").trim();
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let input = {};
      try { input = JSON.parse(c.function?.arguments || "{}"); } catch { input = {}; }
      messages.push({ role: "tool", tool_call_id: c.id, content: String(await callTool(c.function?.name, input)).slice(0, RESULT_CHARS) });
    }
  }
  return "";
}
