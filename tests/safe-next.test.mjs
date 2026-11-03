import test from "node:test";
import assert from "node:assert/strict";
const { safeNext } = await import("../lib/safe-next.js");

test("after sign-in, only paths on this site", () => {
  for (const ok of ["/app", "/app/documents/1?tab=files", "/onboarding#x"]) assert.equal(safeNext(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "/\tevil.com", "/\n/evil.com", "https://evil.com", "evil.com", "", null, "/%0a"])
    assert.ok(["/app", "/%0a"].includes(safeNext(bad)), String(bad));
  assert.equal(safeNext("//evil.com", "/onboarding"), "/onboarding");
});
