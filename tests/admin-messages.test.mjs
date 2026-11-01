import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_TEMPLATES, PAYMENT_PROBLEMS, checkMessage, fillTemplate } from "../lib/admin-messages-core.js";

test("'Upgrade not paid' is about the problems they may be facing, filled in for them", () => {
  const m = fillTemplate("upgrade_unpaid", { name: "Hella Jenan", business: "Hellajenan Studio", plan: "Team", amount: "$37.50", billingLink: "https://usetally.cc/app/settings/billing" });
  assert.equal(m.subject, "Your Usetally upgrade didn't go through");
  assert.match(m.body, /^Hi Hella,/);
  assert.match(m.body, /Team \(\$37\.50\)/);
  assert.match(m.body, /nothing was charged/);
  for (const [problem] of PAYMENT_PROBLEMS) assert.ok(m.body.includes(problem), problem);
  assert.match(m.body, /https:\/\/usetally\.cc\/app\/settings\/billing/);
  assert.match(m.body, /bank transfer/);
  assert.doesNotMatch(m.body, /Nigeria/);
});

test("other starting points, and safe defaults", () => {
  assert.match(fillTemplate("check_in", { business: "Obi Foods" }).body, /Usetally for Obi Foods/);
  assert.equal(fillTemplate("blank", {}).subject, "");
  assert.match(fillTemplate("nope", { name: "" }).body, /^Hi there,/);
  assert.ok(Object.keys(MESSAGE_TEMPLATES).includes("upgrade_unpaid"));
});

test("a message needs a subject and a body, within limits", () => {
  assert.equal(checkMessage({ subject: "Hi", body: "x" }).ok, false);
  assert.equal(checkMessage({ subject: "Hello there", body: "  " }).ok, false);
  assert.equal(checkMessage({ subject: "x".repeat(141), body: "y" }).ok, false);
  assert.equal(checkMessage({ subject: "Hello there", body: "y".repeat(5001) }).ok, false);
  const ok = checkMessage({ subject: "  Hello   there ", body: "Line one\r\nLine two " });
  assert.deepEqual(ok, { ok: true, subject: "Hello there", body: "Line one\nLine two" });
});

test("the team's email shows the message, lists as lists, and a reply button", async () => {
  const { teamMessageEmail } = await import("../lib/emails.js");
  const m = fillTemplate("upgrade_unpaid", { name: "Ada", plan: "Team", amount: "$37.50", billingLink: "https://usetally.cc/app/settings/billing" });
  const e = teamMessageEmail({ ...m, link: "https://usetally.cc/app/feedback/t1" });
  assert.equal(e.subject, m.subject);
  assert.match(e.html, /From the Usetally team/);
  assert.match(e.html, /<br>• The card isn/);
  assert.match(e.html, /Reply in Usetally/);
  assert.match(e.html, /app\/feedback\/t1/);
});
