// End to end: an AI assistant registers, the owner allows it, it swaps the code
// for tokens, then uses every tool through the official MCP client. Runs
// against the real schema and functions (see pg-supabase.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { pgSupabase } from "./pg-supabase.mjs";

const { registerClient, createCode, exchangeCode, refreshTokens, revokeToken, authenticate, getClient } = await import("../../lib/ai/oauth.js");
const { registerTools } = await import("../../lib/ai/tools.js");

const SITE = "https://usetally.cc";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const pool = new pg.Pool();
const service = pgSupabase(pool);
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function asUser(uid, sql, params = []) {
  const c = await pool.connect();
  try { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]); const r = await c.query(sql, params); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
const pkce = () => { const verifier = randomBytes(32).toString("base64url"); return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }; };

let owner, junior, biz, client;
async function connect(userId, scope = "read write") {
  const { verifier, challenge } = pkce();
  const { code } = await createCode(service, { client, userId, businessId: biz, scope, redirect: REDIRECT, challenge, resource: `${SITE}/mcp` });
  const tokens = await exchangeCode(service, { code, clientId: client.id, redirect: REDIRECT, verifier, resource: `${SITE}/mcp`, site: SITE });
  return tokens;
}
async function mcpFor(accessToken) {
  const who = await authenticate(service, `Bearer ${accessToken}`);
  assert.ok(who.connection, `authenticated (${who.error})`);
  const server = new McpServer({ name: "usetally", version: "1.0.0" });
  registerTools(server, { service, userId: who.userId, business: who.business, member: who.member, scope: who.connection.scope, site: SITE });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name: "test", version: "1" });
  await c.connect(b);
  const call = async (name, args = {}) => {
    const r = await c.callTool({ name, arguments: args });
    return { ...r, text: r.content.map((x) => x.text).join("\n"), data: r.structuredContent };
  };
  return { client: c, call, who };
}

test.before(async () => {
  const mk = async (n) => (await one("insert into auth.users(email) values ($1) returning id", [`${n}${Date.now()}@ai.test`])).id;
  owner = await mk("owner"); junior = await mk("junior");
  biz = (await asUser(owner, "select public.create_business('freelancer','Adeyemi Studio','Ada Adeyemi','NGN') id")).rows[0].id;
  await pool.query("update public.businesses set onboarded_at=now(), tax_rate=7.5, tax_label='VAT', invoice_due_days=7, default_terms='Pay within 7 days' where id=$1", [biz]);
  await pool.query("insert into public.memberships(business_id, user_id, role, email, full_name, can_view_costs) values ($1,$2,'junior_finance','june@ai.test','June',false)", [biz, junior]);
  await pool.query("insert into public.products(business_id, name, unit_price_minor) values ($1,'Product photography',12000000)", [biz]);
  await pool.query("insert into public.customers(business_id, name, company, email) values ($1,'Chioma Obi','Obi Foods Ltd','chioma@obifoods.test')", [biz]);
});
test.after(() => pool.end());

