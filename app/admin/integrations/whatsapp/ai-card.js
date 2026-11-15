"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { useStepUp } from "@/components/step-up";
import { FREE_IDS, PROVIDERS, providerOfKey } from "@/lib/whatsapp/providers";
import { listWhatsappAiModels, saveWhatsappAi } from "../../actions";

const FREE_KEYS = "Gemini (AIza…), Groq (gsk_…), NVIDIA (nvapi-…) or OpenRouter for DeepSeek (sk-or-…)";

// Paste a key: the provider is recognised from it, the models that key can use
// are fetched from the provider, and the best one for the bot is pre-selected.
export function AiCard({ saved }) {
  const router = useRouter();
  const toast = useToast();
  const { guarded, dialog } = useStepUp("platform");
  const [provider, setProvider] = useState(saved.aiProvider || "off");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [model, setModel] = useState(saved.aiModel || "");
  const [models, setModels] = useState(null); // null: not loaded
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, start] = useTransition();
  const asked = useRef("");
  const hasSaved = saved.hasAiKey && saved.aiProvider === provider;
  const p = PROVIDERS[provider];
  // free providers only; a paid one shows only if it's what's saved now
  const order = [...FREE_IDS, ...(saved.aiProvider && !FREE_IDS.includes(saved.aiProvider) && PROVIDERS[saved.aiProvider] ? [saved.aiProvider] : [])];

  async function load(k, prov) {
    const tag = `${prov}:${k}`;
    asked.current = tag;
    setLoading(true); setListError("");
    const r = await listWhatsappAiModels({ provider: prov, key: k });
    if (asked.current !== tag) return; // a newer paste won
    setLoading(false);
    if (r.error) { setModels([]); setListError(r.error); return; }
    setModels(r.models);
    setModel((m) => (r.models.some((x) => x.id === m) ? m : r.models.find((x) => x.recommended)?.id || r.models[0]?.id || ""));
  }

  // the saved key: list its models when the page opens
  useEffect(() => { if (saved.hasAiKey && saved.aiProvider !== "off") load("", saved.aiProvider); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (v) => {
    setKey(v);
    const found = providerOfKey(v);
    if (found && !PROVIDERS[found].free) { setModels(null); setListError(`That's a ${PROVIDERS[found].name} key, which is paid. Use a free key: ${FREE_KEYS}.`); return; }
    if (found) {
      if (found !== provider) { setProvider(found); setModel(""); }
      load(v.trim(), found);
    } else { setModels(null); setListError(v.trim().length > 12 ? `That key isn't one we know. Use a free key: ${FREE_KEYS}.` : ""); }
  };
  const pick = (v) => {
    setProvider(v); setModels(null); setListError(""); setModel(v === saved.aiProvider ? saved.aiModel || "" : "");
    if (v !== "off" && saved.hasAiKey && saved.aiProvider === v && !key) load("", v);
    if (key && providerOfKey(key) !== v) setKey("");
  };
  const save = () => start(async () => {
    const r = await guarded(() => saveWhatsappAi({ provider, key, model }));
    if (r?.error) toast.error({ title: "Not saved", message: r.error }, { duration: 15000 });
    else if (r?.message) { toast.success({ title: "Saved", message: r.message }); setKey(""); }
    router.refresh();
  });

  return (
    <Card>
      {dialog}
      <CardHeader icon={Bot} title="4. AI (chat in your own words)" description="Free providers only. With an AI key, people just say “Invoice Ada for 2 logo designs at 150k”. Without one, the bot uses numbered menus."
        actions={saved.aiProvider !== "off" && saved.hasAiKey ? <Badge tone="success" size="sm">{PROVIDERS[saved.aiProvider]?.name || "Connected"}</Badge> : <Badge size="sm">Menus only</Badge>} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <Secret value={key} onChange={onKey} show={show} setShow={setShow} loading={loading}
          placeholder={hasSaved ? "•••••••• (saved) — paste a new key to replace it" : "Paste a free API key: AIza…, gsk_…, nvapi-… or sk-or-…"}
          hint={hasSaved ? `Saved ${p?.name} key ends ${saved.aiKeyHint}.` : "We recognise the provider from the key and load its models. Stored encrypted."} />

        <div role="radiogroup" aria-label="AI provider" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {["off", ...order].map((id) => {
            const on = provider === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} onClick={() => pick(id)}
                className={`flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left ring-1 transition ${on ? "bg-brand-soft ring-brand" : "bg-surface ring-line hover:bg-hover"}`}>
                <span className="text-[13px] font-semibold text-ink">{id === "off" ? "Off" : PROVIDERS[id].name}</span>
                <span className="text-xs text-ink-3">{id === "off" ? "Numbered menus, free" : PROVIDERS[id].free ? "Free tier" : "Paid (saved now)"}</span>
              </button>
            );
          })}
        </div>

        {p && (
          <>
            <p className="rounded-xl bg-tray px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              Get a key at <strong className="font-medium text-ink">{p.where}</strong>.
              {p.free && " Free tiers limit messages per minute and per day, and the provider may use what's sent to improve its models, so move to a paid plan once businesses rely on it."}
              {" "}The AI only reads and makes drafts; sending, payments and cancelling always wait for the owner's YES.
            </p>
            <Field label="Model" htmlFor="wa-ai-model" error={listError} hint={(models?.length ? `${models.length} models this key can use. The best fit for the bot is picked for you.` : loading ? "Loading the models this key can use…" : "Paste a key to see its models.")}>
              <div className="flex gap-2">
                {models?.length ? (
                  <Select id="wa-ai-model" className="min-w-0 flex-1" value={model} onChange={(e) => setModel(e.target.value)}>
                    {models.map((m) => <option key={m.id} value={m.id}>{m.recommended ? "★ " : ""}{m.label}</option>)}
                  </Select>
                ) : (
                  <Input id="wa-ai-model" className="min-w-0 flex-1" autoComplete="off" spellCheck={false} placeholder={p.fallback} value={model} onChange={(e) => setModel(e.target.value)} />
                )}
                <Button icon={loading ? Loader2 : RefreshCw} disabled={loading || (!key && !hasSaved)} onClick={() => load(key.trim(), provider)} aria-label="Reload models">Reload</Button>
              </div>
            </Field>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={provider === "off" ? Save : Sparkles} loading={saving} disabled={saving || loading || (provider !== "off" && !key && !hasSaved)} onClick={save}>{provider === "off" ? "Use menus only" : "Save and check"}</Button>
          {provider !== "off" && <span className="text-xs text-ink-3">Sends one tiny test message to {p?.name} first.</span>}
        </div>
      </div>
    </Card>
  );
}

function Secret({ value, onChange, show, setShow, placeholder, hint, loading }) {
  return (
    <Field label="API key" htmlFor="wa-ai-key" hint={hint}>
      <div className="relative">
        <Input id="wa-ai-key" icon={KeyRound} type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {loading && <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Loading models" />}
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"} className="rounded-md p-1.5 text-ink-3 hover:text-ink">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </span>
      </div>
    </Field>
  );
}
