"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Eye, EyeOff, FileText, KeyRound, Link2, MessageCircle, Phone, Save, Send, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { CopyButton, Segmented, Switch, useToast } from "@/components/ui-client";
import { useStepUp } from "@/components/step-up";
import { checkWhatsappTemplates, saveWhatsappAi, saveWhatsappTwilio, sendWhatsappTest, setWhatsappEnabled } from "../../actions";

const STATUS = { approved: ["Approved", "success"], pending: ["Waiting for WhatsApp", "warn"], received: ["Waiting for WhatsApp", "warn"], rejected: ["Rejected", "danger"], unsubmitted: ["Not submitted", "warn"], "not set": ["Not set", "neutral"], unknown: ["Couldn't check", "neutral"] };

function Secret({ id, label, hint, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <Input id={id} icon={KeyRound} type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={onChange} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-ink-3 hover:text-ink">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

const Steps = ({ children }) => <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">{children}</ol>;

export function WhatsappSettings({ saved, connected, webhook, host, defaults, stats }) {
  const router = useRouter();
  const toast = useToast();
  const { guarded, dialog } = useStepUp("platform");
  const [tw, setTw] = useState({ accountSid: saved.accountSid || "", authToken: "", from: saved.from || "", tplInvoice: saved.templates?.invoice || "", tplQuote: saved.templates?.quote || "", tplReceipt: saved.templates?.receipt || "" });
  const [ai, setAi] = useState({ provider: saved.aiProvider || "off", key: "", model: saved.aiModel || "" });
  const [enabled, setEnabled] = useState(Boolean(saved.enabled));
  const [testTo, setTestTo] = useState("");
  const [tplStatus, setTplStatus] = useState(null);
  const [busy, start] = useTransition();
  const [which, setWhich] = useState("");
  const setT = (k) => (e) => setTw({ ...tw, [k]: e.target.value });

  const run = (name, fn, after) => { setWhich(name); start(async () => {
    const r = await fn();
    if (r?.error) toast.error({ title: "Not done", message: r.error }, { duration: 15000 });
    else if (r?.message) toast.success({ title: "Done", message: r.message });
    if (!r?.error) after?.(r);
    router.refresh();
  }); };

  const saveTwilio = () => run("twilio", () => guarded(() => saveWhatsappTwilio(tw)), () => setTw((f) => ({ ...f, authToken: "" })));
  const saveAi = () => run("ai", () => guarded(() => saveWhatsappAi(ai)), () => setAi((f) => ({ ...f, key: "" })));
  const toggle = (on) => { setEnabled(on); run("toggle", () => setWhatsappEnabled(on), null); };
  const checkTpl = () => run("tpl", async () => { const r = await checkWhatsappTemplates(); if (r.templates) setTplStatus(r.templates); return r.error ? r : {}; });

  const templates = [
    { key: "tplInvoice", name: "Invoice", sid: "invoice", text: `Hello {{1}}, {{2}} has sent you {{3}} for {{4}}. View and pay it here: https://${host}/d/{{5}} Thank you for your business.` },
    { key: "tplQuote", name: "Quote", sid: "quote", text: `Hello {{1}}, {{2}} has sent you {{3}} for {{4}}. View and accept it here: https://${host}/d/{{5}} Thank you.` },
    { key: "tplReceipt", name: "Receipt", sid: "receipt", text: `Hello {{1}}, thank you for your payment. {{2}} has issued {{3}} for {{4}}. View it here: https://${host}/r/{{5}} Keep it for your records.` },
  ];
  const n = (v) => (v == null ? "–" : Number(v).toLocaleString("en-NG"));

  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Card>
        <CardHeader icon={MessageCircle} iconTone={enabled && connected ? "success" : "neutral"} title="WhatsApp bot"
          description={connected ? "Paid businesses link their number in Settings → WhatsApp, then chat with it." : "Connect Twilio below, then switch it on."}
          actions={<Badge tone={enabled && connected ? "success" : connected ? "warn" : "neutral"} size="sm">{enabled && connected ? "On" : connected ? "Off" : "Not set up"}</Badge>} />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Switch checked={enabled} onChange={toggle} disabled={!connected || busy} label="Answer messages" description="Off: messages to the bot get no answer and businesses can't link a number." />
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-tray p-1.5 text-center">
            {[["Linked numbers", stats.linked], ["Messages in (7 days)", stats.inbound], ["Sent to customers (7 days)", stats.customer]].map(([l, v]) => (
              <div key={l} className="flex flex-col-reverse gap-0.5 rounded-lg bg-surface p-3 ring-1 ring-line"><dt className="text-xs text-ink-3">{l}</dt><dd className="text-[20px] font-semibold text-ink tabular">{n(v)}</dd></div>
            ))}
          </dl>
          <p className="flex items-start gap-2 text-[13px] text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />Nothing goes to a customer and no payment is recorded until the business owner replies YES. Every change runs as that person, with their role and plan limits.</p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Phone} title="1. Twilio" description="Twilio carries the WhatsApp messages." actions={connected ? <Badge tone="success" size="sm">Connected{saved.accountName ? ` · ${saved.accountName}` : ""}</Badge> : null} />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Steps>
            <li>Sign up at <strong>twilio.com</strong>. On the Console home page, copy the <strong>Account SID</strong> and <strong>Auth Token</strong>.</li>
            <li>To test today, open <strong>Messaging → Try it out → Send a WhatsApp message</strong> and use the Sandbox number (+1 415 523 8886). Each tester first sends the join code shown there.</li>
            <li>To go live, register your own number under <strong>Messaging → Senders → WhatsApp senders</strong> (Twilio walks you through Meta's business check), then put that number here.</li>
          </Steps>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account SID" htmlFor="wa-sid"><Input id="wa-sid" autoComplete="off" spellCheck={false} placeholder="AC…" value={tw.accountSid} onChange={setT("accountSid")} /></Field>
            <Secret id="wa-token" label="Auth Token" value={tw.authToken} onChange={setT("authToken")} placeholder={saved.hasToken ? "•••••••• (saved)" : "32 letters and numbers"}
              hint={saved.hasToken ? `Saved token ends ${saved.tokenHint}. Leave empty to keep it.` : "Stored encrypted. Only the last 4 characters are shown again."} />
          </div>
          <Field label="Bot's WhatsApp number" htmlFor="wa-from" hint="With the country code. The Sandbox is +14155238886."><Input id="wa-from" icon={Phone} inputMode="tel" placeholder="+14155238886" value={tw.from} onChange={setT("from")} /></Field>
          <div><Button variant="primary" icon={Save} loading={busy && which === "twilio"} disabled={busy} onClick={saveTwilio}>{connected ? "Save and check" : "Connect Twilio"}</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Link2} title="2. Webhook" description="Where Twilio sends the messages people write to the bot." />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-tray px-3.5 py-2.5 font-mono text-[13px] text-ink ring-1 ring-line">{webhook}</code>
            <CopyButton value={webhook} label="Copy address" />
          </div>
          <Steps>
            <li>Sandbox: <strong>Messaging → Try it out → Send a WhatsApp message → Sandbox settings</strong>. Paste it in <strong>When a message comes in</strong>, method <strong>POST</strong>, and save.</li>
            <li>Your own number: <strong>Messaging → Senders → WhatsApp senders</strong> → your number → <strong>Webhook URL for incoming messages</strong>, method <strong>POST</strong>.</li>
            <li>Every message is checked with your Auth Token, so only Twilio can use this address.</li>
          </Steps>
        </div>
      </Card>

      <Card>
        <CardHeader icon={FileText} title="3. Templates for customers" description="WhatsApp only lets a business message a customer first with a template Meta has approved. Without them, the owner gets a tap-to-send link instead."
          actions={<Button size="sm" icon={CheckCircle2} loading={busy && which === "tpl"} disabled={busy || !connected} onClick={checkTpl}>Check approval</Button>} />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Steps>
            <li>In Twilio, open <strong>Messaging → Content Template Builder</strong> and create each template below: type <strong>Text</strong>, category <strong>Utility</strong>, language English.</li>
            <li>Paste the text exactly, with sample values for the variables, and submit it for WhatsApp approval (usually minutes to a day).</li>
            <li>Copy each template's <strong>Content SID</strong> (starts HX) into the boxes, then select <strong>Save templates</strong>.</li>
          </Steps>
          {templates.map((t) => {
            const st = tplStatus?.[t.sid];
            const [label, tone] = st ? (st.ok ? STATUS[st.status] || [st.status, "neutral"] : [st.error || "Not found", "danger"]) : [];
            return (
              <div key={t.key} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-ink">{t.name}</span>{st && <Badge size="sm" tone={tone}>{label}</Badge>}</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <p className="min-w-0 flex-1 rounded-lg bg-tray px-3 py-2 font-mono text-[12.5px] leading-relaxed break-words text-ink-2">{t.text}</p>
                  <CopyButton value={t.text} label="Copy text" />
                </div>
                <Input aria-label={`${t.name} template Content SID`} autoComplete="off" spellCheck={false} placeholder="HX…" value={tw[t.key]} onChange={setT(t.key)} />
              </div>
            );
          })}
          <p className="text-[13px] text-ink-3">The variables: {"{{1}}"} customer's name, {"{{2}}"} business name, {"{{3}}"} e.g. “invoice INV-0042”, {"{{4}}"} amount, {"{{5}}"} the document's private link code.</p>
          <div><Button variant="primary" icon={Save} loading={busy && which === "twilio"} disabled={busy || !connected} onClick={saveTwilio}>Save templates</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Bot} title="4. AI (chat in your own words)" description="With an AI key, people just say “Invoice Ada for 2 logo designs at 150k”. Without one, the bot uses numbered menus." actions={saved.aiProvider !== "off" && saved.hasAiKey ? <Badge tone="success" size="sm">Connected</Badge> : <Badge size="sm">Menus only</Badge>} />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Segmented ariaLabel="AI provider" value={ai.provider} onChange={(v) => setAi({ ...ai, provider: v })} options={[{ value: "off", label: "Off (menus)" }, { value: "anthropic", label: "Claude (Anthropic)" }, { value: "openai", label: "OpenAI" }]} />
          {ai.provider !== "off" && (
            <>
              <Steps>
                {ai.provider === "anthropic"
                  ? <li>At <strong>console.anthropic.com</strong> → <strong>API Keys</strong>, create a key (starts sk-ant-) and add credit under Billing.</li>
                  : <li>At <strong>platform.openai.com</strong> → <strong>API keys</strong>, create a key (starts sk-) and add credit under Billing.</li>}
                <li>The AI only reads and makes drafts. Sending, recording payments and cancelling always wait for the owner's YES.</li>
              </Steps>
              <div className="grid gap-4 sm:grid-cols-2">
                <Secret id="wa-ai-key" label="API key" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} placeholder={saved.hasAiKey && saved.aiProvider === ai.provider ? "•••••••• (saved)" : ai.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
                  hint={saved.hasAiKey && saved.aiProvider === ai.provider ? `Saved key ends ${saved.aiKeyHint}. Leave empty to keep it.` : "Stored encrypted."} />
                <Field label="Model" htmlFor="wa-ai-model" optional hint={`Leave empty for ${defaults[ai.provider]}.`}><Input id="wa-ai-model" autoComplete="off" spellCheck={false} placeholder={defaults[ai.provider]} value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} /></Field>
              </div>
            </>
          )}
          <div><Button variant="primary" icon={Save} loading={busy && which === "ai"} disabled={busy} onClick={saveAi}>{ai.provider === "off" ? "Use menus only" : "Save and check"}</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Send} title="Send a test" description="To a phone that messaged the bot in the last 24 hours (or joined the Sandbox)." />
        <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row">
          <Input aria-label="Phone number for the test" icon={Phone} inputMode="tel" placeholder="+234 801 234 5678" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="sm:w-72" />
          <Button icon={Send} loading={busy && which === "test"} disabled={busy || !connected || !testTo.trim()} onClick={() => run("test", () => sendWhatsappTest(testTo))}>Send test message</Button>
        </div>
      </Card>
    </div>
  );
}
