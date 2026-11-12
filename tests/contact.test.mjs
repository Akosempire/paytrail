import test from "node:test";
import assert from "node:assert/strict";
const { contactOk } = await import("../lib/contact.js");

test("onboarding needs an email or a phone number", () => {
  assert.equal(contactOk("hello@adeyemi.ng", ""), true);
  assert.equal(contactOk("", "+234 801 234 5678"), true);
  assert.equal(contactOk("", "0801 234 5678"), true);
  assert.equal(contactOk("hello@adeyemi.ng", "0801 234 5678"), true);
  assert.equal(contactOk("", ""), false);
  assert.equal(contactOk("   ", "  "), false);
  assert.equal(contactOk("not-an-email", "123"), false);
});
