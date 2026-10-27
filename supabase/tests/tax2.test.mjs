// Two taxes on one document (Canada: GST + PST / QST), rates with three
// decimals, and the second tax carried from a quote to its invoice.
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
const save = async (doc, payload) => (await as(owner, "select public.save_document($1, $2, $3::jsonb) id", [biz, doc, JSON.stringify(payload)])).rows[0].id;
const totals = (id) => one("select subtotal_minor::int s, tax_minor::int t, tax2_minor::int t2, total_minor::int total, tax_label, tax_rate::float r, tax2_label, tax2_rate::float r2 from public.documents where id=$1", [id]);
const ITEMS = [{ description: "Website", quantity: 1, unit_price_minor: 10000 }];

let owner, biz;
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`t2${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Maple Co','Ada','CAD') id")).rows[0].id;
  await pool.query("update public.businesses set country='Canada', region='BC', tax_label='GST', tax_rate=5, tax2_label='PST', tax2_rate=7 where id=$1", [biz]);
});
test.after(() => pool.end());

test("GST + PST: each worked out on the price, shown separately, added to the total", async () => {
  const id = await save(null, { kind: "invoice", items: ITEMS });
  const d = await totals(id);
  assert.deepEqual([d.s, d.t, d.t2, d.total], [10000, 1200, 700, 11200]); // tax_minor is both taxes
  assert.deepEqual([d.tax_label, d.r, d.tax2_label, d.r2], ["GST", 5, "PST", 7]);
});

test("QST at 9.975% keeps three decimals; prices that include tax split by rate", async () => {
  const id = await save(null, { kind: "invoice", tax_label: "GST", tax_rate: 5, tax2_label: "QST", tax2_rate: 9.975, items: ITEMS });
  let d = await totals(id);
  assert.equal(d.r2, 9.975);
  assert.deepEqual([d.t - d.t2, d.t2, d.total], [500, 998, 11498]); // 9,975 cents of QST rounds to 998
  await save(id, { prices_include_vat: true });
  d = await totals(id);
  assert.equal(d.total, 10000);
  assert.equal(d.t, Math.round(10000 * 14.975 / 114.975));
  assert.equal(d.t2, Math.round(d.t * 9.975 / 14.975));
});

test("one tax only (UK VAT 20%) behaves as before", async () => {
  const id = await save(null, { kind: "invoice", tax_label: "VAT", tax_rate: 20, tax2_label: "", tax2_rate: 0, items: ITEMS });
  const d = await totals(id);
  assert.deepEqual([d.t, d.t2, d.total], [2000, 0, 12000]);
});

test("an invoice made from a quote keeps the second tax", async () => {
  const q = await save(null, { kind: "quote", tax2_label: "PST", tax2_rate: 6, items: ITEMS });
  await pool.query("update public.documents set status='sent' where id=$1", [q]);
  const inv = (await as(owner, "select public.convert_quote_to_invoice($1) id", [q])).rows[0].id;
  const d = await totals(inv);
  assert.deepEqual([d.tax2_label, d.r2, d.t2, d.total], ["PST", 6, 600, 11100]);
});
