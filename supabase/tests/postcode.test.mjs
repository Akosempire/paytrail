// Postcodes on customers and documents, and the delivery address.
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
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`pc${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Postcode Ltd','Ada','NGN') id")).rows[0].id;
});
test.after(() => pool.end());

test("clean_postcode normalises or empties", async () => {
  const r = (await pool.query("select public.clean_postcode('ek 01 a03 fk 01') a, public.clean_postcode('EK-00-A03-FK-01') b, public.clean_postcode('') c, public.clean_postcode(null) d")).rows[0];
  assert.deepEqual(r, { a: "EK-01-A03-FK-01", b: "", c: "", d: "" });
});

test("a new customer's postcode and the delivery address are saved; the postcode is copied to the draft", async () => {
  const payload = { kind: "invoice", customer: { name: "Chioma", postcode: "la01b22kt05", postcode_area: "Ikeja, Lagos", postcode_verified: true },
    delivery: { address: "Plot 4, Admiralty Way", postcode: "LA-02-C11-LK-09", postcode_area: "Lekki, Lagos", contact: "Tunde 0803 000 0000" },
    items: [{ description: "Rice 50kg", quantity: 2, unit_price_minor: 4500000 }] };
  const id = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify(payload)])).rows[0].id;
  const d = await one("select customer_postcode, delivery_address, delivery_postcode, delivery_postcode_area, delivery_contact, customer_id from public.documents where id=$1", [id]);
  assert.equal(d.customer_postcode, "LA-01-B22-KT-05");
  assert.equal(d.delivery_postcode, "LA-02-C11-LK-09");
  assert.equal(d.delivery_postcode_area, "Lekki, Lagos");
  assert.equal(d.delivery_contact, "Tunde 0803 000 0000");
  const c = await one("select postcode, postcode_area, postcode_verified_at from public.customers where id=$1", [d.customer_id]);
  assert.equal(c.postcode, "LA-01-B22-KT-05"); assert.equal(c.postcode_area, "Ikeja, Lagos"); assert.ok(c.postcode_verified_at);
  // editing without "delivery" keeps it; a bad postcode is never stored
  await as(owner, "select public.save_document($1, $2, $3::jsonb)", [biz, id, JSON.stringify({ title: "Order" })]);
  assert.equal((await one("select delivery_address from public.documents where id=$1", [id])).delivery_address, "Plot 4, Admiralty Way");
  await as(owner, "select public.save_document($1, $2, $3::jsonb)", [biz, id, JSON.stringify({ delivery: { address: "x", postcode: "nonsense" } })]);
  assert.equal((await one("select delivery_postcode from public.documents where id=$1", [id])).delivery_postcode, "");
});

test("bad postcodes can't be written straight into the tables", async () => {
  await assert.rejects(pool.query("update public.businesses set postcode='EK01' where id=$1", [biz]), /postcode_format/);
});
