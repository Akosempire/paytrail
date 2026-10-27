import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
test.after(() => pool.end());
const hit = async (key) => (await pool.query("select public.rate_hit($1, 600, 3) ok", [key])).rows[0].ok;

test("rate_hit allows max hits per window, then says no", async () => {
  const key = `test:${Date.now()}`;
  assert.deepEqual([await hit(key), await hit(key), await hit(key), await hit(key)], [true, true, true, false]);
  assert.equal(await hit(`${key}:other`), true, "other keys are separate");
});

test("the public and signed-in users can't use it", async () => {
  const c = await pool.connect();
  try {
    await c.query("begin"); await c.query("set local role authenticated");
    await assert.rejects(c.query("select public.rate_hit('x', 60, 1)"), /permission denied/);
  } finally { await c.query("rollback"); c.release(); }
});
