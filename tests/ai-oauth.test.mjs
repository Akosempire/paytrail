import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appFor, authServerMetadata, challenge, checkAuthorizeRequest, checkCimd, checkRegistration, pkceOk, protectedResourceMetadata,
  redirectMatches, redirectUriOk, redirectWith, scopeFrom, scopeOut,
} from "../lib/ai/oauth-core.js";
import { buildPayload, docLine, pickCustomer, statusFilter, toMinorAmount } from "../lib/ai/tools-core.js";

const SITE = "https://usetally.cc";

test("discovery documents match what Claude, ChatGPT and Grok look for", () => {
  const pr = protectedResourceMetadata(SITE);
  assert.equal(pr.resource, "https://usetally.cc/mcp");
  assert.deepEqual(pr.authorization_servers, [SITE]);
  const as = authServerMetadata(SITE);
  assert.equal(as.issuer, SITE);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.ok(as.token_endpoint_auth_methods_supported.includes("none"));
  assert.equal(as.client_id_metadata_document_supported, true); // with "none": Claude uses CIMD
  assert.ok(as.registration_endpoint.endsWith("/oauth/register"));
  assert.ok(as.scopes_supported.includes("offline_access")); // so refresh tokens are asked for
  assert.match(challenge(SITE, "invalid_token"), /^Bearer resource_metadata="https:\/\/usetally\.cc\/\.well-known\/oauth-protected-resource\/mcp", error="invalid_token"/);
});

