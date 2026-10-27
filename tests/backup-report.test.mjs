import test from "node:test";
import assert from "node:assert/strict";

// the backup report endpoint only accepts the cron secret
test("backup report needs the cron secret", async () => {
  process.env.CRON_SECRET = "s3cret-value";
  const { POST } = await import("../app/api/monitor/backup/route.js");
  const res = await POST(new Request("http://x/api/monitor/backup", { method: "POST", headers: { authorization: "Bearer wrong" }, body: "{}" }));
  assert.equal(res.status, 401);
});
