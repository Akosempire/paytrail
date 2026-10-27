// Pricing (Oct 2026): Team at ₦10,000, a Free plan, and Free as the fallback
// when a trial or paid plan ends.
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
let owner, biz;
const allowance = async () => (await as(owner, "select public.business_allowance($1) a", [biz])).rows[0].a;
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`p-owner${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('freelancer','Price Test','Ada','NGN') id")).rows[0].id;
});
test.after(() => pool.end());

test("Team is ₦10,000 a month and ₦100,000 a year; Free exists in naira and dollars", async () => {
  assert.equal(Number((await one("select price_minor from public.plans where name='Team' and currency='NGN' and billing_interval='month'")).price_minor), 1000000);
  assert.equal(Number((await one("select price_minor from public.plans where name='Team' and currency='NGN' and billing_interval='year'")).price_minor), 10000000);
  const free = (await pool.query("select currency, document_limit, active from public.plans where name='Free' and price_minor=0 order by currency")).rows;
  assert.deepEqual(free.map((p) => [p.currency, p.document_limit, p.active]), [["NGN", 5, true], ["USD", 5, true]]);
});

test("during the trial the trial applies; after it, Free (5 a month) instead of a lockout", async () => {
  await pool.query("update public.platform_settings set trial_mode='days', trial_days=14");
  await pool.query("update public.businesses set subscription_status='trialing', trial_ends_at=now() + interval '3 days' where id=$1", [biz]);
  assert.equal((await allowance()).reason, "trial");
  await pool.query("update public.businesses set trial_ends_at=now() - interval '1 day' where id=$1", [biz]);
  let a = await allowance();
  assert.equal(a.reason, "free"); assert.equal(a.allowed, true); assert.equal(a.limit, 5); assert.equal(a.ended, "trial_used");
  // five sent this month: the sixth is refused with free_limit
  await pool.query("insert into public.documents(business_id, kind, number, customer_name, status, sent_at, counted_toward_allowance, total_minor, currency) select $1, 'invoice', 'F-'||g, 'C', 'sent', now(), true, 100, 'NGN' from generate_series(1,5) g", [biz]);
  a = await allowance();
  assert.equal(a.allowed, false); assert.equal(a.reason, "free_limit");
});

test("a lapsed paid plan also drops to Free; a suspended business stays blocked", async () => {
  const team = (await one("select id from public.plans where name='Team' and currency='NGN' and billing_interval='month'")).id;
  await pool.query("delete from public.documents where business_id=$1", [biz]);
  await pool.query("update public.businesses set subscription_status='active', plan_id=$2, current_period_end=now() - interval '1 day' where id=$1", [biz, team]);
  const a = await allowance();
  assert.equal(a.reason, "free"); assert.equal(a.ended, "subscription_required");
  await pool.query("update public.businesses set subscription_status='suspended' where id=$1", [biz]);
  assert.equal((await allowance()).reason, "suspended");
});

test("founding spots count down as businesses join", async () => {
  const f = (await one("select id, spots from public.plans where name='Founding'"));
  assert.equal(f.spots, 100);
  const before = (await one("select public.plan_spots_left($1) n", [f.id])).n;
  await pool.query("update public.businesses set plan_id=$2, subscription_status='active', current_period_end=now()+interval '1 year' where id=$1", [biz, f.id]);
  assert.equal((await one("select public.plan_spots_left($1) n", [f.id])).n, before - 1);
});