test("redirect addresses: https anywhere, http only on this computer, loopback on any port", () => {
  assert.ok(redirectUriOk("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectUriOk("http://localhost:3118/callback"));
  assert.ok(redirectUriOk("http://127.0.0.1/callback"));
  assert.ok(!redirectUriOk("http://evil.example/cb"));
  assert.ok(!redirectUriOk("javascript:alert(1)"));
  assert.ok(!redirectUriOk("https://a.example/cb#frag"));
  assert.ok(redirectMatches(["http://localhost/callback"], "http://localhost:51234/callback"));
  assert.ok(redirectMatches(["http://127.0.0.1/callback"], "http://127.0.0.1:9/callback"));
  assert.ok(!redirectMatches(["http://localhost/callback"], "http://localhost:5/other"));
  assert.ok(!redirectMatches(["https://claude.ai/api/mcp/auth_callback"], "https://claude.ai.evil.example/api/mcp/auth_callback"));
  assert.ok(redirectMatches(["https://claude.ai/api/mcp/auth_callback"], "https://claude.ai/api/mcp/auth_callback"));
});

test("who's asking comes from the return address, not the name the app typed", () => {
  assert.deepEqual(appFor("https://chatgpt.com/connector_platform_oauth_redirect", "x"), { name: "ChatGPT", host: "chatgpt.com", known: true, local: false });
  assert.equal(appFor("https://claude.ai/api/mcp/auth_callback").name, "Claude");
  assert.equal(appFor("https://grok.com/connectors/callback").name, "Grok");
  const fake = appFor("https://evil.example/cb", "ChatGPT");
  assert.equal(fake.known, false); assert.equal(fake.host, "evil.example");
  assert.equal(appFor("http://localhost:3118/callback", "Claude Code").local, true);
});

test("PKCE S256 and scopes", () => {
  const verifier = "a".repeat(50);
  const ch = createHash("sha256").update(verifier).digest("base64url");
  assert.ok(pkceOk(verifier, ch));
  assert.ok(!pkceOk("b".repeat(50), ch));
  assert.ok(!pkceOk("short", ch));
  assert.equal(scopeFrom("usetally.read"), "read");
  assert.equal(scopeFrom("usetally.read usetally.write offline_access"), "read write");
  assert.equal(scopeFrom(""), "read write");
  assert.equal(scopeOut("read"), "usetally.read");
});

test("registration and CIMD documents are checked", () => {
  assert.equal(checkRegistration({ redirect_uris: [] }).error, "invalid_redirect_uri");
  assert.deepEqual(checkRegistration({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }).redirect_uris, ["https://claude.ai/api/mcp/auth_callback"]);
  assert.equal(checkRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] }).error, "invalid_client_metadata");
  const id = "https://claude.ai/oauth/claude-code-client-metadata";
  assert.ok(checkCimd(id, { client_id: id, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"] }).redirect_uris);
  assert.ok(checkCimd(id, { client_id: "https://other.example/x", redirect_uris: ["https://a.example/cb"] }).error);
});

test("the authorize request: unsafe redirects stop on Usetally, other errors go back to the app", () => {
  const client = { id: "utc_1", name: "ChatGPT", redirect_uris: ["https://chatgpt.com/cb"] };
  const base = { client_id: "utc_1", redirect_uri: "https://chatgpt.com/cb", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", state: "s1", scope: "usetally.read", resource: "https://usetally.cc/mcp" };
  const ok = checkAuthorizeRequest(base, client, SITE);
  assert.equal(ok.ok, true); assert.equal(ok.scope, "read"); assert.equal(ok.state, "s1");
  assert.ok(checkAuthorizeRequest({ ...base, redirect_uri: "https://evil.example/cb" }, client, SITE).fatal);
  assert.ok(checkAuthorizeRequest(base, null, SITE).fatal);
  assert.equal(checkAuthorizeRequest({ ...base, code_challenge_method: "plain" }, client, SITE).error, "invalid_request");
  assert.equal(checkAuthorizeRequest({ ...base, resource: "https://other.example/mcp" }, client, SITE).error, "invalid_target");
  assert.equal(redirectWith("https://chatgpt.com/cb?x=1", { code: "c", state: "s", iss: SITE, empty: "" }), "https://chatgpt.com/cb?x=1&code=c&state=s&iss=https%3A%2F%2Fusetally.cc");
});

test("tool inputs: amounts, statuses, customers and the business's defaults", () => {
  assert.equal(toMinorAmount(150000), 15000000);
  assert.equal(toMinorAmount("₦1,500.50"), 150050);
  assert.ok(Number.isNaN(toMinorAmount("lots")));
  assert.deepEqual(statusFilter("overdue", "2026-11-01"), { in: ["sent", "viewed", "partially_paid"], dueBefore: "2026-11-01" });
  const custs = [{ id: "1", name: "Chioma Obi", company: "Obi Foods Ltd", email: "c@obi.test" }, { id: "2", name: "Ada", company: "", email: "" }];
  assert.equal(pickCustomer(custs, { name: "obi foods ltd" }).id, "1");
  assert.equal(pickCustomer(custs, { name: "Someone", email: "C@obi.test" }).id, "1");
  assert.equal(pickCustomer(custs, { name: "Obi" }), null);
  const business = { tax_rate: 7.5, tax_label: "VAT", default_terms: "7 days", invoice_due_days: 7, quote_validity_days: 14 };
  const { payload, errors } = buildPayload("invoice", { items: [{ description: "Logo", quantity: 2, unit_price: 150000 }] }, business, { todayStr: "2026-11-01" });
  assert.deepEqual(errors, []);
  assert.equal(payload.due_date, "2026-11-08"); assert.equal(payload.tax_rate, 7.5); assert.equal(payload.terms, "7 days");
  assert.equal(payload.items[0].unit_price_minor, 15000000);
  assert.equal(buildPayload("quote", { items: [] }, business).errors[0], "Add at least one item.");
  assert.match(buildPayload("invoice", { items: [{ description: "x", unit_price: 1 }], due_date: "next week" }, business).errors[0], /due_date must be a date/);
  assert.match(docLine({ kind: "invoice", number: "INV-1", customer_name: "Ada", currency: "NGN", total_minor: 100000, amount_paid_minor: 0, status: "sent", due_date: "2026-10-01" }, "2026-11-01"), /overdue \(was due 2026-10-01\).*₦1,000 still owed/);
});
