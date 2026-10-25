// Files attached to documents: who can add, see, share and remove them.
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

let owner, junior, outsider, biz, otherBiz, docId, otherDoc;
const add = (user, b, d, by = user) => as(user, "insert into public.document_files(business_id,document_id,name,content_type,size_bytes,storage_key,uploaded_by) values ($1,$2,'proof.jpg','image/jpeg',1000,gen_random_uuid()::text,$3) returning id", [b, d, by]);
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`f-owner${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`f-jr${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`f-out${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Files Ltd','Ada','NGN') id")).rows[0].id;
  otherBiz = (await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
  const doc = (b, u) => as(u, "select public.save_document($1, null, $2::jsonb) id", [b, JSON.stringify({ kind: "invoice", title: "Job", customer: { name: "Kay", email: "kay@c.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })]);
  docId = (await doc(biz, owner)).rows[0].id;
  otherDoc = (await doc(otherBiz, outsider)).rows[0].id;
});
test.after(() => pool.end());

test("team members can attach files; others can't see them", async () => {
  const f = (await add(junior, biz, docId)).rows[0].id;
  assert.equal((await as(owner, "select id from public.document_files where id=$1", [f])).rowCount, 1);
  assert.equal((await as(outsider, "select id from public.document_files where id=$1", [f])).rowCount, 0);
});

test("can't attach to another business's document, or as someone else", async () => {
  await assert.rejects(add(outsider, biz, docId));
  await assert.rejects(add(owner, biz, otherDoc));
  await assert.rejects(add(junior, biz, docId, owner));
});

test("only owner/manager/finance can share with the customer", async () => {
  const f = (await add(junior, biz, docId)).rows[0].id;
  assert.equal((await as(junior, "update public.document_files set shared=true where id=$1", [f])).rowCount, 0);
  assert.equal((await as(owner, "update public.document_files set shared=true where id=$1", [f])).rowCount, 1);
});

test("junior finance removes only their own files", async () => {
  const mine = (await add(junior, biz, docId)).rows[0].id;
  const owners = (await add(owner, biz, docId)).rows[0].id;
  assert.equal((await as(junior, "delete from public.document_files where id=$1", [owners])).rowCount, 0);
  assert.equal((await as(junior, "delete from public.document_files where id=$1", [mine])).rowCount, 1);
  assert.equal((await as(owner, "delete from public.document_files where id=$1", [owners])).rowCount, 1);
});

test("files over 4 MB are refused", async () => {
  await assert.rejects(as(owner, "insert into public.document_files(business_id,document_id,name,content_type,size_bytes,storage_key,uploaded_by) values ($1,$2,'big.pdf','application/pdf',5000000,'k-big',$3)", [biz, docId, owner]));
});
