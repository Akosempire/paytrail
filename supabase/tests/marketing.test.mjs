// Ad performance tables: admin-only, one row per ad per day, and attribution
// on a business can only be set by the server.
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
let owner, admin, biz;
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`mk${Date.now()}@a.test`])).id;
  admin = (await one("insert into auth.users(email) values ($1) returning id", [`mka${Date.now()}@a.test`])).id;
  await pool.query("insert into public.platform_admins(user_id) values ($1)", [admin]);
  biz = (await as(owner, "select public.create_business('freelancer','Ad Test','Ada','NGN') id")).rows[0].id;
});
test.after(() => pool.end());

test("new attribution columns exist and the server can set them", async () => {
  await pool.query("update public.businesses set utm_source='facebook', utm_campaign='ng_test_1', utm_content='real_profit', fbclid='abc', fbc='fb.1.1.abc', landed_at=now() where id=$1", [biz]);
  const b = await one("select utm_content, utm_campaign, fbc from public.businesses where id=$1", [biz]);
  assert.deepEqual(b, { utm_content: "real_profit", utm_campaign: "ng_test_1", fbc: "fb.1.1.abc" });
});

test("a member can't change where their business came from", async () => {
  await as(owner, "update public.businesses set utm_content='fake', name='Ad Test 2' where id=$1", [biz]);
  const b = await one("select utm_content, name from public.businesses where id=$1", [biz]);
  assert.equal(b.utm_content, "real_profit");
  assert.equal(b.name, "Ad Test 2"); // other edits still work
});

test("one row per ad per day", async () => {
  await pool.query("insert into public.ad_insights(date, ad_id, ad_name, spend) values ('2026-10-27','ad1','Real profit',1200)");
  await assert.rejects(pool.query("insert into public.ad_insights(date, ad_id, spend) values ('2026-10-27','ad1',5)"), /duplicate key/);
  await pool.query("insert into public.ad_insights(date, ad_id, spend) values ('2026-10-27','ad1',1500) on conflict (date, ad_id) do update set spend = excluded.spend");
  assert.equal(Number((await one("select spend from public.ad_insights where ad_id='ad1'")).spend), 1500);
});

test("settings start with sensible defaults, in one row", async () => {
  const s = await one("select kill_spend_no_signup::int k, max_cost_per_signup::int m, scale_min_signups s, ngn_per_usd::int r, reports_enabled e, meta_ad_account_id a from public.marketing_settings");
  assert.deepEqual(s, { k: 3000, m: 1500, s: 3, r: 1500, e: true, a: "2167224513581774" });
  await assert.rejects(pool.query("insert into public.marketing_settings(id) values (false)"), /check/);
});

test("only platform admins can read ad data, settings and reports", async () => {
  await pool.query("insert into public.marketing_reports(period, summary) values ('6h', '{}')");
  for (const t of ["ad_insights", "marketing_settings", "marketing_reports"]) {
    assert.equal((await as(owner, `select count(*)::int n from public.${t}`)).rows[0].n, 0, `${t} hidden from members`);
    assert.ok((await as(admin, `select count(*)::int n from public.${t}`)).rows[0].n >= 1, `${t} visible to admins`);
  }
  await assert.rejects(as(owner, "insert into public.marketing_reports(period) values ('x')"), /row-level security/);
});
