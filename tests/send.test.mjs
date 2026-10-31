// The send sheet's pure parts: message variables, the Undo window, repeat
// dates and the QR payload (lib/send-core.js).
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MESSAGE, defaultSubject, fillTemplate, messageParagraphs, nextRecurrence, nextReminder, parseEmails, qrPayload, secondsLeft, sendVars, undoOpen, upcoming, whatsappText, whatsappUrl, daysBetween, UNDO_SECONDS } from "../lib/send-core.js";

const doc = { kind: "invoice", number: "INV-0042", customer_name: "Ade Foods", currency: "NGN", total_minor: 15000000, amount_paid_minor: 5000000, due_date: "2026-11-14" };
const link = "https://usetally.cc/d/abc123";

test("template variables are filled in; unknown ones stay as written", () => {
  const vars = sendVars(doc, "Akorede Studio", link);
  assert.equal(vars.client, "Ade");
  assert.match(vars.amount, /100,000/, "the amount is what's still due");
  const out = fillTemplate("Hi {client}, {number} for {amount} is due {due_date}: {link}. {nope} – {business}", vars);
  assert.match(out, /^Hi Ade, INV-0042 for .*100,000.* is due 14 Nov 2026: https:\/\/usetally\.cc\/d\/abc123\. \{nope\} – Akorede Studio$/);
  assert.equal(fillTemplate("due {due_date}", sendVars({ ...doc, due_date: null }, "B", link)), "due on receipt");
  assert.equal(fillTemplate("{client}", sendVars({ ...doc, customer_name: "" }, "B", link)), "there");
  assert.equal(defaultSubject(doc, "Akorede Studio"), "Invoice INV-0042 from Akorede Studio");
  assert.equal(defaultSubject({ ...doc, kind: "quote" }, "X"), "Quotation INV-0042 from X");
  for (const k of ["invoice", "quote"]) assert.ok(DEFAULT_MESSAGE[k].includes("{link}"));
});

test("the email body keeps the message and leaves out a bare link line (the button has it)", () => {
  const text = fillTemplate(DEFAULT_MESSAGE.invoice, sendVars(doc, "Akorede Studio", link));
  const paras = messageParagraphs(text, link);
  assert.equal(paras[0], "Hello Ade,");
  assert.ok(!paras.some((p) => p.includes(link)));
  assert.equal(paras.at(-1), "Thank you,\nAkorede Studio");
  assert.deepEqual(messageParagraphs(`Pay at ${link} today please`, link), [`Pay at ${link} today please`]);
});

test("CC addresses are cleaned, de-duplicated and checked", () => {
  assert.deepEqual(parseEmails("Boss@Ade.ng, boss@ade.ng; acct@ade.ng  ade@adefoods.ng", { not: ["ade@adefoods.ng"] }), { emails: ["boss@ade.ng", "acct@ade.ng"], bad: [] });
  assert.deepEqual(parseEmails("ok@a.co, nope, x@y").bad, ["nope", "x@y"]);
});

test("the Undo window is 10 seconds, with a second of slack", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");
  const after = new Date(now + UNDO_SECONDS * 1000).toISOString();
  assert.equal(undoOpen(after, now), true);
  assert.equal(undoOpen(after, now + 8500), true);
  assert.equal(undoOpen(after, now + 9500), false);
  assert.equal(undoOpen("not a date", now), false);
  assert.equal(secondsLeft(after, now + 3200), 7);
  assert.equal(secondsLeft(after, now + 20000), 0);
});

test("repeat dates: weekly +7, monthly keeps the day or the month's last day", () => {
  assert.equal(nextRecurrence("2026-12-29", "weekly"), "2027-01-05");
  assert.equal(nextRecurrence("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextRecurrence("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextRecurrence("2028-01-31", "monthly", 31), "2028-02-29");
  assert.equal(nextRecurrence("2026-12-15", "monthly"), "2027-01-15");
  assert.deepEqual(upcoming("2026-01-31", "monthly", 4), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("the QR code holds the public link only", () => {
  assert.equal(qrPayload(link), link);
  assert.equal(qrPayload("  http://localhost:3202/d/x  "), "http://localhost:3202/d/x");
  assert.equal(qrPayload("javascript:alert(1)"), null);
  assert.equal(qrPayload(""), null);
});

test("WhatsApp: the message carries the link; Nigerian numbers get the country code", () => {
  const text = whatsappText(doc, "Akorede Studio", link);
  assert.ok(text.includes(link) && text.includes("INV-0042"));
  assert.equal(whatsappUrl("0803 555 0199", "hi"), "https://wa.me/2348035550199?text=hi");
  assert.equal(whatsappUrl("+44 7700 900123", "a b"), "https://wa.me/447700900123?text=a%20b");
  assert.equal(whatsappUrl("", "x"), "https://wa.me/?text=x");
});

test("the next reminder skips sent and switched-off rules", () => {
  const rules = [{ id: "a", offset_days: -3 }, { id: "b", offset_days: 0 }, { id: "c", offset_days: 7 }, { id: "d", offset_days: 14, enabled: false }];
  assert.equal(nextReminder({ dueDate: "2026-11-14", rules, sentRuleIds: ["a"], today: "2026-11-12" }), "2026-11-14");
  assert.equal(nextReminder({ dueDate: "2026-11-14", rules, sentRuleIds: ["a", "b"], today: "2026-11-16" }), "2026-11-21");
  assert.equal(nextReminder({ dueDate: "2026-11-14", rules, sentRuleIds: ["a", "b", "c"], today: "2026-11-16" }), null);
  assert.equal(nextReminder({ dueDate: null, rules, today: "2026-11-16" }), null);
  assert.equal(daysBetween("2026-11-14", "2026-11-19"), 5);
});
