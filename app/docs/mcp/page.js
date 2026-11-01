import Link from "next/link";
import { Logo } from "@/components/ui";
import { toolCatalog } from "@/lib/ai/catalog";
import { siteUrl } from "@/lib/site";

export const metadata = {
  title: "Usetally MCP server: connect ChatGPT, Claude and Grok",
  description: "Usetally's remote MCP server: Streamable HTTP, OAuth 2.1 sign-in per customer, and tools to create, send and track quotes, invoices and payments.",
  alternates: { canonical: "/docs/mcp" },
};
export const dynamic = "force-static";

const H2 = "mt-12 text-[22px] font-semibold tracking-[-0.01em] text-ink";
const P = "mt-3 text-[15px] leading-relaxed text-ink-2";
const Code = ({ children }) => <code className="rounded bg-tray px-1.5 py-0.5 font-mono text-[13px] text-ink ring-1 ring-line">{children}</code>;

// Public developer documentation for the MCP server (app/mcp/route.js).
export default function McpDocs() {
  const site = siteUrl();
  const tools = toolCatalog();
  const facts = [
    ["Server URL", `${site}/mcp`],
    ["Transport", "Streamable HTTP (stateless, JSON responses). POST only; no SSE stream or session ID."],
    ["Protocol", "Model Context Protocol, revisions 2025-06-18 and 2025-11-25"],
    ["Authentication", "OAuth 2.1, authorization code with PKCE (S256). Each customer signs in with their own Usetally account."],
    ["Client registration", "Dynamic Client Registration (RFC 7591) or Client ID Metadata Documents (CIMD). Public clients, token_endpoint_auth_method \"none\"."],
    ["Scopes", "usetally.read (view only) · usetally.write (create, send, record payments). offline_access for refresh tokens."],
    ["Tokens", "Access tokens last 1 hour. Refresh tokens last 90 days, are single use and rotate; reusing one ends the connection."],
  ];
  const endpoints = [
    ["Protected resource metadata (RFC 9728)", `${site}/.well-known/oauth-protected-resource/mcp`],
    ["Authorization server metadata (RFC 8414)", `${site}/.well-known/oauth-authorization-server`],
    ["Authorize", `${site}/oauth/authorize`],
    ["Token", `${site}/oauth/token`],
    ["Register (DCR)", `${site}/oauth/register`],
    ["Revoke (RFC 7009)", `${site}/oauth/revoke`],
  ];
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Usetally home"><Logo withWord className="size-7" /></Link>
          <Link href="/signup" className="text-sm font-medium text-brand-ink hover:underline">Start free</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-4 pt-10 pb-24 sm:px-6">
        <p className="text-[13px] font-semibold tracking-[0.12em] text-brand-ink uppercase">Developers</p>
        <h1 className="mt-2 text-[clamp(30px,4vw,40px)] font-semibold tracking-[-0.02em] text-ink">Usetally MCP server</h1>
        <p className={P}>Usetally makes branded quotes, invoices and receipts for small businesses. Its remote MCP server lets AI assistants (ChatGPT, Claude, Grok and any MCP client) work in a customer's Usetally: create and send quotes and invoices, record payments, and answer questions about money owed. Every customer connects their own account.</p>

        <h2 className={H2}>Connection</h2>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
          {facts.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
              <dt className="text-[13px] font-medium text-ink-3">{k}</dt><dd className="text-[14px] text-ink break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className={H2}>How sign-in works</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
          <li>The client calls <Code>POST /mcp</Code> without a token and gets <Code>401</Code> with <Code>WWW-Authenticate: Bearer resource_metadata=…</Code>.</li>
          <li>It reads the metadata documents below, then registers (DCR) or presents its CIMD URL as the client ID.</li>
          <li>The customer signs in to Usetally, picks one of their businesses and chooses <strong className="font-medium text-ink">Full access</strong> or <strong className="font-medium text-ink">View only</strong>.</li>
          <li>The client swaps the code (with its PKCE verifier) for tokens and calls <Code>/mcp</Code> with <Code>Authorization: Bearer …</Code>.</li>
        </ol>
        <p className={P}>Redirect URIs must be https, or http on <Code>localhost</Code> / <Code>127.0.0.1</Code> (matched on any port). Customers can see and disconnect every connection in Usetally under Settings → AI &amp; MCP.</p>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
          {endpoints.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[280px_1fr] sm:gap-4">
              <dt className="text-[13px] font-medium text-ink-3">{k}</dt><dd className="font-mono text-[13px] text-ink break-all">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className={H2}>Tools</h2>
        <p className={P}>{tools.length} tools. View-only connections get only the read tools. Every change runs as the signed-in person, so their team role, approval rules and plan limits apply exactly as in the app. Amounts are normal amounts in the document's currency (150000 means ₦150,000).</p>
        <div className="mt-6 flex flex-col gap-4">
          {tools.map((t) => (
            <section key={t.name} id={t.name} className="rounded-xl p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-[15px] font-semibold text-ink">{t.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${t.access === "read" ? "text-success-ink ring-success/30" : t.access === "destructive" ? "text-danger-ink ring-danger/30" : "text-brand-ink ring-brand-line"}`}>
                  {t.access === "read" ? "Read only" : t.access === "destructive" ? "Destructive · asks first" : "Changes data · asks first"}
                </span>
                {t.openWorld && <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-3 ring-1 ring-line">Emails the customer</span>}
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.description}</p>
              {t.params.length > 0 && (
                <table className="mt-3 w-full text-left text-[13px]">
                  <thead><tr className="text-ink-3"><th className="py-1.5 pr-3 font-medium">Parameter</th><th className="py-1.5 pr-3 font-medium">Type</th><th className="py-1.5 font-medium">Notes</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {t.params.map((p) => (
                      <tr key={p.name} className="align-top">
                        <td className={`py-1.5 pr-3 font-mono ${p.nested ? "pl-4 text-ink-2" : "text-ink"}`}>{p.name}{p.required && <span className="text-danger-ink">*</span>}</td>
                        <td className="py-1.5 pr-3 text-ink-3">{p.values ? p.values.join(" | ") : p.type}</td>
                        <td className="py-1.5 text-ink-2">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>

        <h2 className={H2}>Try it</h2>
        <p className={P}>With the MCP Inspector: <Code>npx @modelcontextprotocol/inspector</Code>, choose Streamable HTTP, enter <Code>{site}/mcp</Code> and connect. It walks the same OAuth sign-in a customer sees.</p>
        <p className={P}>Questions: signed-in customers can write to us from <Link href="/app/feedback" className="text-brand-ink hover:underline">Ideas &amp; help</Link> in the app. See also the <Link href="/privacy" className="text-brand-ink hover:underline">privacy policy</Link> and <Link href="/terms" className="text-brand-ink hover:underline">terms</Link>.</p>
      </main>
    </div>
  );
}
