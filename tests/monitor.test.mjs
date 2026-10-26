// Monitoring: alerts only when a check changes (and on recovery), real
// failures alert at once but not more than every 30 minutes, and alerts
// reach Telegram/Slack/Discord in the shape each expects.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
delete process.env.SENDBYTE_API_KEY; delete process.env.SENDHIIV_API_KEY; delete process.env.SMTP_HOST;
const { runChecks, reportFailure, postToWebhook } = await import("../lib/monitor.js");

let posts, authUp;
function setup() {
  posts = []; authUp = true;
  globalThis.__fakeDb = { tables: { monitor_state: [], monitor_events: [], platform_settings: [{ id: true }] }, rpc: async () => ({ data: null, error: null }) };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/auth/v1/settings")) return new Response(JSON.stringify({ external: { email: true } }), { status: authUp ? 200 : 503 });
    if (u.startsWith("https://hooks.slack.com")) { posts.push(JSON.parse(init.body)); return new Response("ok"); }
    return new Response("{}", { status: 404 });
  };
}

test("alerts when a check breaks, stays quiet while unchanged, and says when it recovers", async () => {
  setup();
  await runChecks();
  const first = posts.length; // first run reports only what's wrong (no email provider here)
  assert.ok(posts.every((p) => !/Sign-in service/.test(p.text)));
  authUp = false; await runChecks();
  assert.equal(posts.length, first + 1);
  assert.match(posts.at(-1).text, /🔴 Sign-in service: Supabase Auth answered 503/);
  await runChecks();
  assert.equal(posts.length, first + 1, "no repeat while still broken (reminders come after 6 hours)");
  authUp = true; await runChecks();
  assert.match(posts.at(-1).text, /✅ Sign-in service is working again/);
  assert.ok(globalThis.__fakeDb.tables.monitor_events.some((e) => e.kind === "check:auth" && /^Broken/.test(e.detail)));
});

test("a real failure alerts straight away, then at most every 30 minutes", async () => {
  setup();
  await reportFailure("email", "Couldn't reach Sendbyte: it took too long to answer.");
  assert.equal(posts.length, 1);
  assert.match(posts[0].text, /Emails failing for users: Couldn't reach Sendbyte/);
  await reportFailure("email", "again");
  assert.equal(posts.length, 1);
  assert.equal(globalThis.__fakeDb.tables.monitor_events.filter((e) => e.kind === "email").length, 2, "every failure is logged");
});

test("webhook messages are shaped for Telegram, Discord and Slack", async () => {
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("ok"); };
  await postToWebhook("https://api.telegram.org/bot123:abc/sendMessage?chat_id=42", "hi");
  await postToWebhook("https://discord.com/api/webhooks/1/x", "hi");
  await postToWebhook("https://hooks.slack.com/services/a", "hi");
  assert.deepEqual(sent[0].body, { text: "hi", chat_id: "42", disable_web_page_preview: true });
  assert.deepEqual(sent[1].body, { content: "hi" });
  assert.deepEqual(sent[2].body, { text: "hi" });
});
