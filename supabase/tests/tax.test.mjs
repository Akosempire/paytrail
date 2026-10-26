// Tax: the customer's TIN follows them onto drafts and is kept once sent;
// a payment with withholding tax settles the invoice once, with the WHT shown.
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

let owner, junior, biz, customer, docId;
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`t-owner${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`t-jr${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Tax Ltd','Ada','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
  customer = (await as(owner, "insert into public.customers(business_id,name,tax_id) values ($1,'Kay Ltd','12345678-0001') returning id", [biz])).rows[0].id;
  // ₦1,000 + 7.5% VAT = ₦1,075
  docId = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Job", customer_id: customer, tax_rate: 7.5, tax_label: "VAT", items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })])).rows[0].id;
});
test.after(() => pool.end());

test("a draft picks up the customer's TIN", async () => {
  assert.equal((await one("select customer_tax_id from public.documents where id=$1", [docId])).customer_tax_id, "12345678-0001");
});

test("once sent, the invoice keeps the TIN it was sent with", async () => {
  await as(owner, "select public.mark_document_sent($1)", [docId]);
  await as(owner, "update public.customers set tax_id='99999999-0001' where id=$1", [customer]);
  await as(owner, "update public.documents set updated_at=now() where id=$1", [docId]);
  assert.equal((await one("select customer_tax_id from public.documents where id=$1", [docId])).customer_tax_id, "12345678-0001");
});

test("junior finance can't record payments", async () => {
  await assert.rejects(as(junior, "select public.record_payment_with_wht($1,'bank_transfer','',100000,5000,'',null)", [docId]), /Not allowed/);
});

test("can't record more than the balance, cash plus WHT", async () => {
  await assert.rejects(as(owner, "select public.record_payment_with_wht($1,'bank_transfer','',103000,5000,'',null)", [docId]), /more than the balance/);
});

test("cash plus WHT settles the invoice, with the WHT on the payment and receipt", async () => {
  // 5% WHT on the ₦1,000 before VAT = ₦50; the customer transfers ₦1,025
  const pay = (await as(owner, "select public.record_payment_with_wht($1,'bank_transfer','TRF1',102500,5000,'',current_date) p", [docId])).rows[0].p;
  const d = await one("select status, amount_paid_minor from public.documents where id=$1", [docId]);
  assert.equal(d.status, "paid");
  assert.equal(Number(d.amount_paid_minor), 107500);
  const p = await one("select amount_minor, wht_minor from public.payments where id=$1", [pay]);
  assert.equal(Number(p.amount_minor), 107500);
  assert.equal(Number(p.wht_minor), 5000);
  assert.equal(Number((await one("select wht_minor from public.receipts where payment_id=$1", [pay])).wht_minor), 5000);
});
