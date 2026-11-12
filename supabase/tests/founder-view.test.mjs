// Founder view (20261108000100_founder_view.sql): founders read the summary,
// and nothing technical; everyone else is refused.
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
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const user = async (tag, confirmed = true) => (await one("insert into auth.users(email, email_confirmed_at) values ($1, $2) returning id", [`${tag}${stamp}@founder.test`, confirmed ? new Date() : null])).id;

let admin, founder, unconfirmed, stranger;
test.before(async () => {
  admin = await user("admin"); founder = await user("chima"); unconfirmed = await user("sneaky", false); stranger = await user("someone");
  await pool.query("insert into public.platform_admins(user_id) values ($1)", [admin]);
  await as(admin, "insert into public.platform_viewers(email, note, added_by) values ($1, 'Co-founder', $2), ($3, '', $2)", [`chima${stamp}@founder.test`, admin, `sneaky${stamp}@founder.test`]);
});
test.after(() => pool.end());

test("a founder reads the summary: customers, money in, gateway", async () => {
  assert.equal((await as(founder, "select public.is_platform_viewer() v")).rows[0].v, true);
  const s = (await as(founder, "select public.founder_summary() s")).rows[0].s;
  for (const k of ["businesses", "paying", "trialing", "revenue_month", "months", "gateway", "checkouts_month", "recent_payments", "unpaid", "plans"]) assert.ok(k in s, k);
  assert.equal(s.months.length, 6);
  assert.ok(!JSON.stringify(s.gateway).match(/hint|secret|key_/i), "no key details in the gateway status");
});

test("a founder is not an admin: admin functions and tables stay closed", async () => {
  assert.equal((await as(founder, "select public.is_platform_admin() a")).rows[0].a, false);
  await assert.rejects(as(founder, "select public.platform_summary()"), /Not allowed/);
  assert.equal((await as(founder, "select count(*)::int n from public.platform_viewers")).rows[0].n, 0, "can't see who else has access");
  await assert.rejects(as(founder, "insert into public.platform_viewers(email) values ('friend@founder.test')"));
  await assert.rejects(as(founder, "select billing_secret_enc from public.platform_settings"), /permission denied/);
});

test("an unconfirmed sign-up with a founder's email gets nothing", async () => {
  assert.equal((await as(unconfirmed, "select public.is_platform_viewer() v")).rows[0].v, false);
  await assert.rejects(as(unconfirmed, "select public.founder_summary()"), /Not allowed/);
});

test("everyone else is refused; admins can read it too", async () => {
  await assert.rejects(as(stranger, "select public.founder_summary()"), /Not allowed/);
  assert.ok((await as(admin, "select public.founder_summary() s")).rows[0].s.months);
});

test("removing a founder takes access away at once", async () => {
  await as(admin, "delete from public.platform_viewers where email = $1", [`chima${stamp}@founder.test`]);
  await assert.rejects(as(founder, "select public.founder_summary()"), /Not allowed/);
});

test("the app knows who's a founder", async () => {
  const c = (await as(admin, "select public.app_context() c")).rows[0].c;
  assert.ok("is_founder" in c);
});

test("sent-out counts: founders and admins only, POS sales kept apart", async () => {
  const c = (await as(admin, "select public.founder_sent_counts() c")).rows[0].c;
  for (const k of ["quotes", "invoices", "receipts", "pos_sales"]) for (const p of ["month", "last_month", "all"]) assert.equal(typeof c[k][p], "number", `${k}.${p}`);
  await assert.rejects(as(stranger, "select public.founder_sent_counts()"), /Not allowed/);
});
