// The AI providers the WhatsApp bot can use, in one place: where to call,
// what their keys look like (so a pasted key picks its provider), how to list
// their models, and which model to pick by default. Pure, so it's tested.

export const PROVIDERS = {
  gemini: {
    name: "Google Gemini", free: true, keyPrefix: /^AIza[0-9A-Za-z_-]{20,}$/, keyHint: "starts with AIza",
    where: "aistudio.google.com → Get API key (free tier; Flash models)",
    base: "https://generativelanguage.googleapis.com/v1beta/openai", style: "openai", tokensField: "max_tokens",
    fallback: "gemini-2.5-flash",
  },
  groq: {
    name: "Groq", free: true, keyPrefix: /^gsk_[0-9A-Za-z]{20,}$/, keyHint: "starts with gsk_",
    where: "console.groq.com → API Keys (free tier, no card)",
    base: "https://api.groq.com/openai/v1", style: "openai", tokensField: "max_completion_tokens",
    fallback: "llama-3.3-70b-versatile",
  },
  nvidia: {
    name: "NVIDIA", free: true, keyPrefix: /^nvapi-[0-9A-Za-z_-]{20,}$/, keyHint: "starts with nvapi-",
    where: "build.nvidia.com → pick a model → Get API Key (free for developers)",
    base: "https://integrate.api.nvidia.com/v1", style: "openai", tokensField: "max_tokens",
    fallback: "meta/llama-3.3-70b-instruct",
  },
  openrouter: {
    name: "DeepSeek (OpenRouter)", free: true, keyPrefix: /^sk-or-(v1-)?[0-9A-Za-z_-]{20,}$/, keyHint: "starts with sk-or-",
    where: "openrouter.ai → Keys → Create key (free models end in :free; about 50 messages a day without credit)",
    base: "https://openrouter.ai/api/v1", style: "openai", tokensField: "max_tokens",
    fallback: "deepseek/deepseek-chat-v3-0324:free",
  },
  anthropic: {
    name: "Claude (Anthropic)", free: false, keyPrefix: /^sk-ant-[0-9A-Za-z_-]{20,}$/, keyHint: "starts with sk-ant-",
    where: "console.anthropic.com → API Keys (add credit under Billing)",
    base: "https://api.anthropic.com/v1", style: "anthropic",
    fallback: "claude-haiku-5-5",
  },
  openai: {
    name: "OpenAI", free: false, keyPrefix: /^sk-(?!ant-)[0-9A-Za-z_-]{20,}$/, keyHint: "starts with sk-",
    where: "platform.openai.com → API keys (add credit under Billing)",
    base: "https://api.openai.com/v1", style: "openai", tokensField: "max_completion_tokens",
    fallback: "gpt-4.1-mini",
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const FREE_IDS = PROVIDER_IDS.filter((p) => PROVIDERS[p].free);

// a pasted key → its provider (or null)
export function providerOfKey(key) {
  const k = String(key || "").trim().replace(/^["']|["']$/g, "");
  return PROVIDER_IDS.find((p) => PROVIDERS[p].keyPrefix.test(k)) || null;
}

// the provider's model list → chat models only, best first, labelled
const SKIP = /embed|whisper|tts|audio|realtime|transcri|image|vision-preview|dall-e|moderation|guard|search|computer-use|aqa|imagen|veo|learnlm|robotics|live|native-audio|babbage|davinci|codex|-pro-preview|deep-research|prompt-guard|playai|orpheus|compound|allam|safeguard/i;
export function chatModels(provider, raw) {
  // OpenRouter: only the free models (":free") that can use tools
  if (provider === "openrouter") raw = (raw || []).filter((m) => /:free$/.test(m.id || "") && (!Array.isArray(m.supported_parameters) || m.supported_parameters.includes("tools")));
  const ids = [...new Set((raw || []).map((m) => String(m.id || m.name || "").replace(/^models\//, "")).filter(Boolean))];
  let list = ids.filter((id) => !SKIP.test(id));
  if (provider === "gemini") list = list.filter((id) => /^gemini-/.test(id));
  if (provider === "openai") list = list.filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/-\d{4}-\d{2}-\d{2}$/.test(id) && !/instruct/.test(id));
  if (provider === "nvidia") list = list.filter((id) => !/rerank|retriever|nemoretriever|reward|parse|vl\b|-vl-|vila|neva|vision|cosmos|clip|fuyu|kosmos|paligemma|deplot|riva|ocr|detect|safety|nemoguard|content-safety|bge|nv-embed|arctic-embed|starcoder|codegemma|usdcode|granite-guardian|steerlm|chatqa|base$/i.test(id));
  if (provider === "anthropic") list = list.filter((id) => /^claude-/.test(id));
  return list.sort((a, b) => score(provider, b) - score(provider, a) || a.localeCompare(b)).map((id) => ({ id, label: label(provider, id), recommended: false }))
    .map((m, i) => (i === 0 ? { ...m, recommended: true } : m));
}

// what suits a WhatsApp bot: quick, cheap, good at tools; newer versions first
function score(p, id) {
  const v = Number((id.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
  let s = Math.min(v, 99);
  if (p === "gemini") s += /flash/.test(id) ? 100 : 0, s -= /lite|exp|preview|thinking|8b/.test(id) ? 40 : 0, s -= /pro/.test(id) ? 20 : 0;
  if (p === "groq") s += /70b|versatile/.test(id) ? 100 : /gpt-oss-120b|qwen|kimi/.test(id) ? 90 : /8b|instant/.test(id) ? 40 : 60, s -= /preview/.test(id) ? 10 : 0;
  if (p === "nvidia") s += /llama-3\.3-70b|nemotron-super|kimi-k2|qwen3|deepseek-v3|gpt-oss-120b|llama-4-maverick/.test(id) ? 100 : /70b|49b|120b|235b|405b|mistral-large|maverick/.test(id) ? 80 : /8b|9b|mini|small|nano|1b|3b/.test(id) ? 30 : 60, s -= /preview|thinking|reason/.test(id) ? 15 : 0;
  if (p === "openrouter") s += /deepseek/.test(id) ? 100 : /llama-3\.3-70b|qwen3|kimi|gpt-oss/.test(id) ? 70 : 40, s -= /r1|reason|think|distill/.test(id) ? 30 : 0;
  if (p === "anthropic") s += /haiku/.test(id) ? 100 : /sonnet/.test(id) ? 80 : 50;
  if (p === "openai") s += /mini/.test(id) && !/nano/.test(id) ? 100 : /nano/.test(id) ? 70 : 60, s -= /^o\d|preview|chatgpt/.test(id) ? 40 : 0;
  return s;
}
function label(p, id) {
  const tags = [];
  if (p === "gemini" && /flash/.test(id) && !/lite/.test(id)) tags.push("fast");
  if (p === "gemini" && /pro/.test(id)) tags.push("may need billing");
  if ((p === "groq" || p === "nvidia") && /llama-3\.3-70b|versatile|120b|nemotron-super|kimi-k2/.test(id)) tags.push("good with tools");
  if (p === "openrouter" && /deepseek/.test(id) && !/r1|distill/.test(id)) tags.push("DeepSeek");
  if (p === "openrouter" && /r1|distill/.test(id)) tags.push("slow, thinks first");
  if (p === "anthropic" && /haiku/.test(id)) tags.push("fast, low cost");
  if (p === "openai" && /mini/.test(id)) tags.push("fast, low cost");
  return tags.length ? `${id} (${tags.join(", ")})` : id;
}

// Gemini accepts only part of JSON Schema in tool definitions: keep the safe parts
export function simpleSchema(s) {
  if (Array.isArray(s)) return s.map(simpleSchema);
  if (!s || typeof s !== "object") return s;
  const keep = ["type", "properties", "required", "items", "enum", "description", "anyOf", "nullable", "format"];
  const out = {};
  for (const k of keep) if (k in s) out[k] = k === "properties" ? Object.fromEntries(Object.entries(s.properties).map(([n, v]) => [n, simpleSchema(v)])) : simpleSchema(s[k]);
  if (out.format && !["date-time", "enum"].includes(out.format)) delete out.format;
  if (Array.isArray(out.type)) { out.nullable = out.type.includes("null"); out.type = out.type.find((t) => t !== "null"); }
  return out;
}
