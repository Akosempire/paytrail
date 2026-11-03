// Announcements sent to chosen businesses: only their members can read them.
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
let ada, bo, adaBiz, boBiz;
test.before(async () => {
  ada = (await one("insert into auth.users(email) values ($1) returning id", [`aud-a${Date.now()}@a.test`])).id;
  bo = (await one("insert into auth.users(email) values ($1) returning id", [`aud-b${Date.now()}@a.test`])).id;
  adaBiz = (await as(ada, "select public.create_business('freelancer','Ada Co','Ada','NGN') id")).rows[0].id;
  boBiz = (await as(bo, "select public.create_business('freelancer','Bo Co','Bo','NGN') id")).rows[0].id;
  await pool.query("insert into public.announcements(title, active, published_at, audience, business_ids) values ('For everyone', true, now(), 'all', '{}'), ('Only Ada', true, now(), 'selected', array[$1::uuid]), ('Hidden draft', false, null, 'selected', array[$1::uuid])", [adaBiz]);
});
test.after(async () => { await pool.query("delete from public.announcements where title in ('For everyone','Only Ada','Hidden draft')"); await pool.end(); });

const titles = async (u) => (await as(u, "select title from public.announcements where title in ('For everyone','Only Ada','Hidden draft') order by title")).rows.map((r) => r.title);

test("a chosen business sees its announcement; others don't", async () => {
  assert.deepEqual(await titles(ada), ["For everyone", "Only Ada"]);
  assert.deepEqual(await titles(bo), ["For everyone"]);
});

test("audience must be all or selected", async () => {
  await assert.rejects(pool.query("insert into public.announcements(title, audience) values ('Bad one', 'some')"));
});
