import test from "node:test";
import assert from "node:assert/strict";
import { isThrowawayEmail, readFormToken } from "../lib/guard-core.js";

test("throwaway inboxes are spotted; normal ones aren't", () => {
  for (const e of ["bot@mailinator.com", "x@YOPMAIL.com", "a@sub.guerrillamail.com"]) assert.equal(isThrowawayEmail(e), true, e);
  for (const e of ["ada@gmail.com", "tolu@usetally.cc", "me@yahoo.co.uk", "nobody"]) assert.equal(isThrowawayEmail(e), false, e);
});

test("form token: age when ours, null when forged, malformed or too old", () => {
  const ok = () => true, no = () => false, now = 1_800_000_000_000;
  assert.equal(readFormToken(`${now - 4000}.mac`, ok, now), 4000);
  assert.equal(readFormToken(`${now - 4000}.mac`, no, now), null);
  assert.equal(readFormToken("garbage", ok, now), null);
  assert.equal(readFormToken("", ok, now), null);
  assert.equal(readFormToken(`${now - 25 * 3600_000}.mac`, ok, now), null);
});
