// Admin changes to the free allowance apply to every business straight away:
// the trial's document count, and a Free plan whose limit is left empty
// (unlimited), including businesses that had already used it up.
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
let owner, biz, freeLimits;
const allowance = async () => (await as(owner, "select public.business_allowance($1) a", [biz])).rows[0].a;
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`u-owner${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('freelancer','Unlimited Test','Ada','NGN') id")).rows[0].id;
  freeLimits = (await pool.query("select id, document_limit from public.plans where price_minor=0")).rows;
});
test.after(async () => {
  for (const p of freeLimits) await pool.query("update public.plans set document_limit=$2 where id=$1", [p.id, p.document_limit]);
  await pool.end();
});

test("raising the trial's document count reopens a used-up trial for everyone", async () => {
  await pool.query("update public.platform_settings set trial_mode='documents', trial_documents=4");
  await pool.query("update public.businesses set subscription_status='trialing', trial_documents_used=4 where id=$1", [biz]);
  assert.equal((await allowance()).reason, "free"); // 4 of 4 used: on to Free
  await pool.query("update public.platform_settings set trial_documents=10");
  const a = await allowance();
  assert.equal(a.reason, "trial"); assert.equal(a.used, 4); assert.equal(a.limit, 10);
});

test("Free with an empty limit is unlimited, even after the monthly count was reached", async () => {
  await pool.query("update public.platform_settings set trial_documents=4");
  await pool.query("insert into public.documents(business_id, kind, number, customer_name, status, sent_at, counted_toward_allowance, total_minor, currency) select $1, 'invoice', 'U-'||g, 'C', 'sent', now(), true, 100, 'NGN' from generate_series(1,6) g", [biz]);
  let a = await allowance();
  assert.equal(a.allowed, false); assert.equal(a.reason, "free_limit"); // 6 sent, Free allows 5
  await pool.query("update public.plans set document_limit=null where price_minor=0");
  a = await allowance();
  assert.equal(a.allowed, true); assert.equal(a.reason, "free"); assert.equal(a.free, true);
  assert.equal(a.limit, null); assert.equal(a.ended, "trial_used");
});

test("a business on the Free plan itself (not via fallback) is unlimited too", async () => {
  const free = (await one("select id from public.plans where price_minor=0 and currency='NGN' and active limit 1")).id;
  await pool.query("update public.businesses set subscription_status='active', plan_id=$2, current_period_end=null where id=$1", [biz, free]);
  const a = await allowance();
  assert.equal(a.allowed, true); assert.equal(a.limit, null);
});
