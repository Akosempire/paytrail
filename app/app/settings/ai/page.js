import { Bot, MessageSquareText, ShieldCheck } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatDate, timeAgo } from "@/lib/format";
import { ACCESS } from "@/lib/ai/oauth-core";
import { siteUrl } from "@/lib/site";
import { Badge, Card, CardHeader, Callout, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { DisconnectAssistant } from "./disconnect";
import { UpgradeNote } from "@/components/upgrade-note";
import { featuresOf, hasFeature } from "@/lib/entitlements";

export const metadata = { title: "AI & MCP" };
export const dynamic = "force-dynamic";

// Connect ChatGPT, Claude or Grok to Usetally (over MCP), then make quotes and
// invoices, chase payments and check numbers by chatting.
const APPS = [
  {
    name: "ChatGPT", where: "On chatgpt.com (Plus, Pro, Business, Enterprise or Edu)",
    steps: [
      <>Open <strong>Settings → Apps → Advanced settings</strong> and turn on <strong>Developer mode</strong>.</>,
      <>Select <strong>Create app</strong>. Name it <strong>Usetally</strong>, paste the address above as the MCP server URL, and choose <strong>OAuth</strong>.</>,
      <>Sign in to Usetally when asked, pick your business, and select <strong>Allow</strong>.</>,
      <>In a chat, open the <strong>+</strong> menu, choose <strong>Developer mode</strong> and switch on Usetally.</>,
    ],
  },
  {
    name: "Claude", where: "On claude.ai, the Claude desktop app, or Claude Code",
    steps: [
      <>Open <strong>Settings → Connectors</strong> and select <strong>Add custom connector</strong>. On a Team or Enterprise plan an owner adds it first.</>,
      <>Name it <strong>Usetally</strong>, paste the address above, and select <strong>Add</strong>.</>,
      <>Select <strong>Connect</strong>, sign in to Usetally, pick your business, and select <strong>Allow</strong>.</>,
    ],
  },
  {
    name: "Grok", where: "On grok.com",
    steps: [
      <>Go to <strong>grok.com/connectors</strong>, select <strong>New Connector</strong>, then <strong>Custom</strong>.</>,
      <>Paste the address above as the server URL.</>,
      <>Sign in to Usetally when asked, pick your business, and select <strong>Allow</strong>.</>,
    ],
  },
];

const ASK = [
  "Invoice Obi Foods for 2 logo designs at ₦150,000 each, due Friday.",
  "Which invoices are overdue, and how much am I owed?",
  "Turn quote QT-0007 into an invoice and email it to the customer.",
  "Record a ₦200,000 bank transfer on INV-0042.",
  "Make a quote for Tunde from my price list: product photography and 3 edited reels.",
];

export default async function Page() {
  const ctx = await requireBusiness();
  const site = siteUrl();
  const url = `${site}/mcp`;
  const manager = can(ctx.member, "settings.team");
  let q = createSupabaseService().from("ai_connections").select("id, user_id, app_name, app_host, scope, created_at, last_used_at").eq("business_id", ctx.business.id).is("revoked_at", null);
  if (!manager) q = q.eq("user_id", ctx.user.id);
  const full = hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "ai_full");
  const { data: connections, error } = await q.order("created_at", { ascending: false }).limit(50);
  const people = manager && connections?.length
    ? Object.fromEntries(((await createSupabaseService().from("memberships").select("user_id, full_name, email").eq("business_id", ctx.business.id)).data || []).map((m) => [m.user_id, m.full_name || m.email]))
    : {};
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI & MCP" description="Connect ChatGPT, Claude or Grok to make quotes and invoices, send them, record payments and check your numbers by chatting." />
      {!full && <UpgradeNote title="AI & MCP is on paid plans">Upgrade to connect ChatGPT, Claude or Grok and make quotes and invoices, send them and check your numbers by chatting. Assistants you already connected start working again the moment you upgrade.</UpgradeNote>}
      {error && /ai_connections/.test(error.message || "") && <Callout tone="warn" title="Database update needed">Run RUN_NEW_2026-11-01g.sql in Supabase to connect AI assistants.</Callout>}

      <Card>
        <CardHeader title="Your Usetally MCP address" icon={Bot} description="Every assistant uses this one address. You sign in to Usetally to connect it; no keys to copy." />
        <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-tray px-3.5 py-2.5 font-mono text-[13px] text-ink ring-1 ring-line">{url}</code>
          <CopyButton value={url} label="Copy address" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {APPS.map((a) => (
          <Card key={a.name} className="flex flex-col">
            <div className="flex flex-col gap-3 p-5">
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{a.name}</h2>
                <p className="text-xs text-ink-3">{a.where}</p>
              </div>
              <ol className="flex flex-col gap-2.5">
                {a.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2 [&_strong]:font-medium [&_strong]:text-ink">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title={manager ? "Connected in this business" : "Your connected assistants"} icon={ShieldCheck}
          description={manager ? "Every assistant your team has connected. Each one can only do what its person's role allows." : "Each one can only do what your role allows."} />
        {connections?.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{c.app_name || "AI assistant"}
                    <Badge tone={c.scope === "read" || !full ? "neutral" : "brand"}>{!full ? "Paused (Free plan)" : ACCESS[c.scope]?.label || c.scope}</Badge></p>
                  <p className="text-xs text-ink-3">
                    {manager ? `${c.user_id === ctx.user.id ? "You" : people[c.user_id] || "A team member"} · ` : ""}{c.app_host ? `${c.app_host} · ` : ""}connected {formatDate(c.created_at)} · {c.last_used_at ? `last used ${timeAgo(c.last_used_at)}` : "not used yet"}
                  </p>
                </div>
                {(c.user_id === ctx.user.id || manager) && <DisconnectAssistant id={c.id} app={c.app_name || "This assistant"} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-4 text-[13px] text-ink-3">Nothing connected yet. Follow the steps above in ChatGPT, Claude or Grok.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Things to ask" icon={MessageSquareText} description="Assistants make drafts and show you the total. Sending, recording a payment or voiding always asks you first." />
        <ul className="flex flex-col gap-2 px-5 pb-5">
          {ASK.map((s) => <li key={s} className="rounded-xl bg-tray px-3.5 py-2.5 text-[13px] text-ink-2">“{s}”</li>)}
        </ul>
      </Card>
    </div>
  );
}
