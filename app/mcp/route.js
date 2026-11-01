import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { authenticate } from "@/lib/ai/oauth";
import { challenge } from "@/lib/ai/oauth-core";
import { registerTools } from "@/lib/ai/tools";
import { aiSite, CORS, json, preflight } from "@/lib/ai/http";

// Usetally's MCP server: ChatGPT, Claude and Grok connect here (Streamable
// HTTP, stateless). Each request carries the access token from "Sign in with
// Usetally"; without one the answer is a 401 that points the app at sign-in.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTRUCTIONS = `Usetally makes branded quotes, invoices and receipts for small businesses, mostly in Nigeria.
- Amounts are normal amounts in the document's currency (150000 = ₦150,000).
- create_quote and create_invoice only make drafts. Show the person the customer, items and total, then ask before send_document.
- Ask before record_payment and void_document too.
- Use find_customers and find_products to reuse saved customers and prices.
- Share links from the results: open_in_usetally for the business, customer_link and pdf for their customer.`;

function unauthorized(error) {
  return new Response(JSON.stringify({ error: error || "unauthorized", error_description: "Sign in with Usetally to use this." }), {
    status: 401, headers: { "content-type": "application/json", "www-authenticate": challenge(aiSite(), error), ...CORS },
  });
}

async function handle(request) {
  if (!supabaseConfigured()) return json({ error: "Usetally isn't set up on this server." }, 503);
  const service = createSupabaseService();
  const who = await authenticate(service, request.headers.get("authorization"));
  if (!who.connection) return unauthorized(who.error);

  const server = new McpServer(
    { name: "usetally", title: "Usetally", version: "1.0.0", websiteUrl: aiSite(), icons: [{ src: `${aiSite()}/icons/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] }] },
    { instructions: `${INSTRUCTIONS}\nConnected business: ${who.business.name} (usual currency ${who.business.currency}).` },
  );
  registerTools(server, { service, userId: who.userId, business: who.business, member: who.member, scope: who.connection.scope, site: aiSite() });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    console.error("mcp.failed", { message: String(e?.message || e).slice(0, 200) });
    return json({ jsonrpc: "2.0", error: { code: -32603, message: "Usetally hit a problem. Try again." }, id: null }, 500);
  }
}

export const POST = handle;
// stateless: no standing event stream and no sessions to end
export const GET = async (request) => {
  const who = await authenticate(createSupabaseService(), request.headers.get("authorization")).catch(() => ({}));
  if (!who.connection) return unauthorized(who.error);
  return new Response(null, { status: 405, headers: { allow: "POST", ...CORS } });
};
export const DELETE = () => new Response(null, { status: 405, headers: { allow: "POST", ...CORS } });
export const OPTIONS = preflight;
