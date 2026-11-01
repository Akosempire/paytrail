import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT, absoluteLink, checkAnnouncement, ownerRecipients } from "../lib/announcements-core.js";

test("the ChatGPT draft is valid and points at AI & MCP", () => {
  const v = checkAnnouncement(DRAFT);
  assert.equal(v.ok, true);
  assert.equal(v.value.link_href, "/app/settings/ai");
  assert.match(v.value.body, /beta/);
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
});
