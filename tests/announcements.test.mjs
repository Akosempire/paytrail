import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT, absoluteLink, audienceLabel, checkAnnouncement, isFor, ownerRecipients } from "../lib/announcements-core.js";

test("the ChatGPT draft is valid and points at AI & MCP", () => {
  const v = checkAnnouncement(DRAFT);
  assert.equal(v.ok, true);
  assert.equal(v.value.link_href, "/app/settings/ai");
  assert.match(v.value.body, /beta/);
  assert.match(v.value.body, /^• /m);
});

test("announcements are checked", () => {
  assert.ok(checkAnnouncement({ title: "Hi" }).error);
  assert.ok(checkAnnouncement({ title: "Hello there", link_href: "/app/x" }).error); // needs a label
  assert.ok(checkAnnouncement({ title: "Hello there", link_href: "javascript:alert(1)", link_label: "Go" }).error);
  assert.ok(checkAnnouncement({ title: "Hello there", link_href: "//evil.example", link_label: "Go" }).error);
  assert.equal(checkAnnouncement({ title: "  Hello   there ", link_href: "https://usetally.cc/docs/mcp", link_label: "Docs" }).value.title, "Hello there");
});

test("one email per owner, never to businesses being deleted", () => {
  const r = ownerRecipients([
    { email: "Ada@x.ng", full_name: "Ada", businesses: {} },
    { email: "ada@x.ng", full_name: "Ada", businesses: {} },
    { email: "gone@x.ng", businesses: { deletion_requested_at: "2026-10-01" } },
    { email: "not-an-email" },
  ]);
  assert.deepEqual(r, [{ email: "ada@x.ng", name: "Ada" }]);
  assert.equal(absoluteLink("https://usetally.cc", "/app/settings/ai"), "https://usetally.cc/app/settings/ai");
});

test("the email greets the owner and has the button", async () => {
  const { announcementEmail } = await import("../lib/emails.js");
  const e = announcementEmail({ title: DRAFT.title, body: DRAFT.body, link: "https://usetally.cc/app/settings/ai", label: "Set it up", name: "Ada Obi" });
  assert.equal(e.subject, DRAFT.title);
  assert.match(e.html, /Hi Ada,/);
  assert.match(e.html, /Set it up/);
  assert.match(e.html, /New in Usetally/);
  assert.match(e.html, /Make quotes and invoices/); // feature rows
  assert.match(e.html, /Made by ChatGPT/); // the chat picture for AI news
  assert.match(e.html, /https:\/\/usetally\.cc\/icons\/icon-192\.png/);
  assert.match(e.text, /- Send and chase/);
  const plain = announcementEmail({ title: "New tax report", body: "Your VAT report is ready.", link: "https://usetally.cc/app/tax", label: "Open" });
  assert.doesNotMatch(plain.html, /Made by ChatGPT/);
});

test("send to everyone, or only to chosen businesses", () => {
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(checkAnnouncement({ title: "Hello there" }).value.business_ids, []);
  assert.equal(checkAnnouncement({ title: "Hello there" }).value.audience, "all");
  assert.match(checkAnnouncement({ title: "Hello there", audience: "selected", business_ids: [] }).error, /Pick at least one/);
  const v = checkAnnouncement({ title: "Hello there", audience: "selected", business_ids: [A, A, "nope", B] }).value;
  assert.deepEqual(v.business_ids, [A, B]);
  assert.equal(isFor({ audience: "selected", business_ids: [A] }, A), true);
  assert.equal(isFor({ audience: "selected", business_ids: [A] }, B), false);
  assert.equal(isFor({ audience: "all" }, B), true);
  assert.equal(isFor({}, B), true); // before the SQL: everyone
  assert.equal(audienceLabel({ audience: "selected", business_ids: [A] }), "1 selected business");
  assert.equal(audienceLabel({ audience: "all" }), "Everyone");
});
