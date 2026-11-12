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

// ---- co-founder access (20261112000200_cofounder_access.sql)
test("a managing co-founder edits plans and sees customers; a view-only one can't", async () => {
  const cofounder = await user("cofounder"), viewer = await user("viewonly");
  await as(admin, "insert into public.platform_viewers(email, can_manage, added_by) values ($1, true, $3), ($2, false, $3)", [`cofounder${stamp}@founder.test`, `viewonly${stamp}@founder.test`, admin]);
  assert.equal((await as(cofounder, "select public.is_platform_manager() m")).rows[0].m, true);
  assert.equal((await as(viewer, "select public.is_platform_manager() m")).rows[0].m, false);
  assert.equal((await as(cofounder, "select public.is_platform_admin() a")).rows[0].a, false, "still not an admin");

  const plan = (await as(cofounder, "insert into public.plans(name, price_minor, currency, billing_interval, active) values ('Cofounder test plan', 500000, 'NGN', 'month', false) returning id")).rows[0].id;
  await as(cofounder, "update public.plans set price_minor = 600000 where id = $1", [plan]);
  assert.equal(Number((await one("select price_minor from public.plans where id = $1", [plan])).price_minor), 600000);
  // a view-only founder can't touch plans (the update matches nothing, the insert is refused)
  await as(viewer, "update public.plans set price_minor = 1 where id = $1", [plan]);
  assert.equal(Number((await one("select price_minor from public.plans where id = $1", [plan])).price_minor), 600000);
  await assert.rejects(as(viewer, "insert into public.plans(name, price_minor, currency, billing_interval) values ('x', 1, 'NGN', 'month')"));
  await assert.rejects(as(viewer, "select public.delete_plan($1)", [plan]), /Not allowed/);

  // customers list with contacts: managers yes, view-only no
  const c = (await as(cofounder, "select public.founder_customers('', 5, 0) c")).rows[0].c;
  assert.ok(typeof c.total === "number" && Array.isArray(c.rows));
  if (c.rows[0]) for (const k of ["name", "owner_name", "owner_email", "email", "phone", "plan", "status", "documents_sent"]) assert.ok(k in c.rows[0], k);
  await assert.rejects(as(viewer, "select public.founder_customers('', 5, 0)"), /Not allowed/);
  await assert.rejects(as(stranger, "select public.founder_customers('', 5, 0)"), /Not allowed/);

  // delete: refused while a business is on the plan, fine once nobody is
  const biz = (await one("select id from public.businesses limit 1"))?.id;
  if (biz) {
    const old = (await one("select plan_id from public.businesses where id = $1", [biz])).plan_id;
    await pool.query("update public.businesses set plan_id = $2 where id = $1", [biz, plan]);
    await assert.rejects(as(cofounder, "select public.delete_plan($1)", [plan]), /IN_USE:1/);
    const u = (await as(cofounder, "select businesses, paying from public.plan_usage() where plan_id = $1", [plan])).rows[0];
    assert.equal(Number(u.businesses), 1);
    await pool.query("update public.businesses set plan_id = $2 where id = $1", [biz, old]);
  }
  await assert.rejects(as(cofounder, "delete from public.plans where id = $1", [plan]), /permission denied/, "only through delete_plan");
  await as(cofounder, "select public.delete_plan($1)", [plan]);
  assert.equal((await one("select count(*)::int n from public.plans where id = $1", [plan])).n, 0);

  // co-founders still can't reach admin-only things
  await assert.rejects(as(cofounder, "select billing_secret_enc from public.platform_settings"), /permission denied/);
  await assert.rejects(as(cofounder, "select public.platform_summary()"), /Not allowed/);
});

// ---- co-founders in admin sections (20261112000300_cofounder_admin_sections.sql)
test("a co-founder works the Inbox and extends subscriptions; view-only founders and strangers can't", async () => {
  const cof = await user("inboxcof"), vo = await user("inboxvo"), member = await user("asker");
  await as(admin, "insert into public.platform_viewers(email, can_manage, added_by) values ($1, true, $3), ($2, false, $3)", [`inboxcof${stamp}@founder.test`, `inboxvo${stamp}@founder.test`, admin]);
  assert.equal((await as(cof, "select public.is_platform_staff() s")).rows[0].s, true);
  assert.equal((await as(vo, "select public.is_platform_staff() s")).rows[0].s, false);

  const thread = (await one("insert into public.feedback_threads(user_id, subject) values ($1, 'Can I export to Excel?') returning id", [member])).id;
  assert.equal((await as(cof, "select count(*)::int n from public.feedback_threads where id = $1", [thread])).rows[0].n, 1, "co-founder reads the inbox");
  assert.equal((await as(vo, "select count(*)::int n from public.feedback_threads where id = $1", [thread])).rows[0].n, 0, "view-only doesn't");
  await as(cof, "select public.feedback_reply($1, 'Yes, from Reports → Export.')", [thread]);
  await as(cof, "select public.feedback_set_status($1, 'done')", [thread]);
  assert.equal((await one("select status from public.feedback_threads where id = $1", [thread])).status, "done");
  await assert.rejects(as(vo, "select public.feedback_set_status($1, 'open')", [thread]), /Not allowed/);
  await assert.rejects(as(stranger, "select public.feedback_set_status($1, 'open')", [thread]), /Not allowed/);

  await assert.rejects(as(vo, "select public.admin_extend_subscription(gen_random_uuid(), gen_random_uuid(), 'x', 0)"), /Not allowed/);
  // still no admin-only things: summary, keys
  await assert.rejects(as(cof, "select public.platform_summary()"), /Not allowed/);
  await assert.rejects(as(cof, "select billing_secret_enc from public.platform_settings"), /permission denied/);
});
