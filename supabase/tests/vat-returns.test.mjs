// VAT returns: a business sees only its own; consultants and other
// businesses' returns are never readable from the app.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function as(userId, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
let owner, outsider, biz, ret;
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`r-owner${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`r-out${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Returns Ltd','Ada','NGN') id")).rows[0].id;
  await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id");
  await pool.query("insert into public.tax_consultants(name,email) values ('Tolu','tolu@tax.test')");
  ret = (await one("insert into public.vat_returns(business_id, period, vat_minor) values ($1,'2026-10',8025000) returning id", [biz])).id;
});
test.after(() => pool.end());

test("the business reads its own return; others can't", async () => {
  assert.equal((await as(owner, "select id from public.vat_returns where id=$1", [ret])).rowCount, 1);
  assert.equal((await as(outsider, "select id from public.vat_returns where id=$1", [ret])).rowCount, 0);
});

test("nobody changes a return or reads consultants from the app", async () => {
  // row security: updates touch nothing, inserts are refused, consultants are invisible
  await as(owner, "update public.vat_returns set status='done' where id=$1", [ret]).catch(() => {});
  assert.equal((await one("select status from public.vat_returns where id=$1", [ret])).status, "to_file");
  await assert.rejects(as(owner, "insert into public.vat_returns(business_id, period) values ($1,'2026-09')", [biz]));
  const seen = await as(owner, "select * from public.tax_consultants").then((r) => r.rowCount, () => 0);
  assert.equal(seen, 0);
});

test("one return per business per month, and periods are months", async () => {
  await assert.rejects(pool.query("insert into public.vat_returns(business_id, period) values ($1,'2026-10')", [biz]));
  await assert.rejects(pool.query("insert into public.vat_returns(business_id, period) values ($1,'2026-13')", [biz]));
});
