// Paid features (20261102000200_plan_features.sql): the trial and paid plans
// get everything, Free gets nothing unless Admin → Plans ticks it, and the
// daily jobs skip repeating invoices and reminders for businesses without them.
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
async function svc(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
const ALL = ["ai_full", "auto_reminders", "scheduled_sending", "premium_templates", "whatsapp"];
let owner, outsider, biz, freePlans, settings;
const features = async (who = owner) => (await as(who, "select public.business_features($1) f", [biz])).rows[0].f;
const toFree = () => pool.query("update public.businesses set subscription_status='trialing', trial_documents_used=999 where id=$1", [biz]);

test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`pf-owner${Date.now()}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`pf-out${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('freelancer','Features Test','Ada','NGN') id")).rows[0].id;
  freePlans = (await pool.query("select id, features_included from public.plans where price_minor=0")).rows;
  settings = await one("select trial_mode, trial_documents from public.platform_settings where id");
  await pool.query("update public.platform_settings set trial_mode='documents', trial_documents=5");
});
test.after(async () => {
  for (const p of freePlans) await pool.query("update public.plans set features_included=$2 where id=$1", [p.id, p.features_included]);
  await pool.query("update public.platform_settings set trial_mode=$1, trial_documents=$2", [settings.trial_mode, settings.trial_documents]);
  await pool.end();
});

test("the trial has every paid feature; strangers see none", async () => {
  await pool.query("update public.businesses set subscription_status='trialing', trial_documents_used=0 where id=$1", [biz]);
  assert.deepEqual(await features(), ALL);
  assert.deepEqual(await features(outsider), []);
});

test("after the trial: Free has none, unless Admin ticks some on the Free plan", async () => {
  await toFree();
  assert.deepEqual(await features(), []);
  await pool.query("update public.plans set features_included='{auto_reminders}' where price_minor=0");
  assert.deepEqual(await features(), ["auto_reminders"]);
  await pool.query("update public.plans set features_included=null where price_minor=0");
});

test("a paid plan gets everything by default, or just what's ticked", async () => {
  const paid = await one("select id from public.plans where price_minor>0 and currency='NGN' limit 1");
  await pool.query("update public.businesses set subscription_status='active', plan_id=$2, current_period_end=now() + interval '10 days' where id=$1", [biz, paid.id]);
  assert.deepEqual(await features(), ALL);
  await pool.query("update public.plans set features_included='{premium_templates}' where id=$1", [paid.id]);
  assert.deepEqual(await features(), ["premium_templates"]);
  await pool.query("update public.plans set features_included=null where id=$1", [paid.id]);
  // the paid period ran out: back to Free
  await pool.query("update public.businesses set current_period_end=now() - interval '1 day' where id=$1", [biz]);
  assert.deepEqual(await features(), []);
});

test("repeating invoices pause on Free: the period is skipped, not saved up", async () => {
  await pool.query("update public.businesses set subscription_status='trialing', trial_documents_used=0 where id=$1", [biz]);
  const doc = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Repeat Co" }, items: [{ description: "Retainer", quantity: 1, unit_price_minor: 100000 }] })])).rows[0].id;
  await pool.query("update public.documents set status='sent', recur_interval='monthly', recur_next_on='2026-03-15', recur_day=15 where id=$1", [doc]);
  await toFree();
  const skipped = (await svc("select * from public.run_due_recurrences('2026-03-15')")).rows.filter((r) => r.source_id === doc);
  assert.equal(skipped.length, 1); assert.equal(skipped[0].new_id, null);
  assert.equal((await one("select count(*)::int n from public.documents where recur_source_id=$1", [doc])).n, 0);
  assert.equal((await one("select recur_next_on::text d from public.documents where id=$1", [doc])).d, "2026-04-15");
  // upgraded (back on the trial here): the next period is made as usual
  await pool.query("update public.businesses set trial_documents_used=0 where id=$1", [biz]);
  const made = (await svc("select * from public.run_due_recurrences('2026-04-15')")).rows.filter((r) => r.source_id === doc);
  assert.ok(made[0].new_id);
});

test("automatic reminders pause on Free", async () => {
  await pool.query("update public.businesses set subscription_status='trialing', trial_documents_used=0, reminders_enabled=true where id=$1", [biz]);
  const doc = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Late Co", email: "late@co.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })])).rows[0].id;
  await pool.query("update public.documents set status='sent', customer_email='late@co.test', due_date=current_date - 1 where id=$1", [doc]);
  const due = async () => (await svc("select * from public.due_reminders(current_date, 1000)")).rows.filter((r) => r.document_id === doc);
  assert.ok((await due()).length > 0);
  await toFree();
  assert.equal((await due()).length, 0);
});
