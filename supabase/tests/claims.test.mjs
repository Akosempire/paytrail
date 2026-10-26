// "I've sent it": a customer tells the business about a bank transfer; only the
// team can confirm it, and confirming records one payment and one receipt.
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
// the server calls submit_payment_claim with the service role
async function asService(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
const claim = (token, amount, payer = "Kay") => asService("select public.submit_payment_claim($1, $2, $3, current_date, 'paid from GTBank', null) id", [token, amount, payer]);

let owner, junior, outsider, biz, docId, token;
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`c-owner${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`c-jr${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`c-out${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Claims Ltd','Ada','NGN') id")).rows[0].id;
  await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id");
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
  docId = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Job", customer: { name: "Kay", email: "kay@c.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })])).rows[0].id;
  token = (await one("select access_token from public.documents where id=$1", [docId])).access_token;
});
test.after(() => pool.end());

test("a draft's link can't be used to claim a payment", async () => {
  await assert.rejects(claim(token, 1000), /could not be found/);
  await as(owner, "select public.mark_document_sent($1)", [docId]);
});

test("the customer can't claim more than the balance, or with a wrong link", async () => {
  await assert.rejects(claim(token, 100001), /more than the balance/);
  await assert.rejects(claim("f".repeat(48), 1000), /could not be found/);
  await assert.rejects(claim(token, 0), /amount/);
});

test("customers can't call it directly; only the server can", async () => {
  await assert.rejects(as(outsider, "select public.submit_payment_claim($1, 1000, 'x', current_date, '', null)", [token]));
});

test("the team sees the claim; other businesses don't; nothing is paid yet", async () => {
  const id = (await claim(token, 40000)).rows[0].id;
  assert.equal((await as(owner, "select id from public.payment_claims where id=$1", [id])).rowCount, 1);
  assert.equal((await as(outsider, "select id from public.payment_claims where id=$1", [id])).rowCount, 0);
  assert.equal(Number((await one("select amount_paid_minor from public.documents where id=$1", [docId])).amount_paid_minor), 0);
  assert.equal((await one("select count(*)::int n from public.activity where document_id=$1 and action='payment.claimed'", [docId])).n, 1);
});

test("junior finance and outsiders can't confirm", async () => {
  const id = (await one("select id from public.payment_claims where document_id=$1 and status='pending' limit 1", [docId])).id;
  await assert.rejects(as(junior, "select public.confirm_payment_claim($1)", [id]), /Not allowed/);
  await assert.rejects(as(outsider, "select public.confirm_payment_claim($1)", [id]), /Not allowed/);
});

test("confirming records one payment and one receipt, even if pressed twice", async () => {
  const id = (await one("select id from public.payment_claims where document_id=$1 and status='pending' limit 1", [docId])).id;
  const p1 = (await as(owner, "select public.confirm_payment_claim($1) p", [id])).rows[0].p;
  const p2 = (await as(owner, "select public.confirm_payment_claim($1) p", [id])).rows[0].p;
  assert.equal(p1, p2);
  const d = await one("select status, amount_paid_minor from public.documents where id=$1", [docId]);
  assert.equal(d.status, "partially_paid");
  assert.equal(Number(d.amount_paid_minor), 40000);
  assert.equal((await one("select count(*)::int n from public.receipts where document_id=$1", [docId])).n, 1);
  assert.equal((await one("select status from public.payment_claims where id=$1", [id])).status, "confirmed");
});

test("marking as not received keeps the balance and saves the reason", async () => {
  const id = (await claim(token, 60000)).rows[0].id;
  await as(owner, "select public.reject_payment_claim($1, 'Not in our account yet')", [id]);
  const c = await one("select status, reply from public.payment_claims where id=$1", [id]);
  assert.equal(c.status, "rejected");
  assert.equal(c.reply, "Not in our account yet");
  await assert.rejects(as(owner, "select public.confirm_payment_claim($1)", [id]), /not received/);
  assert.equal(Number((await one("select amount_paid_minor from public.documents where id=$1", [docId])).amount_paid_minor), 40000);
});

test("at most three waiting claims per invoice", async () => {
  for (let i = 0; i < 3; i++) await claim(token, 1000);
  await assert.rejects(claim(token, 1000), /already told them/);
});
