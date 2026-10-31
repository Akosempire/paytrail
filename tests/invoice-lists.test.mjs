import test from "node:test";
import assert from "node:assert/strict";
import { checkRule, fillTemplate, invoiceSummary, isOverdueOn, reminderDate, reminderVars, reminderWhen } from "../lib/reminders-core.js";
import { searchBanks } from "../lib/ng-banks.js";

test("reminder timing reads naturally and lands on the right day", () => {
  assert.equal(reminderWhen(-3), "3 days before the due date");
  assert.equal(reminderWhen(0), "On the due date");
  assert.equal(reminderWhen(1), "1 day after the due date");
  assert.equal(reminderDate("2026-11-14", -3), "2026-11-11");
  assert.equal(reminderDate("2026-11-28", 7), "2026-12-05");
});

test("templates fill known names and leave the rest", () => {
  const doc = { customer_name: "Ade Foods Ltd", total_minor: 30000000, amount_paid_minor: 10000000, currency: "NGN", due_date: "2026-11-14", number: "INV-0042" };
  const v = reminderVars(doc, { name: "Akorede Studio" }, "https://usetally.cc/d/x");
  assert.equal(fillTemplate("Hi {client}, {amount} for {number} by {due_date}: {link} {other}", v),
    `Hi Ade, ₦200,000 for INV-0042 by ${v.due_date}: https://usetally.cc/d/x {other}`);
});

test("rules need a subject, a message with the link, and a sensible day", () => {
  assert.ok(checkRule({ offset_days: -3, subject: "Due soon", message: "Pay here {link}" }).ok);
  assert.ok(checkRule({ offset_days: 3, subject: "x", message: "no link" }).error);
  assert.ok(checkRule({ offset_days: 200, subject: "x", message: "{link}" }).error);
  assert.ok(checkRule({ offset_days: 1.5, subject: "x", message: "{link}" }).error);
});

test("overdue means unpaid and past the due date", () => {
  assert.equal(isOverdueOn({ kind: "invoice", status: "sent", due_date: "2026-11-01" }, "2026-11-02"), true);
  assert.equal(isOverdueOn({ kind: "invoice", status: "sent", due_date: "2026-11-02" }, "2026-11-02"), false);
  assert.equal(isOverdueOn({ kind: "invoice", status: "paid", due_date: "2026-10-01" }, "2026-11-02"), false);
  assert.equal(isOverdueOn({ kind: "invoice", status: "draft", due_date: "2026-10-01" }, "2026-11-02"), false);
});

test("the list summary adds up per currency", () => {
  const rows = [
    { kind: "invoice", status: "sent", currency: "NGN", total_minor: 100000, amount_paid_minor: 0, due_date: "2026-10-01" },
    { kind: "invoice", status: "partially_paid", currency: "NGN", total_minor: 50000, amount_paid_minor: 20000, due_date: "2026-12-01" },
    { kind: "invoice", status: "paid", currency: "NGN", total_minor: 70000, amount_paid_minor: 70000, paid_at: "2026-11-03T10:00:00Z" },
    { kind: "invoice", status: "paid", currency: "NGN", total_minor: 90000, amount_paid_minor: 90000, paid_at: "2026-10-20T10:00:00Z" },
    { kind: "invoice", status: "viewed", currency: "USD", total_minor: 5000, amount_paid_minor: 0, due_date: "2026-10-30" },
    { kind: "invoice", status: "draft", currency: "NGN", total_minor: 999999, amount_paid_minor: 0 },
  ];
  const s = invoiceSummary(rows, { today: "2026-11-05", monthStart: "2026-11-01" });
  assert.deepEqual(s.NGN, { currency: "NGN", outstanding: 130000, overdue: 100000, overdueCount: 1, paidThisMonth: 70000 });
  assert.equal(s.USD.overdue, 5000);
});

test("bank search finds what people type", () => {
  assert.equal(searchBanks("gt")[0], "Guaranty Trust Bank (GTBank)");
  assert.equal(searchBanks("zen")[0], "Zenith Bank");
  assert.ok(searchBanks("monie").includes("Moniepoint Microfinance Bank"));
  assert.equal(searchBanks("").length, 8);
  assert.deepEqual(searchBanks("qqqq"), []);
});

test("the standard invoice email always carries the link and fills in", async () => {
  const { DEFAULT_INVOICE_EMAIL, fillTemplate } = await import("../lib/reminders-core.js");
  assert.ok(DEFAULT_INVOICE_EMAIL.includes("{link}"));
  const out = fillTemplate(DEFAULT_INVOICE_EMAIL, { client: "Chioma", number: "INV-0042", amount: "₦150,000", due_date: "14 Nov 2026", link: "https://x/d/t" });
  assert.equal(/\{(client|number|amount|due_date|link)\}/.test(out), false);
  assert.match(out, /Hi Chioma/);
});
