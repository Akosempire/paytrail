// Sendbyte: sends to POST /v1/emails with the key, sender and an idempotency
// key; explains its errors; checks a key without sending anything.
import test from "node:test";
import assert from "node:assert/strict";

process.env.SENDBYTE_API_KEY = "sk_live_sendbyte_test_key";
process.env.MAIL_FROM = "Usetally <hello@usetally.cc>";
delete process.env.SENDHIIV_API_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SMTP_HOST;
const { sendEmail, checkSendbyte, emailStatus } = await import("../lib/email.js");

test("sends through Sendbyte with the right request", async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ id: "em_1", status: "queued" }), { status: 201 }); };
  const r = await sendEmail({ to: "ada@example.test", subject: "123 456 is your code", html: "<p>x</p>", text: "x" });
  assert.equal(r.sent, true);
  assert.equal(seen[0].url, "https://api.sendbyte.africa/v1/emails");
  assert.equal(seen[0].init.headers.authorization, "Bearer sk_live_sendbyte_test_key");
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.from, "Usetally <hello@usetally.cc>");
  assert.equal(body.to, "ada@example.test");
  assert.equal(body.subject, "123 456 is your code");
  assert.ok(body.idempotency_key);
});

test("an unverified domain is explained in plain words", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "domain_not_verified", message: "The sending domain has not been verified." } }), { status: 403 });
  const r = await sendEmail({ to: "ada@example.test", subject: "x", html: "x" });
  assert.equal(r.sent, false);
  assert.match(r.detail, /verify the domain/);
});

test("checking a key sends nothing and tells live from sandbox", async () => {
  globalThis.fetch = async (url, init) => { assert.equal(init.body, "{}"); return new Response(JSON.stringify({ error: { code: "validation_error" } }), { status: 422 }); };
  const live = await checkSendbyte("sk_live_abcdefghijk", "hello@usetally.cc");
  assert.equal(live.ok, true); assert.equal(live.senderNote, null);
  const sandbox = await checkSendbyte("sk_test_abcdefghijk", "hello@usetally.cc");
  assert.equal(sandbox.ok, true); assert.match(sandbox.senderNote, /sandbox/);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "authentication_error" } }), { status: 401 });
  assert.equal((await checkSendbyte("sk_live_abcdefghijk", "hello@usetally.cc")).ok, false);
  assert.equal((await checkSendbyte("nope", "hello@usetally.cc")).ok, false);
});

test("the admin card shows Sendbyte from Vercel", async () => {
  const s = await emailStatus();
  assert.equal(s.provider, "sendbyte");
  assert.equal(s.source, "vercel-sendbyte");
});
