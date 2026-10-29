// Ideas & help and time in the app: who can read what, and limits.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, p = []) => (await pool.query(sql, p)).rows[0];
async function as(userId, sql, p = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = await c.query(sql, p);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

let ada, bo, admin, biz, other, thread;
test.before(async () => {
  const s = Date.now();
  ada = (await one("insert into auth.users(email) values ($1) returning id", [`fb-ada${s}@a.test`])).id;
  bo = (await one("insert into auth.users(email) values ($1) returning id", [`fb-bo${s}@a.test`])).id;
  admin = (await one("insert into auth.users(email) values ($1) returning id", [`fb-admin${s}@a.test`])).id;
  await pool.query("insert into public.platform_admins(user_id) values ($1)", [admin]);
  biz = (await as(ada, "select public.create_business('company','Ada Ltd','Ada','NGN') id")).rows[0].id;
  other = (await as(bo, "select public.create_business('company','Bo Ltd','Bo','NGN') id")).rows[0].id;
});
test.after(() => pool.end());

test("a member starts a thread; only they and the team can read it", async () => {
  thread = (await as(ada, "select public.feedback_start($1, 'feature', 'WhatsApp invoices', 'Please add it', '/app/invoices') id", [biz])).rows[0].id;
  const t = await one("select * from public.feedback_threads where id=$1", [thread]);
  assert.equal(t.author_email.startsWith("fb-ada"), true);
  assert.equal(t.unread_admin, true);
  assert.equal((await as(ada, "select id from public.feedback_threads where id=$1", [thread])).rowCount, 1);
  assert.equal((await as(bo, "select id from public.feedback_threads where id=$1", [thread])).rowCount, 0);
  assert.equal((await as(bo, "select id from public.feedback_messages where thread_id=$1", [thread])).rowCount, 0);
  assert.equal((await as(admin, "select id from public.feedback_threads where id=$1", [thread])).rowCount, 1);
});

test("nobody can start a thread for a business they aren't in, or write directly", async () => {
  await assert.rejects(as(bo, "select public.feedback_start($1, 'feature', 'abc', 'x', '')", [biz]), /Not allowed/);
  await assert.rejects(as(ada, "insert into public.feedback_messages(thread_id, body, from_team) values ($1, 'fake', true)", [thread]));
});

test("the team replies; the person sees it as unread; others can't reply", async () => {
  const r = (await as(admin, "select public.feedback_reply($1, 'Coming next month') j", [thread])).rows[0].j;
  assert.equal(r.from_team, true);
  assert.equal((await one("select unread_user, unread_admin from public.feedback_threads where id=$1", [thread])).unread_user, true);
  await assert.rejects(as(bo, "select public.feedback_reply($1, 'hi')", [thread]), /Not allowed/);
  await as(ada, "select public.feedback_mark_read($1)", [thread]);
  assert.equal((await one("select unread_user from public.feedback_threads where id=$1", [thread])).unread_user, false);
  const back = (await as(ada, "select public.feedback_reply($1, 'Thanks!') j", [thread])).rows[0].j;
  assert.equal(back.from_team, false);
  assert.equal((await one("select unread_admin from public.feedback_threads where id=$1", [thread])).unread_admin, true);
});

test("only the team sets the status; a reply reopens a done thread", async () => {
  await assert.rejects(as(ada, "select public.feedback_set_status($1, 'done')", [thread]), /Not allowed/);
  await as(admin, "select public.feedback_set_status($1, 'done')", [thread]);
  await as(ada, "select public.feedback_reply($1, 'One more thing')", [thread]);
  assert.equal((await one("select status from public.feedback_threads where id=$1", [thread])).status, "open");
});

test("time adds up per area, is capped, and only the team can read it", async () => {
  await as(ada, "select public.usage_add($1, '/app/invoices', 60)", [biz]);
  await as(ada, "select public.usage_add($1, '/app/invoices', 9999)", [biz]);
  await as(ada, "select public.usage_add($1, '/app/<script>', 60)", [biz]);
  await as(ada, "select public.usage_add($1, '/app', 60)", [other]);
  const rows = (await pool.query("select area, seconds, business_id from public.usage_daily where user_id=$1", [ada])).rows;
  assert.deepEqual(rows.map((r) => [r.area, r.seconds]), [["/app/invoices", 360]]);
  assert.equal((await as(ada, "select * from public.usage_daily")).rowCount, 0);
  assert.ok((await as(admin, "select * from public.usage_daily where user_id=$1", [ada])).rowCount >= 1);
});
