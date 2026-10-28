import test from "node:test";
import assert from "node:assert/strict";
import { parseAttribution, firstTouch, fbcFrom, consentRequired, adTagsAllowed, countryFromCampaign, utmFromAdCreative } from "../lib/attribution-core.js";
import { metrics, verdict, revenueIn, spendSince, funnel, headline } from "../lib/marketing-core.js";
import { capiEvent, hashEmail, cronAuthorized } from "../lib/meta-core.js";
import { createHash } from "node:crypto";

test("UTM tags and fbclid are read from the landing URL", () => {
  const a = parseAttribution("https://usetally.cc/?utm_source=facebook&utm_medium=paid&utm_campaign=ng_test_1&utm_content=real_profit&fbclid=IwAR1", 1_800_000_000_000);
  assert.equal(a.utm_campaign, "ng_test_1");
  assert.equal(a.utm_content, "real_profit");
  assert.equal(a.fbclid, "IwAR1");
  assert.match(a.first_landing_url, /^https:\/\/usetally\.cc\/\?utm_source/);
  assert.equal(a.landed_at, new Date(1_800_000_000_000).toISOString());
  assert.equal(parseAttribution("https://usetally.cc/pricing"), null, "no tags, nothing to store");
  assert.equal(parseAttribution("not a url"), null);
});

test("first touch is kept; _fbc is built from fbclid", () => {
  const first = { utm_content: "a" }, later = { utm_content: "b" };
  assert.equal(firstTouch(first, later), first);
  assert.equal(firstTouch(null, later), later);
  assert.equal(fbcFrom("IwAR1", 1700000000000), "fb.1.1700000000000.IwAR1");
  assert.equal(fbcFrom(""), null);
});

test("consent only where the law asks; ad tags never on private pages", () => {
  assert.equal(consentRequired("GB"), true); assert.equal(consentRequired("de"), true);
  assert.equal(consentRequired("NG"), false); assert.equal(consentRequired(null), false);
  for (const p of ["/", "/signup", "/login", "/onboarding", "/privacy"]) assert.equal(adTagsAllowed(p), true, p);
  for (const p of ["/app", "/app/invoices", "/admin/marketing", "/d/abc", "/pay/x", "/r/abc", "/print/1", "/api/geo"]) assert.equal(adTagsAllowed(p), false, p);
});

test("country from the campaign name; utm_content from the ad", () => {
  assert.equal(countryFromCampaign("ng_test_1"), "NG");
  assert.equal(countryFromCampaign("uk_test_1"), "UK");
  assert.equal(countryFromCampaign("Launch"), null);
  assert.deepEqual(utmFromAdCreative({ url_tags: "utm_source=fb&utm_campaign=uk_test_1&utm_content=tally" }), { utm_campaign: "uk_test_1", utm_content: "tally" });
  assert.deepEqual(utmFromAdCreative({ object_story_spec: { link_data: { link: "https://usetally.cc/?utm_content=receipt" } } }), { utm_content: "receipt" });
});

test("verdicts: kill, scale, watch, with the edge cases", () => {
  const st = { kill_spend_no_signup: 3000, max_cost_per_signup: 1500, scale_min_signups: 3 };
  assert.equal(verdict({ spend: 0, signups: 0 }, st), "watch", "nothing spent yet");
  assert.equal(verdict({ spend: 3200, signups: 0 }, st), "kill", "spent the limit, no sign-ups");
  assert.equal(verdict({ spend: 2999, signups: 0 }, st), "watch");
  assert.equal(verdict({ spend: 4600, signups: 2 }, st), "kill", "2,300 a sign-up is over 1.5 × 1,500");
  assert.equal(verdict({ spend: 4500, signups: 3 }, st), "scale", "1,500 a sign-up, 3 sign-ups");
  assert.equal(verdict({ spend: 2000, signups: 2 }, st), "watch", "cheap but too few to trust");
  const m = metrics({ spend: 4500, link_clicks: 90, signups: 3, revenue: 9000 });
  assert.deepEqual([m.cpc, m.cost_per_signup, m.return_on_spend], [50, 1500, 2]);
  assert.equal(metrics({ spend: 0 }).return_on_spend, null);
});

test("revenue is converted between ₦ and $ for return on spend", () => {
  const pays = [{ amount_minor: 1000, currency: "USD" }, { amount_minor: 1500000, currency: "NGN" }]; // $10 + ₦15,000
  assert.equal(revenueIn("NGN", pays, 1500), 30000); // ($10 + $10) × 1,500
  assert.equal(revenueIn("USD", pays, 1500), 20);
  assert.equal(revenueIn("NGN", [], 1500), 0);
});

