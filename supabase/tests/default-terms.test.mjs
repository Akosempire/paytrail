// Default terms land on every quote and invoice being prepared, however it's made.
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
const TERMS = "50% deposit to start.\nBalance on delivery.";
const save = (payload, id = null) => as(owner, "select public.save_document($1, $2, $3::jsonb) id", [biz, id, JSON.stringify({ customer: { name: "Terms Co" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 1000 }], ...payload })]).then((r) => r.rows[0].id);
const termsOf = async (id) => (await one("select terms from public.documents where id=$1", [id])).terms;

test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`terms${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('freelancer','Terms Test','Ada','NGN') id")).rows[0].id;
  await pool.query("update public.businesses set default_terms=$2 where id=$1", [biz, TERMS]);
});
test.after(() => pool.end());

test("a new invoice saved with blank terms gets the default", async () => {
  const id = await save({ kind: "invoice", terms: "" });
  assert.equal(await termsOf(id), TERMS);
});

test("your own terms are kept; clearing them on a draft brings the default back", async () => {
  const id = await save({ kind: "quote", terms: "Valid for 7 days." });
  assert.equal(await termsOf(id), "Valid for 7 days.");
  await save({ terms: "   " }, id);
  assert.equal(await termsOf(id), TERMS);
});

test("a quote turned into an invoice keeps getting terms", async () => {
  const q = await save({ kind: "quote" });
  await pool.query("update public.documents set terms='' , status='accepted' where id=$1", [q]); // an old quote with none
  const inv = (await as(owner, "select public.convert_quote_to_invoice($1) id", [q])).rows[0].id;
  assert.equal(await termsOf(inv), TERMS);
});

test("sent documents and POS sales are left alone", async () => {
  const id = await save({ kind: "invoice", terms: "Pay in 3 days." });
  await pool.query("update public.documents set status='sent' where id=$1", [id]);
  await pool.query("update public.documents set terms='' where id=$1", [id]);
  assert.equal(await termsOf(id), "");
  const pos = (await one("insert into public.documents(business_id, kind, number, customer_name, status, source, terms, currency) values ($1, 'invoice', 'POS-T1', 'Walk-in', 'sent', 'pos', '', 'NGN') returning id", [biz])).id;
  assert.equal(await termsOf(pos), "");
});
