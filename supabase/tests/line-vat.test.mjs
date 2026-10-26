// VAT per line: only standard-rated lines carry VAT, after their share of the
// discount; VAT-inclusive prices keep the total and show the VAT inside it;
// an invoice made from a quote keeps both.
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
const save = (payload, id = null) => as(owner, "select public.save_document($1, $2, $3::jsonb) id", [biz, id, JSON.stringify(payload)]).then((r) => r.rows[0].id);
const totals = (id) => one("select subtotal_minor::int sub, discount_minor::int disc, tax_minor::int tax, total_minor::int total, prices_include_vat inc from public.documents where id=$1", [id]);
const items = [
  { description: "Design", quantity: 1, unit_price_minor: 100000, vat_category: "standard" },
  { description: "Export shipping", quantity: 1, unit_price_minor: 50000, vat_category: "zero" },
  { description: "Training", quantity: 1, unit_price_minor: 50000, vat_category: "exempt" },
];
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`v-owner${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','VAT Ltd','Ada','NGN') id")).rows[0].id;
});
test.after(() => pool.end());

test("VAT only on standard-rated lines", async () => {
  const id = await save({ kind: "invoice", customer: { name: "Kay" }, tax_rate: 7.5, items });
  assert.deepEqual(await totals(id), { sub: 200000, disc: 0, tax: 7500, total: 207500, inc: false });
  const cats = (await pool.query("select vat_category from public.document_items where document_id=$1 order by sort_order", [id])).rows.map((r) => r.vat_category);
  assert.deepEqual(cats, ["standard", "zero", "exempt"]);
});

test("the discount is shared across lines before VAT", async () => {
  // ₦200,000 of lines, ₦20,000 off: the standard line's share is ₦10,000, so VAT on ₦90,000
  const id = await save({ kind: "invoice", customer: { name: "Kay" }, tax_rate: 7.5, discount_minor: 20000, items });
  assert.deepEqual(await totals(id), { sub: 200000, disc: 20000, tax: 6750, total: 186750, inc: false });
});

test("VAT-inclusive prices keep the total; the VAT is the part inside", async () => {
  const id = await save({ kind: "invoice", customer: { name: "Kay" }, tax_rate: 7.5, prices_include_vat: true, items: [{ description: "Design", quantity: 1, unit_price_minor: 107500 }] });
  assert.deepEqual(await totals(id), { sub: 107500, disc: 0, tax: 7500, total: 107500, inc: true });
});

test("lines saved the old way are standard-rated, and totals are unchanged", async () => {
  const id = await save({ kind: "invoice", customer: { name: "Kay" }, tax_rate: 7.5, items: [{ description: "Old", quantity: 2, unit_price_minor: 50000 }] });
  assert.deepEqual(await totals(id), { sub: 100000, disc: 0, tax: 7500, total: 107500, inc: false });
});

test("an invoice made from a quote keeps the VAT setup", async () => {
  const q = await save({ kind: "quote", customer: { name: "Kay" }, tax_rate: 7.5, prices_include_vat: true, items });
  await as(owner, "select public.mark_document_sent($1)", [q]);
  const inv = (await as(owner, "select public.convert_quote_to_invoice($1) id", [q])).rows[0].id;
  const cats = (await pool.query("select vat_category from public.document_items where document_id=$1 order by sort_order", [inv])).rows.map((r) => r.vat_category);
  assert.deepEqual(cats, ["standard", "zero", "exempt"]);
  assert.deepEqual(await totals(inv), await totals(q));
});