test("last-6h spend from the growth since the last sync", () => {
  assert.equal(spendSince({ date: "2026-10-28", today: { a: 1000 } }, { date: "2026-10-28", today: { a: 1800, b: 300 } }), 1100);
  assert.equal(spendSince({ date: "2026-10-27", today: { a: 2000 } }, { date: "2026-10-28", today: { a: 400 }, yesterday: { a: 2600 } }), 1000);
  assert.equal(spendSince(null, { date: "x", today: {} }), null);
  assert.deepEqual(funnel([{ value: 100 }, { value: 25 }, { value: 0 }]).map((s) => s.lost), [null, 75, 100]);
  assert.match(headline([{ name: "Real profit", verdict: "scale", signups: 4, cost_per_signup: 900, spend: 3600 }, { name: "VAT", verdict: "kill", signups: 0, spend: 3200 }], (v) => `₦${v}`), /Real profit is winning\. VAT spent ₦3200 with no sign-ups: pause it\./);
});

test("Conversions API: personal details hashed, the rest as Meta expects", () => {
  const e = capiEvent({ name: "CompleteRegistration", eventId: "reg-1", time: 1_800_000_000_000, email: "  Ada@Gmail.com ", phone: "+234 803 000 0000", country: "NG", fbc: "fb.1.1.x", fbp: "fb.1.2.y", ip: "1.2.3.4", userAgent: "UA", url: "https://usetally.cc/signup" });
  assert.equal(e.user_data.em[0], createHash("sha256").update("ada@gmail.com").digest("hex"));
  assert.equal(e.user_data.ph[0], createHash("sha256").update("2348030000000").digest("hex"));
  assert.equal(e.user_data.country[0], createHash("sha256").update("ng").digest("hex"));
  assert.deepEqual([e.event_time, e.event_id, e.action_source, e.user_data.fbc, e.user_data.client_ip_address], [1_800_000_000, "reg-1", "website", "fb.1.1.x", "1.2.3.4"]);
  assert.equal(JSON.stringify(e).includes("ada@gmail.com"), false, "no plain email");
  assert.deepEqual(capiEvent({ name: "Purchase", eventId: "p", value: 15.004, currency: "USD" }).custom_data, { value: 15, currency: "USD" });
  assert.equal(hashEmail(""), null);
});

test("scheduled job: only with the right secret", () => {
  assert.equal(cronAuthorized("Bearer s3cret-value", "s3cret-value"), true);
  assert.equal(cronAuthorized("Bearer wrong-value", "s3cret-value"), false);
  assert.equal(cronAuthorized(undefined, "s3cret-value"), false);
  assert.equal(cronAuthorized("Bearer ", ""), false, "no secret set: always refused");
});

test("the cron route refuses calls without CRON_SECRET", async () => {
  const { GET } = await import("../app/api/cron/marketing/route.js");
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "a-long-cron-secret";
  try {
    assert.equal((await GET(new Request("https://x/api/cron/marketing"))).status, 401);
    assert.equal((await GET(new Request("https://x/api/cron/marketing", { headers: { authorization: "Bearer wrong" } }))).status, 401);
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request("https://x/api/cron/marketing", { headers: { authorization: "Bearer " } }))).status, 401, "no secret set: closed");
  } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});

test("the report email: subject with 6h spend, sign-ups and the best ad", async () => {
  const { reportEmail } = await import("../lib/marketing.js");
  const t = (spend, signups, paid = 0, revenue = 0) => ({ spend, signups, paid, revenue, cost_per_signup: signups ? spend / signups : null });
  const rows = [
    { ad_id: "a", name: "Real profit", country: "NG", spend: 3600, signups: 4, cost_per_signup: 900, paid: 1, verdict: "scale" },
    { ad_id: "b", name: "VAT", country: "NG", spend: 3200, signups: 0, cost_per_signup: null, paid: 0, verdict: "kill" },
  ];
  const reports = [{ label: "Last 6 hours", period: "6h", spendKnown: true, totals: t(3200, 2) }, { label: "Today", period: "today", spendKnown: true, totals: t(4100, 3) }, { label: "Last 7 days", period: "7d", spendKnown: true, totals: t(6800, 4, 1, 15000), otherSignups: 2 }];
  const { subject, html } = reportEmail({ reports, rows, accountCurrency: "NGN" });
  assert.equal(subject, "Usetally ads · last 6h: ₦3,200 spent · 2 sign-ups · best: Real profit");
  assert.match(html, /Real profit is winning\. VAT spent ₦3,200 with no sign-ups: pause it\./);
  assert.match(html, /\/admin\/marketing/);
  await import("node:fs").then((fs) => fs.writeFileSync(process.env.REPORT_PREVIEW || "/dev/null", html));
});
