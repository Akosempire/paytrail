import test from "node:test";
import assert from "node:assert/strict";
import { areaName, duration, summarizeUsage, usageArea } from "../lib/usage-core.js";
import { checkNewThread, checkReply, preview } from "../lib/feedback-core.js";

test("app pages become areas without ids; other pages aren't counted", () => {
  assert.equal(usageArea("/app"), "/app");
  assert.equal(usageArea("/app/invoices/6f1c2e7a-0000-4000-8000-000000000001/edit?x=1"), "/app/invoices/:id/edit");
  assert.equal(usageArea("/app/receipts/RCT-0042"), "/app/receipts/:id");
  assert.equal(usageArea("/app/Settings/Billing/"), "/app/settings/billing");
  assert.equal(usageArea("/admin"), null);
  assert.equal(usageArea("/"), null);
  assert.equal(usageArea("/apple"), null);
  assert.equal(areaName("/app/invoices/:id/edit"), "Editing a document");
  assert.equal(areaName("/app/invoices"), "Invoices");
});

test("durations read naturally", () => {
  assert.equal(duration(45), "45s");
  assert.equal(duration(720), "12m");
  assert.equal(duration(3900), "1h 05m");
});

test("usage adds up by area, business and day", () => {
  const rows = [
    { user_id: "u1", business_id: "b1", day: "2026-10-28", area: "/app/invoices", seconds: 600 },
    { user_id: "u1", business_id: "b1", day: "2026-10-28", area: "/app", seconds: 300 },
    { user_id: "u2", business_id: "b2", day: "2026-10-29", area: "/app/invoices/:id", seconds: 100 },
  ];
  const s = summarizeUsage(rows, { businesses: { b1: "Ada Ltd" } });
  assert.equal(s.totalSeconds, 1000);
  assert.equal(s.people, 2);
  assert.equal(s.avgPerPersonDay, 500);
  assert.equal(s.areas[0].name, "Invoices");
  assert.equal(s.businesses[0].name, "Ada Ltd");
  assert.deepEqual(s.days.map((d) => d.day), ["2026-10-28", "2026-10-29"]);
});

test("messages are checked and tidied", () => {
  assert.ok(checkNewThread({ kind: "feature", subject: "  WhatsApp   invoices ", body: "Please", page: "/app/invoices" }).ok);
  assert.equal(checkNewThread({ kind: "feature", subject: "  WhatsApp   invoices ", body: "x" }).value.subject, "WhatsApp invoices");
  assert.ok(checkNewThread({ kind: "spam", subject: "abc", body: "x" }).error);
  assert.ok(checkNewThread({ kind: "feature", subject: "ab", body: "x" }).error);
  assert.ok(checkNewThread({ kind: "feature", subject: "abc", body: "   " }).error);
  assert.ok(checkReply("").error);
  assert.equal(preview("a".repeat(400), 10).length, 10);
});
