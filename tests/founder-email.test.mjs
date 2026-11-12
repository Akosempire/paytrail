import test from "node:test";
import assert from "node:assert/strict";
const { founderAccessEmail } = await import("../lib/emails.js");

test("co-founder access email: what they get and a button to it", () => {
  const e = founderAccessEmail({ inviter: "Kore Ibrahim", manage: true, hasAccount: true, link: "https://usetally.cc/login?next=/founder" });
  assert.match(e.subject, /founder dashboard/);
  for (const s of ["Kore Ibrahim", "Open the founder dashboard", "Plans &amp; prices", "Customers", "login?next=/founder"]) assert.ok(e.html.includes(s), s);
  assert.ok(e.text.includes("Plans & prices"));
});

test("view-only: no plans or customers; no account yet: create one first", () => {
  const e = founderAccessEmail({ inviter: "Kore", manage: false, hasAccount: false, link: "https://usetally.cc/signup?email=chima%40x.com&next=%2Ffounder" });
  assert.ok(!e.html.includes("Plans &amp; prices") && e.html.includes("Create your account") && e.html.includes("view-only"));
  assert.match(e.text, /create your Usetally account/i);
});

test("switched to plans & customers later: says what changed", () => {
  const e = founderAccessEmail({ inviter: "Kore", manage: true, upgraded: true, link: "https://usetally.cc/login?next=/founder" });
  assert.match(e.subject, /manage plans and customers/);
  assert.ok(e.html.includes("Customers") && !e.html.includes("Quotes, invoices and receipts sent out"));
});
