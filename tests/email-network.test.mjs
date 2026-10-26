// When Sendhiiv can't be reached, the error says why (not just "fetch failed"),
// and one retry happens before giving up.
import test from "node:test";
import assert from "node:assert/strict";

process.env.SENDHIIV_API_KEY = "sh_live_network_test";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SMTP_HOST;
const { sendEmail } = await import("../lib/email.js");

test("an unreachable Sendhiiv is retried once and explained", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND", hostname: "api.sendhiiv.com" } }); };
  const r = await sendEmail({ to: "a@b.test", subject: "x", html: "<p>x</p>" });
  assert.equal(r.sent, false);
  assert.equal(r.reason, "unreachable");
  assert.equal(calls, 2);
  assert.match(r.detail, /Couldn't reach Sendhiiv: its address \(api\.sendhiiv\.com\) couldn't be found/);
});

test("a dropped connection that works on retry still sends", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; if (calls === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); return new Response("{}", { status: 200 }); };
  const r = await sendEmail({ to: "a@b.test", subject: "x", html: "<p>x</p>" });
  assert.equal(r.sent, true);
  assert.equal(calls, 2);
});
