// TrackOja POS ↔ Usetally (docs/POS_CONNECT.md): linking, importing sales
// exactly once with TrackOja's totals, voids, and stock updates for paid invoices.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function run(role, userId, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || ""]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
const as = (u, sql, p) => run("authenticated", u, sql, p);
const svc = (sql, p) => run("service_role", "", sql, p);
const sha = (v) => createHash("sha256").update(v).digest("hex");

let owner, junior, outsider, biz, other, conn, storeId;
async function link(business, user, store = randomUUID()) {
  const code = randomBytes(32).toString("base64url");
  await as(user, "select public.pos_create_link_code($1, $2, 'Ikeja branch')", [business, sha(code)]);
  const key = "utpos_" + randomBytes(20).toString("hex");
  const r = (await svc("select public.pos_link($1, $2, 'enc', $3, $4, 'Ikeja branch', 'https://x.supabase.co/functions/v1') j",
    [sha(code), sha(key), key.slice(-4), store])).rows[0].j;
  return { id: r.connection_id, store, code, r };
}
const sale = (o = {}) => ({
  id: randomUUID(), number: "000128", created_at: "2026-10-28T19:40:00Z", currency: "NGN", store_name: "Ikeja branch", cashier: "Ada",
  customer: null,
  items: [{ product_id: "p-milk", name: "Peak Milk Tin 400g", details: "", quantity: 2, unit_price_minor: 320000, discount_minor: 0, tax_minor: 0 }],
  tax_minor: 0, total_minor: 640000,
  payments: [{ method: "cash", amount_minor: 640000, reference: "" }],
  ...o,
});
const importSale = (s, c = conn) => svc("select public.pos_import_sale($1, $2::jsonb) j", [c, JSON.stringify(s)]).then((r) => r.rows[0].j);

