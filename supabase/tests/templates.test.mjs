// Document templates: defaults, frozen branding, and who may change a layout.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function as(userId, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = (await c.query(sql, params)).rows[0];
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

let owner, junior, biz, docId;
const body = JSON.stringify({ kind: "invoice", title: "Job", customer: { name: "Kay", email: "kay@c.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] });
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`tpl-owner${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`tpl-jr${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Brand One','Ada','USD') id")).id;
  await pool.query("update public.businesses set country='United States', subscription_status='active', current_period_end=now()+interval '30 days', onboarded_at=now() where id=$1", [biz]);
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
  docId = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, body])).id;
});
test.after(() => pool.end());

test("new documents get the business default (Letter in the US) and no frozen branding yet", async () => {
  const d = await one("select template, paper, snapshot from public.documents where id=$1", [docId]);
  assert.equal(d.template, "signature");
  assert.equal(d.paper, "letter");
  assert.equal(d.snapshot, null);
});

test("saved defaults apply to new documents", async () => {
  await as(owner, `update public.businesses set document_prefs = '{"invoice":{"template":"executive","paper":"a4"}}'::jsonb where id=$1`, [biz]);
  const id = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, body])).id;
  const d = await one("select template, paper from public.documents where id=$1", [id]);
  assert.deepEqual([d.template, d.paper], ["executive", "a4"]);
});

test("sending freezes branding; later changes don't alter the issued document", async () => {
  await as(owner, "select public.mark_document_sent($1)", [docId]);
  await pool.query("update public.businesses set name='Brand Two', bank_account_number='999' where id=$1", [biz]);
  const d = await one("select snapshot from public.documents where id=$1", [docId]);
  assert.equal(d.snapshot.name, "Brand One");
  assert.equal(d.snapshot.bank_account_number, "");
});

test("layout changes: valid combos only; juniors can't restyle issued documents; changes are logged", async () => {
  await assert.rejects(as(owner, "select public.set_document_layout($1,'pos','a4','{}'::jsonb,'')", [docId]), /not available/);
  await assert.rejects(as(junior, "select public.set_document_layout($1,'essential','a5','{}'::jsonb,'')", [docId]), /Only people who can send/);
  await as(owner, `select public.set_document_layout($1,'essential','a5','{"sections":{"notes":false}}'::jsonb,'Pay within 7 days')`, [docId]);
  const d = await one("select template, paper, layout, payment_instructions, total_minor, snapshot->>'name' n from public.documents where id=$1", [docId]);
  assert.deepEqual([d.template, d.paper, d.payment_instructions, d.n, Number(d.total_minor)], ["essential", "a5", "Pay within 7 days", "Brand One", 100000]);
  assert.equal(d.layout.sections.notes, false);
  const log = await one("select count(*) n from public.activity where document_id=$1 and action='document.layout_changed'", [docId]);
  assert.equal(Number(log.n), 1);
});

test("receipts take the receipt default (half letter in the US)", async () => {
  const rid = (await as(owner, "select public.record_manual_payment($1,'bank_transfer','REF1',50000,'',current_date) id", [docId])).id;
  const r = await one("select r.template, r.paper from public.receipts r join public.payments p on p.id = r.payment_id where r.document_id=$1", [docId]);
  assert.deepEqual([r.template, r.paper], ["signature", "half"]);
  assert.ok(rid);
});
