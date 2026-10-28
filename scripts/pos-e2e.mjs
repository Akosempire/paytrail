// LOCAL ONLY. End-to-end check of the TrackOja → Usetally sale path on two
// throwaway databases: real TrackOja sales (create_sale) → the payload TrackOja
// queues → Usetally's checks (normalizeSale) → pos_import_sale. Then the totals
// on both sides must match to the kobo.
//
//   bash scripts/test-db.sh                         # builds pt_test (Usetally)
//   (cd ../trackoja-phase-1 && bash scripts/test-db.sh)   # builds tk_test (TrackOja)
//   node --import ./tests/register.mjs scripts/pos-e2e.mjs [count]
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { normalizeSale } from "../lib/pos-core.js";

const N = Number(process.argv[2] || 50);
const base = { host: process.env.PGHOST || "/tmp", port: Number(process.env.PGPORT || 54322), user: process.env.PGUSER || "postgres" };
const tk = new pg.Pool({ ...base, database: "tk_test" });
const pt = new pg.Pool({ ...base, database: "pt_test" });
const sha = (v) => createHash("sha256").update(v).digest("hex");

async function as(pool, role, user, sql, p = []) {
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

// ---- Usetally: a business and its link ----
const ptOwner = (await pt.query("insert into auth.users(email) values ($1) returning id", [`e2e-${Date.now()}@u.test`])).rows[0].id;
const biz = (await as(pt, "authenticated", ptOwner, "select public.create_business('company','E2E Shop Ltd','Ada','NGN') id")).rows[0].id;
const code = randomBytes(32).toString("base64url");
await as(pt, "authenticated", ptOwner, "select public.pos_create_link_code($1, $2, 'Ikeja branch')", [biz, sha(code)]);

// ---- TrackOja: a store with products, linked ----
const tkOwner = (await tk.query("insert into auth.users(email) values ($1) returning id", [`e2e-${Date.now()}@t.test`])).rows[0].id;
const store = (await as(tk, "authenticated", tkOwner, "select public.create_onboarding_business('E2E Shop', 'Ikeja branch', 'general_retail') j")).rows[0].j.store_id;
await tk.query("update public.organizations set billing_status='active' where id=(select org_id from public.stores where id=$1)", [store]);
const key = "utpos_" + randomBytes(20).toString("hex");
const conn = (await as(pt, "service_role", "", "select public.pos_link($1,$2,'enc','hint',$3,'Ikeja branch','https://x.supabase.co/functions/v1') j", [sha(code), sha(key), store])).rows[0].j.connection_id;
await tk.query("select public.usetally_save_link($1, $2, 'E2E Shop Ltd', 'NGN', $3, 'enc', 'hint', null)", [store, biz, sha(key)]);
const products = [];
for (const [name, price, tax] of [["Peak Milk Tin 400g", 3200, 0], ["Rice 5kg", 9850.5, 7.5], ["Agege Bread", 1200, 0], ["Indomie carton", 12999.99, 7.5], ["Beef per kg", 4800, 0]]) {
  products.push((await tk.query("insert into public.products(store_id,name,sku,selling_price,tax_rate,stock_qty,created_by) values ($1,$2,$3,$4,$5,10000,$6) returning id",
    [store, name, name.slice(0, 3).toUpperCase() + products.length, price, tax, tkOwner])).rows[0].id);
}

const credCustomer = (await tk.query("insert into public.customers(store_id, name, phone, credit_limit, created_by) values ($1, 'Mama Nkechi', '08035550000', 100000000, $2) returning id", [store, tkOwner])).rows[0].id;

// ---- 50 varied sales ----
const methods = ["cash", "transfer", "card"];
for (let n = 0; n < N; n++) {
  const lines = [];
  for (let k = 0; k <= n % 3; k++) {
    const pi = (n + k * 2) % products.length;
    lines.push({ productId: products[pi], quantity: pi === 4 ? 1.375 + (n % 3) : 1 + ((n + k) % 4), discountAmount: n % 7 === 0 ? 150 : 0 });
  }
  // what TrackOja would charge, to choose payments
  const quote = await tk.query("select coalesce(sum(round((p.selling_price * l.q - l.d) * (1 + p.tax_rate/100), 2)), 0) t from jsonb_to_recordset($1::jsonb) l(\"productId\" uuid, q numeric, d numeric) join public.products p on p.id = l.\"productId\"",
    [JSON.stringify(lines.map((l) => ({ productId: l.productId, q: l.quantity, d: l.discountAmount })))]);
  const approx = Number(quote.rows[0].t) - (n % 5 === 0 ? 200 : 0);
  const method = methods[n % 3];
  let payments;
  const credit = n % 9 === 4;
  if (credit) payments = [{ method: "cash", amount: Math.floor(approx / 2), verificationStatus: "verified" }, { method: "credit", amount: Math.ceil(approx * 1.02) + 100 - Math.floor(approx / 2), verificationStatus: "verified" }];
  else if (method === "cash") payments = [{ method: "cash", amount: Math.ceil(approx * 1.02 / 1000) * 1000 + 1000, verificationStatus: "verified" }];
  else payments = [{ method, amount: Math.ceil(approx * 1.02) + 100, reference: `REF${n}`, verificationStatus: "verified" }];
  const id = (await as(tk, "authenticated", tkOwner, "select (public.create_sale($1,$2::jsonb,$3::jsonb,$4,$5,$6,null,$7)).id", [
    store, JSON.stringify(lines), JSON.stringify(payments), n % 4 === 0 ? `Customer ${n % 8}` : null, n % 4 === 0 ? `0803000${String(n % 8).padStart(4, "0")}` : null, n % 5 === 0 ? 200 : 0,
    credit ? credCustomer : null,
  ]).catch((e) => { throw new Error(`sale ${n}: ${e.message}`); })).rows[0].id;
  if (n % 17 === 16) await as(tk, "authenticated", tkOwner, "select public.void_sale($1, 'returned')", [id]);
}

// ---- deliver the outbox the way usetally-sync does ----
// a void is only handed out once its sale was delivered, so claim until empty
let sent = 0, voids = 0;
for (let pass = 0; pass < 5; pass++) {
  const rows = (await tk.query("select * from public.usetally_claim_outbox($1, 500)", [store])).rows;
  if (!rows.length) break;
  for (const row of rows) {
    if (row.kind === "sale") {
      const v = normalizeSale(row.payload, { currency: "NGN" });
      assert.ok(v.ok, `sale ${row.payload.number} refused: ${v.error}`);
      await as(pt, "service_role", "", "select public.pos_import_sale($1,$2::jsonb)", [conn, JSON.stringify(v.sale)]);
      sent++;
    } else {
      await as(pt, "service_role", "", "select public.pos_void_sale($1,$2,$3)", [conn, row.sale_id, row.payload.reason]);
      voids++;
    }
    await tk.query("select public.usetally_record_outbox_result($1, 'sent', null, null, null)", [row.id]);
  }
}

// ---- both sides must agree ----
const t = (await tk.query("select count(*)::int n, sum(round(total*100))::bigint total, sum(round(tax_total*100))::bigint tax from public.sales where store_id=$1 and status='completed'", [store])).rows[0];
const tkPaid = (await tk.query("select coalesce(sum(round(sp.amount*100)),0)::bigint - coalesce((select sum(round(change_due*100)) from public.sales where store_id=$1 and status='completed'),0)::bigint paid from public.sale_payments sp join public.sales s on s.id=sp.sale_id where s.store_id=$1 and s.status='completed' and sp.method<>'credit' and sp.verification_status<>'rejected'", [store])).rows[0];
const u = (await pt.query("select count(*)::int n, sum(total_minor)::bigint total, sum(tax_minor)::bigint tax, sum(amount_paid_minor)::bigint paid from public.documents where business_id=$1 and source='pos' and status<>'void'", [biz])).rows[0];
const receipts = (await pt.query("select coalesce(sum(p.amount_minor),0)::bigint s from public.payments p join public.documents d on d.id=p.document_id where d.business_id=$1 and d.source='pos' and d.status<>'void'", [biz])).rows[0].s;

console.log(`TrackOja: ${t.n} completed sales, total ${t.total}, tax ${t.tax}, taken ${tkPaid.paid} (kobo)`);
console.log(`Usetally: ${u.n} POS invoices,   total ${u.total}, tax ${u.tax}, paid ${u.paid}, receipts ${receipts} (kobo)`);
console.log(`delivered ${sent} sales and ${voids} voids`);
assert.equal(u.n, t.n, "invoice count");
assert.equal(String(u.total), String(t.total), "totals");
assert.equal(String(u.tax), String(t.tax), "tax");
assert.equal(String(u.paid), String(tkPaid.paid), "money taken");
assert.equal(String(receipts), String(tkPaid.paid), "receipts");
console.log("OK: both sides match to the kobo");
await tk.end(); await pt.end();