test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`pos-o${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`pos-j${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`pos-x${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Shop Ltd','Ada','NGN') id")).rows[0].id;
  other = (await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
});
test.after(() => pool.end());

test("only an owner or manager can start a link, and a code works once", async () => {
  await assert.rejects(as(junior, "select public.pos_create_link_code($1, $2, '')", [biz, sha("x")]), /owner or manager/);
  await assert.rejects(as(outsider, "select public.pos_create_link_code($1, $2, '')", [biz, sha("y")]), /owner or manager/);
  const l = await link(biz, owner);
  conn = l.id; storeId = l.store;
  assert.equal(l.r.business.currency, "NGN");
  await assert.rejects(svc("select public.pos_link($1, $2, 'enc', 'hint', $3, '', 'https://x.supabase.co/functions/v1')", [sha(l.code), sha("k2"), randomUUID()]), /POS400/);
});

test("browsers can't link or import, and never see the key columns", async () => {
  await assert.rejects(as(owner, "select public.pos_import_sale($1, '{}'::jsonb)", [conn]));
  await assert.rejects(as(owner, "select key_hash from public.pos_connections where id=$1", [conn]));
  assert.equal((await as(owner, "select store_name from public.pos_connections where id=$1", [conn])).rows[0].store_name, "Ikeja branch");
  assert.equal((await as(outsider, "select id from public.pos_connections where id=$1", [conn])).rowCount, 0);
});

test("a cash sale becomes a paid invoice with a receipt, exactly once", async () => {
  const s = sale();
  const a = await importSale(s);
  const b = await importSale(s);
  assert.equal(a.created, true); assert.equal(b.created, false);
  assert.equal(a.document_id, b.document_id);
  const d = await one("select * from public.documents where id=$1", [a.document_id]);
  assert.equal(d.status, "paid"); assert.equal(d.source, "pos"); assert.equal(d.source_ref, s.id);
  assert.equal(Number(d.total_minor), 640000); assert.equal(Number(d.amount_paid_minor), 640000);
  assert.equal(d.counted_toward_allowance, false);
  assert.equal((await one("select count(*)::int n from public.receipts where document_id=$1", [d.id])).n, 1);
  assert.equal((await one("select count(*)::int n from public.documents where business_id=$1 and source_ref=$2", [biz, s.id])).n, 1);
});

test("discounts, tax and a part on credit: the total is TrackOja's and the rest stays due", async () => {
  const s = sale({
    items: [
      { product_id: "p-a", name: "Rice 5kg", quantity: 1, unit_price_minor: 1000000, discount_minor: 50000, tax_minor: 71250 },
      { product_id: "p-b", name: "Bread", quantity: 3, unit_price_minor: 120000, discount_minor: 0, tax_minor: 0 },
    ],
    tax_minor: 71250, total_minor: 1000000 - 50000 + 71250 + 360000 - 1250,
    // what normalizeSale hands the database: card → pos, credit left out
    payments: [{ method: "pos", amount_minor: 1000000, reference: "MP123" }],
  });
  const r = await importSale(s);
  const d = await one("select * from public.documents where id=$1", [r.document_id]);
  assert.equal(Number(d.total_minor), s.total_minor);
  assert.equal(Number(d.tax_minor), 71250);
  assert.equal(Number(d.subtotal_minor) - Number(d.discount_minor) + Number(d.tax_minor), s.total_minor);
  assert.equal(d.status, "partially_paid");
  assert.equal(Number(d.total_minor) - Number(d.amount_paid_minor), 380000);
  assert.equal((await one("select method from public.payments where document_id=$1", [d.id])).method, "pos");
});

test("a named customer is matched by phone, or added once", async () => {
  const c = { name: "Mrs Bisi", phone: "0803 111 2222", email: "" };
  const a = await importSale(sale({ customer: c }));
  const b = await importSale(sale({ customer: { ...c, phone: "08031112222" } }));
  const ca = (await one("select customer_id from public.documents where id=$1", [a.document_id])).customer_id;
  const cb = (await one("select customer_id from public.documents where id=$1", [b.document_id])).customer_id;
  assert.ok(ca); assert.equal(ca, cb);
});

test("bad sales are refused with a POS422 and leave nothing behind", async () => {
  const s = sale({ currency: "USD" });
  await assert.rejects(importSale(s), /POS422/);
  await assert.rejects(importSale(sale({ total_minor: 9999999 })), /POS422/);
  await assert.rejects(importSale(sale({ payments: [{ method: "cash", amount_minor: 700000 }] })), /POS422/);
  assert.equal((await one("select count(*)::int n from public.pos_sales where external_id=$1", [s.id])).n, 0);
});

test("voiding a sale voids the invoice and removes its payments; twice is fine", async () => {
  const s = sale();
  const r = await importSale(s);
  const v1 = (await svc("select public.pos_void_sale($1, $2, 'customer returned it') j", [conn, s.id])).rows[0].j;
  const v2 = (await svc("select public.pos_void_sale($1, $2, '') j", [conn, s.id])).rows[0].j;
  assert.equal(v1.status, "void"); assert.equal(v2.status, "void");
  assert.equal((await one("select count(*)::int n from public.payments where document_id=$1", [r.document_id])).n, 0);
  assert.equal((await svc("select public.pos_void_sale($1, 'never-sent', '') j", [conn])).rows[0].j, null);
});

test("50 sales add up to the kobo", async () => {
  let expect = 0;
  const before = Number((await one("select coalesce(sum(amount_paid_minor),0) s from public.documents where business_id=$1 and source='pos' and status<>'void'", [biz])).s);
  for (let n = 1; n <= 50; n++) {
    const unit = 10000 + n * 137, qty = (n % 4) + 1, total = unit * qty;
    expect += total;
    await importSale(sale({ number: String(n), items: [{ product_id: `p-${n}`, name: `Item ${n}`, quantity: qty, unit_price_minor: unit }], total_minor: total, payments: [{ method: n % 2 ? "cash" : "bank_transfer", amount_minor: total }] }));
  }
  const after = Number((await one("select coalesce(sum(amount_paid_minor),0) s from public.documents where business_id=$1 and source='pos' and status<>'void'", [biz])).s);
  assert.equal(after - before, expect);
  const receipts = Number((await one("select coalesce(sum(p.amount_minor),0) s from public.payments p join public.documents d on d.id=p.document_id where d.business_id=$1 and d.source='pos' and d.title ~ '^POS sale #[0-9]+$' and d.status<>'void' and d.title <> 'POS sale #000128'", [biz])).s);
  assert.equal(receipts >= expect, true);
});

test("an invoice with TrackOja products queues one stock update when fully paid", async () => {
  const id = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Wholesale", customer: { name: "Kay" },
    items: [{ description: "Milk", quantity: 10, unit_price_minor: 300000, external_product_id: "p-milk" }, { description: "Delivery", quantity: 1, unit_price_minor: 500000 }] })])).rows[0].id;
  await as(owner, "select public.mark_document_sent($1)", [id]);
  await as(owner, "select public.record_manual_payment($1, 'cash', '', 1000000, null, null)", [id]).catch(async () => {
    await pool.query("select public.apply_payment($1, 'cash', '', 1000000, 'NGN', 'test', null, null, now())", [id]);
  });
  assert.equal((await one("select count(*)::int n from public.pos_stock_pushes where document_id=$1", [id])).n, 0);
  await pool.query("select public.apply_payment($1, 'cash', '', 2500000, 'NGN', 'test', null, null, now())", [id]);
  const push = await one("select * from public.pos_stock_pushes where document_id=$1", [id]);
  assert.equal(push.status, "pending");
  assert.deepEqual(push.lines, [{ product_id: "p-milk", quantity: 10 }]);
});

test("linking again replaces the old link; a revoked link can't import", async () => {
  const l2 = await link(biz, owner, storeId);
  await assert.rejects(importSale(sale(), conn), /POS401/);
  assert.equal((await importSale(sale(), l2.id)).created, true);
  await assert.rejects(as(junior, "select public.pos_revoke($1)", [l2.id]), /Not allowed/);
  await as(owner, "select public.pos_revoke($1)", [l2.id]);
  await assert.rejects(importSale(sale(), l2.id), /POS401/);
  // the other business is untouched
  assert.equal((await one("select count(*)::int n from public.pos_sales where business_id=$1", [other])).n, 0);
});
