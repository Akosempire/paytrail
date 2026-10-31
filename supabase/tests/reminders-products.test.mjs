// Invoice reminders (due exactly once, only unpaid invoices with an email) and
// the products catalogue (members read, only finance roles edit, no leaks).
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, p = []) => (await pool.query(sql, p)).rows[0];
async function run(role, user, sql, p = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user || ""]);
    const r = await c.query(sql, p);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
const as = (u, sql, p) => run("authenticated", u, sql, p);
const svc = (sql, p) => run("service_role", "", sql, p);

let owner, junior, outsider, biz, other;
const invoice = async (o = {}) => {
  const id = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Job",
    customer: { name: "Ade Foods", email: o.email ?? "ade@foods.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })])).rows[0].id;
  if (o.sent !== false) await as(owner, "select public.mark_document_sent($1)", [id]);
  if (o.due) await pool.query("update public.documents set due_date = $2 where id = $1", [id, o.due]);
  return id;
};
const due = (asOf) => svc("select * from public.due_reminders($1::date, 500)", [asOf]).then((r) => r.rows);

test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`rp-o${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`rp-j${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`rp-x${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Reminders Ltd','Ada','NGN') id")).rows[0].id;
  other = (await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
});
test.after(() => pool.end());

test("every new business gets three default reminder rules", async () => {
  const rules = (await as(owner, "select offset_days from public.reminder_rules where business_id=$1 order by offset_days", [biz])).rows.map((r) => r.offset_days);
  assert.deepEqual(rules, [-3, 0, 7]);
});

test("a rule is due on its day, catches up for 3 days, and only once", async () => {
  const id = await invoice({ due: "2026-11-14" });
  const before = (await due("2026-11-11")).filter((r) => r.document_id === id);
  assert.deepEqual(before.map((r) => r.offset_days), [-3]);
  assert.equal((await due("2026-11-10")).filter((r) => r.document_id === id).length, 0);
  assert.equal((await due("2026-11-16")).filter((r) => r.document_id === id && r.offset_days === -3).length, 0, "too late to catch up the 3-days-before reminder");
  const rule = before[0].rule_id;
  await svc("insert into public.reminder_log(document_id, rule_id, business_id) values ($1,$2,$3)", [id, rule, biz]);
  assert.equal((await due("2026-11-11")).filter((r) => r.document_id === id).length, 0);
  await assert.rejects(svc("insert into public.reminder_log(document_id, rule_id, business_id) values ($1,$2,$3)", [id, rule, biz]));
  assert.deepEqual((await due("2026-11-21")).filter((r) => r.document_id === id).map((r) => r.offset_days), [7]);
});

test("drafts, paid invoices, invoices without an email and switched-off rules are skipped", async () => {
  const draft = await invoice({ sent: false, due: "2026-11-14" });
  const noEmail = await invoice({ email: "", due: "2026-11-14" });
  const paid = await invoice({ due: "2026-11-14" });
  await pool.query("select public.apply_payment($1, 'cash', '', 100000, 'NGN', 'test', null, null, now())", [paid]);
  const ids = (await due("2026-11-14")).map((r) => r.document_id);
  for (const id of [draft, noEmail, paid]) assert.equal(ids.includes(id), false);
  const live = await invoice({ due: "2026-11-14" });
  await as(owner, "update public.reminder_rules set enabled=false where business_id=$1 and offset_days=0", [biz]);
  assert.equal((await due("2026-11-14")).some((r) => r.document_id === live && r.offset_days === 0), false);
  await as(owner, "update public.businesses set reminders_enabled=false where id=$1", [biz]);
  assert.equal((await due("2026-11-21")).some((r) => r.business_id === biz), false);
  await as(owner, "update public.businesses set reminders_enabled=true where id=$1", [biz]);
});

test("only owners and managers change reminder rules; nobody calls due_reminders from the browser", async () => {
  const r = await as(junior, "update public.reminder_rules set subject='hacked' where business_id=$1 returning id", [biz]);
  assert.equal(r.rowCount, 0);
  assert.equal((await as(outsider, "select id from public.reminder_rules where business_id=$1", [biz])).rowCount, 0);
  await assert.rejects(as(owner, "select * from public.due_reminders()"));
  await assert.rejects(as(owner, "insert into public.reminder_log(document_id, rule_id, business_id) select d.id, r.id, d.business_id from public.documents d, public.reminder_rules r where d.business_id=$1 and r.business_id=$1 limit 1", [biz]));
});

test("products: members read, finance edits, other businesses see nothing", async () => {
  const p = (await as(owner, "insert into public.products(business_id, name, unit, unit_price_minor) values ($1, 'Logo design', 'job', 15000000) returning id", [biz])).rows[0].id;
  assert.equal((await as(junior, "select id from public.products where id=$1", [p])).rowCount, 1);
  assert.equal((await as(junior, "update public.products set unit_price_minor=1 where id=$1 returning id", [p])).rowCount, 0);
  await assert.rejects(as(junior, "insert into public.products(business_id, name) values ($1, 'x')", [biz]));
  assert.equal((await as(outsider, "select id from public.products where id=$1", [p])).rowCount, 0);
  await assert.rejects(as(outsider, "insert into public.products(business_id, name) values ($1, 'x')", [biz]));
  assert.equal((await as(outsider, "select id from public.products where business_id=$1", [other])).rowCount, 0);
});