test("ChatGPT registers itself (DCR); bad redirects are refused", async () => {
  const r = await registerClient(service, { client_name: "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
  assert.match(r.client_id, /^utc_/);
  client = await getClient(service, r.client_id);
  assert.deepEqual(client.redirect_uris, [REDIRECT]);
  assert.equal((await registerClient(service, { redirect_uris: ["http://evil.example/cb"] })).error, "invalid_redirect_uri");
  assert.equal((await registerClient(service, { redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" })).error, "invalid_client_metadata");
});

test("the sign-in code works once, only with the right PKCE verifier", async () => {
  const { verifier, challenge } = pkce();
  const { code } = await createCode(service, { client, userId: owner, businessId: biz, scope: "read write", redirect: REDIRECT, challenge, resource: "" });
  assert.equal((await exchangeCode(service, { code, clientId: client.id, redirect: REDIRECT, verifier: pkce().verifier, site: SITE })).error, "invalid_grant");
  // a failed attempt burns the code, so even the right verifier is now refused
  assert.equal((await exchangeCode(service, { code, clientId: client.id, redirect: REDIRECT, verifier, site: SITE })).error, "invalid_grant");
  const t = await connect(owner);
  assert.match(t.access_token, /^ut_at_/); assert.match(t.refresh_token, /^ut_rt_/);
  assert.equal(t.token_type, "Bearer"); assert.equal(t.scope, "usetally.read usetally.write");
  // tokens are stored only as hashes
  assert.equal((await one("select count(*)::int n from public.oauth_tokens where token_hash=$1", [t.access_token])).n, 0);
});

test("full access: create, edit, send, get paid, quote to invoice, void", async () => {
  const { client: c, call } = await mcpFor((await connect(owner)).access_token);
  const names = (await c.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["convert_quote_to_invoice", "create_invoice", "create_quote", "find_customers", "find_products", "get_business_overview", "get_document", "list_documents", "record_payment", "send_document", "update_draft", "void_document"]);
  const tools = Object.fromEntries((await c.listTools()).tools.map((t) => [t.name, t]));
  assert.equal(tools.list_documents.annotations.readOnlyHint, true);
  assert.equal(tools.void_document.annotations.destructiveHint, true);
  assert.equal(tools.send_document.annotations.openWorldHint, true);

  // "Invoice Obi Foods for two logo designs at 150k each and the photography"
  const products = await call("find_products", { query: "photo" });
  const photo = products.data.products[0];
  const inv = await call("create_invoice", { customer: { name: "obi foods ltd" }, items: [{ description: "Logo design", quantity: 2, unit_price: 150000 }, { product_id: photo.id, description: "Product photography" }] });
  assert.ok(!inv.isError, inv.text);
  assert.equal(inv.data.status, "draft");
  assert.equal(inv.data.customer.name, "Chioma Obi"); // the saved customer, not a duplicate
  assert.equal(inv.data.subtotal, "₦420,000");
  assert.match(inv.data.tax, /VAT 7.5%/); // the business's usual tax
  assert.equal(inv.data.total, "₦451,500");
  assert.ok(inv.data.links.open_in_usetally.startsWith(`${SITE}/app/documents/`));
  assert.equal(inv.data.links.customer_link, undefined); // drafts have no customer link yet
  assert.equal((await one("select count(*)::int n from public.customers where business_id=$1", [biz])).n, 1);
  const number = inv.data.number;
  const row = await one("select created_by, due_date::text, terms from public.documents where number=$1 and business_id=$2", [number, biz]);
  assert.equal(row.created_by, owner); assert.equal(row.terms, "Pay within 7 days");

  const edited = await call("update_draft", { document: number.toLowerCase(), notes: "Thanks for the work!", discount: 20000 });
  assert.ok(!edited.isError, edited.text);
  assert.equal(edited.data.discount, "₦20,000"); assert.equal(edited.data.notes, "Thanks for the work!");
  assert.equal(edited.data.items.length, 2);

  const sent = await call("send_document", { document: number, email_customer: false });
  assert.ok(!sent.isError, sent.text);
  assert.match(sent.data.links.customer_link, /^https:\/\/usetally\.cc\/d\/[0-9a-f]{48}$/);
  assert.equal((await call("update_draft", { document: number, notes: "x" })).isError, true);

  assert.equal((await call("record_payment", { document: number, amount: "10,000,000" })).isError, true); // more than owed
  const paid = await call("record_payment", { document: number, amount: 200000, reference: "TRF-001" });
  assert.ok(!paid.isError, paid.text);
  assert.equal(paid.data.status, "partially_paid"); assert.equal(paid.data.paid, "₦200,000");

  const unpaid = await call("list_documents", { status: "unpaid" });
  assert.match(unpaid.text, new RegExp(`${number}.*part paid.*still owed`));
  const doc = await call("get_document", { document: number });
  assert.equal(doc.data.payments[0].reference, "TRF-001");
  const overview = await call("get_business_overview");
  assert.equal(overview.data.unpaid_invoices, 1); assert.equal(overview.data.received_this_month, "₦200,000");
  assert.equal(overview.data.your_role, "owner"); assert.equal(overview.data.assistant_access, "full");

  const quote = await call("create_quote", { customer: { name: "Tunde Bakare", email: "tunde@example.test" }, items: [{ description: "Brand strategy", unit_price: 300000 }], valid_until: "2026-12-31" });
  assert.ok(!quote.isError, quote.text);
  assert.equal(quote.data.valid_until, "2026-12-31");
  assert.equal((await one("select count(*)::int n from public.customers where business_id=$1", [biz])).n, 2); // a new customer was saved
  await call("send_document", { document: quote.data.number, email_customer: false });
  const converted = await call("convert_quote_to_invoice", { document: quote.data.number });
  assert.ok(!converted.isError, converted.text);
  assert.equal(converted.data.kind, "invoice"); assert.equal(converted.data.status, "sent");
  assert.ok(converted.data.links.customer_link);
  assert.equal((await call("convert_quote_to_invoice", { document: quote.data.number })).isError, true);

  const voided = await call("void_document", { document: converted.data.number });
  assert.match(voided.text, /void/);
  assert.equal((await call("get_document", { document: "INV-9999" })).isError, true);
  assert.equal((await call("create_invoice", { customer: { name: "X" }, items: [{ description: "Y", unit_price: "lots" }] })).isError, true);
});

test("view only: the assistant can look but has no tools to change anything", async () => {
  const { client: c, call } = await mcpFor((await connect(owner, "read")).access_token);
  const names = (await c.listTools()).tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["find_customers", "find_products", "get_business_overview", "get_document", "list_documents"]);
  assert.equal((await call("get_business_overview")).data.assistant_access, "view only");
});

test("a junior's assistant follows the junior's rules: sending goes for approval", async () => {
  await pool.query("update public.businesses set require_approval=true where id=$1", [biz]);
  const { call } = await mcpFor((await connect(junior)).access_token);
  const inv = await call("create_invoice", { customer: { name: "Chioma Obi" }, items: [{ description: "Retainer", unit_price: 50000 }] });
  assert.ok(!inv.isError, inv.text);
  const sent = await call("send_document", { document: inv.data.number });
  assert.match(sent.text, /needs approval/);
  assert.equal((await one("select status from public.documents where id=$1", [inv.data.id])).status, "pending_approval");
  assert.equal((await call("get_document", { document: inv.data.number })).data.hidden_costs, undefined);
  await pool.query("update public.businesses set require_approval=false where id=$1", [biz]);
});

test("another business's documents can't be reached", async () => {
  const other = (await one("insert into auth.users(email) values ($1) returning id", [`other${Date.now()}@ai.test`])).id;
  const otherBiz = (await asUser(other, "select public.create_business('freelancer','Other Co','Oz','NGN') id")).rows[0].id;
  const otherDoc = await one("select public.save_document($1, null, $2::jsonb) id", [otherBiz, JSON.stringify({ kind: "invoice", customer: { name: "Z" }, items: [{ description: "Secret", quantity: 1, unit_price_minor: 100 }] })]).catch(() => null);
  const { call } = await mcpFor((await connect(owner)).access_token);
  const id = otherDoc?.id || (await one("select id from public.documents where business_id<>$1 limit 1", [biz]))?.id;
  if (id) assert.equal((await call("get_document", { document: id })).isError, true);
  assert.doesNotMatch((await call("list_documents", { limit: 50 })).text, /Secret|Other Co/);
});

test("refresh tokens rotate; reusing an old one ends the connection", async () => {
  const t1 = await connect(owner);
  const t2 = await refreshTokens(service, { refreshToken: t1.refresh_token, clientId: client.id });
  assert.match(t2.access_token, /^ut_at_/);
  assert.ok((await authenticate(service, `Bearer ${t2.access_token}`)).connection);
  // the old refresh token again: treated as stolen, the whole connection ends
  assert.equal((await refreshTokens(service, { refreshToken: t1.refresh_token, clientId: client.id })).error, "invalid_grant");
  assert.equal((await authenticate(service, `Bearer ${t2.access_token}`)).error, "invalid_token");
  assert.equal((await refreshTokens(service, { refreshToken: t2.refresh_token, clientId: client.id })).error, "invalid_grant");
});

test("disconnecting, revoking or leaving the business cuts access", async () => {
  const t = await connect(owner);
  await revokeToken(service, t.refresh_token);
  assert.equal((await authenticate(service, `Bearer ${t.access_token}`)).error, "invalid_token");
  const j = await connect(junior);
  await pool.query("delete from public.memberships where business_id=$1 and user_id=$2", [biz, junior]);
  assert.equal((await authenticate(service, `Bearer ${j.access_token}`)).error, "invalid_token");
  assert.equal((await authenticate(service, "Bearer ut_at_nonsense")).error, "invalid_token");
  assert.equal((await authenticate(service, "")).error, null);
});
