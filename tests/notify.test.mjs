import test from "node:test";
import assert from "node:assert/strict";
import { checkNotify } from "../lib/notify-core.js";
import { trackojaEmail } from "../lib/emails.js";

const ok = { to: "Ada@Shop.ng", subject: "Your day at Ikeja", heading: "Yesterday", lines: ["12 sales, ₦84,500", "3 items low"], details: [["Cash", "₦40,000"]], button: { text: "Open TrackOja", url: "https://trackoja.cv/reports" } };

test("one clean recipient and a tidy message pass", () => {
  const v = checkNotify(ok);
  assert.ok(v.ok);
  assert.equal(v.value.to, "ada@shop.ng");
  assert.deepEqual(v.value.details, [["Cash", "₦40,000"]]);
});

test("anything that could send to many people, or carry links elsewhere, is refused", () => {
  assert.ok(checkNotify({ ...ok, to: "a@b.ng, c@d.ng" }).error);
  assert.ok(checkNotify({ ...ok, to: "a@b.ng\nBcc: x@y.z" }).error);
  assert.ok(checkNotify({ ...ok, to: "" }).error);
  assert.ok(checkNotify({ ...ok, subject: "" }).error);
  assert.ok(checkNotify({ ...ok, lines: [] }).error);
  assert.ok(checkNotify({ ...ok, lines: Array(41).fill("x") }).error);
  assert.ok(checkNotify({ ...ok, button: { text: "Go", url: "http://evil.example" } }).error);
  assert.ok(checkNotify({ ...ok, button: { text: "Go", url: "javascript:alert(1)" } }).error);
  assert.ok(checkNotify(null).error);
});

test("the email is TrackOja-branded and escapes what it's given", () => {
  const e = trackojaEmail({ ...checkNotify({ ...ok, lines: ["<script>x</script>"] }).value });
  assert.equal(e.subject, "Your day at Ikeja");
  assert.match(e.html, /TrackOja/);
  assert.doesNotMatch(e.html, /<script>x<\/script>/);
  assert.match(e.text, /Open TrackOja/);
});
