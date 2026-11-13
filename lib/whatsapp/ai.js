import "server-only";

// The bot's AI: Claude (Anthropic) or OpenAI with tool use, called with fetch.
// The model only reads and makes drafts directly; anything that sends, records
// money or cancels comes back as a change the person confirms with YES (see bot.js).
const TIMEOUT = 25_000;

function friendly(provider, status, data) {
  const who = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const msg = String(data?.error?.message || "").slice(0, 200);
  if (status === 401 || status === 403) return `${who} didn't accept the API key. Create a new key and paste it again.`;
  if (status === 404 || /model/i.test(msg) && status === 400) return `${who} doesn't know that model name. Leave it empty to use the default.`;
  if (status === 429) return `${who} says the key is out of credit or over its rate limit. Check billing in your ${who} account.`;
  return msg ? `${who}: ${msg}` : `${who} answered ${status}.`;
}

async function post(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const anthropic = (ai, body) => post("https://api.anthropic.com/v1/messages", { "x-api-key": ai.key, "anthropic-version": "2023-06-01" }, { model: ai.model, ...body });
const openai = (ai, body) => post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${ai.key}` }, { model: ai.model, ...body });

// a tiny request to check the key and model
export async function checkAi(ai) {
  try {
    const r = ai.provider === "anthropic"
      ? await anthropic(ai, { max_tokens: 8, messages: [{ role: "user", content: "Say OK." }] })
      : await openai(ai, { max_completion_tokens: 8, messages: [{ role: "user", content: "Say OK." }] });
    return r.ok ? { ok: true } : { ok: false, error: friendly(ai.provider, r.status, r.data) };
  } catch {
    return { ok: false, error: `Couldn't reach ${ai.provider === "anthropic" ? "Anthropic" : "OpenAI"}. Try again in a minute.` };
  }
}

// One turn: the person's message plus recent turns in, the bot's reply out.
// tools: [{ name, description, schema }]; callTool(name, input) → text for the model.
// stop() lets a tool end the turn early (e.g. a change now waits for YES).
export async function runAi({ ai, system, history, message, tools, callTool, maxSteps = 6 }) {
  const turns = [...(history || []).slice(-12), { role: "user", content: message }];
  if (ai.provider === "anthropic") {
    const messages = turns.map((t) => ({ role: t.role, content: t.content }));
    const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
    for (let step = 0; step < maxSteps; step++) {
      const r = await anthropic(ai, { max_tokens: 1024, system, tools: defs, messages });
      if (!r.ok) throw new Error(friendly("anthropic", r.status, r.data));
      const content = r.data.content || [];
      const calls = content.filter((c) => c.type === "tool_use");
      const said = content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      if (!calls.length || r.data.stop_reason !== "tool_use") return said;
      messages.push({ role: "assistant", content });
      const results = [];
      for (const c of calls) results.push({ type: "tool_result", tool_use_id: c.id, content: String(await callTool(c.name, c.input || {})).slice(0, 12_000) });
      messages.push({ role: "user", content: results });
    }
    return "";
  }
  const messages = [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role, content: t.content }))];
  const defs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));
  for (let step = 0; step < maxSteps; step++) {
    const r = await openai(ai, { max_completion_tokens: 1024, tools: defs, messages });
    if (!r.ok) throw new Error(friendly("openai", r.status, r.data));
    const msg = r.data.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) return String(msg.content || "").trim();
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: calls });
    for (const c of calls) {
      let input = {};
      try { input = JSON.parse(c.function?.arguments || "{}"); } catch { input = {}; }
      messages.push({ role: "tool", tool_call_id: c.id, content: String(await callTool(c.function?.name, input)).slice(0, 12_000) });
    }
  }
  return "";
}
