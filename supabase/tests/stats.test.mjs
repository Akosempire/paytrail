// The website's live numbers: totals only, and switchable off.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
test.after(() => pool.end());
const asAnon = async (sql) => {
  const c = await pool.connect();
  try { await c.query("begin"); await c.query("set local role anon"); await c.query("select set_config('request.jwt.claim.sub', '', true)"); const r = await c.query(sql); await c.query("commit"); return r.rows[0]; }
  catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
};

test("anyone can read the totals, and they add up payments by currency", async () => {
  const before = (await asAnon("select public.public_stats() s")).s;
  assert.ok(before && typeof before.users === "number" && "ngn_minor" in before && "usd_minor" in before);
  const u = (await pool.query("insert into auth.users(email, email_confirmed_at) values ($1, now()) returning id", [`stats${Date.now()}@a.test`])).rows[0].id;
  const c = await pool.connect();
  await c.query("set role authenticated"); await c.query("select set_config('request.jwt.claim.sub', $1, false)", [u]);
  const biz = (await c.query("select public.create_business('company','Stats Ltd','Ada','NGN') id")).rows[0].id;
  const doc = (await c.query("select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Job", customer: { name: "Kay", email: "k@c.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 500000 }] })])).rows[0].id;
  await c.query("reset role"); await c.query("select set_config('request.jwt.claim.sub', '', false)"); c.release();
  await pool.query("insert into public.payments(business_id, document_id, method, amount_minor, currency) values ($1,$2,'bank_transfer',250000,'NGN')", [biz, doc]);
  const after = (await asAnon("select public.public_stats() s")).s;
  assert.equal(Number(after.users), Number(before.users) + 1);
  assert.equal(Number(after.ngn_minor) - Number(before.ngn_minor), 250000);
});

test("anonymous visitors still can't see any payment rows themselves", async () => {
  const r = await asAnon("select count(*)::int n from public.payments").catch(() => ({ n: 0 }));
  assert.equal(r.n, 0);
});

test("an admin can switch the numbers off", async () => {
  await pool.query("update public.platform_settings set public_stats = false where id = true");
  assert.equal((await asAnon("select public.public_stats() s")).s, null);
  await pool.query("update public.platform_settings set public_stats = true where id = true");
});
