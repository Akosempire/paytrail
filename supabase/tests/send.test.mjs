// The send sheet (20261101000200_send_queue.sql): emails wait in a queue so
// "Send now" can be undone for 10 seconds, schedules go out when due (even
// after a restart), repeating invoices make one copy per period, and
// duplicating never carries the repeat along.
import test from "node:test";
import assert from "node:assert/strict";
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
const as = (userId, sql, params) => run("authenticated", userId, sql, params);
const svc = (sql, params) => run("service_role", "", sql, params);

let owner, junior, outsider, biz, otherBiz;
const newInvoice = async (extra = {}) => (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({
  kind: "invoice", title: "Monthly retainer", customer: { name: "Ade Foods", email: "ade@adefoods.test" },
  items: [{ description: "Retainer", quantity: 2, unit_price_minor: 150000 }], costs: [{ label: "Hosting", category: "other", amount_minor: 20000 }], ...extra,
})])).rows[0].id;
const queue = (user, doc, opts = {}) => as(user, "select public.queue_document_send($1, $2, $3, $4, $5, true, $6, $7) j",
  [doc, opts.to ?? "ade@adefoods.test", opts.cc ?? [], opts.subject ?? "", opts.message ?? "", opts.at ?? null, opts.mark ?? false]).then((r) => r.rows[0].j);
const claimIds = (ids) => svc("select * from public.claim_due_sends(20, $1::uuid[])", [ids]).then((r) => r.rows);

test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`s-owner${s}@a.test`])).id;
  junior = (await one("insert into auth.users(email) values ($1) returning id", [`s-jr${s}@a.test`])).id;
  outsider = (await one("insert into auth.users(email) values ($1) returning id", [`s-out${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Send Ltd','Ada','NGN') id")).rows[0].id;
  otherBiz = (await as(outsider, "select public.create_business('company','Other Ltd','Bo','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'junior_finance','Jo')", [biz, junior]);
  // a paying business (allowances are tested in pricing.test.mjs)
  await pool.query("update public.businesses set require_approval = true, subscription_status = 'active', current_period_end = now() + interval '30 days' where id = $1", [biz]);
});
test.after(() => pool.end());

test("send now: queued for 10 seconds, and Undo stops the email", async () => {
  const doc = await newInvoice();
  await as(owner, "select public.mark_document_sent($1)", [doc]);
  const q = await queue(owner, doc, { cc: ["Boss@AdeFoods.test", "boss@adefoods.test", ""], subject: "Invoice from Send Ltd" });
  const wait = (new Date(q.send_after) - Date.now()) / 1000;
  assert.ok(wait > 8 && wait <= 10.5, `waits about 10s (got ${wait})`);
  assert.deepEqual(q.cc, ["boss@adefoods.test"], "CC is cleaned and de-duplicated");
  assert.equal((await claimIds([q.id])).length, 0, "not handed out before its time");
  const undo = (await as(owner, "select public.cancel_document_send($1) j", [q.id])).rows[0].j;
  assert.equal(undo.cancelled, true);
  await pool.query("update public.document_sends set send_after = now() - interval '1 second' where id = $1", [q.id]);
  assert.equal((await claimIds([q.id])).length, 0, "an undone email never goes");
  const acts = (await pool.query("select action, detail from public.activity where document_id = $1 order by id", [doc])).rows;
  assert.ok(acts.some((a) => a.action === "document.email_undone"));
  assert.equal(acts.find((a) => a.action === "document.sent").detail.channel, "email", "the sent line names the channel");
});

test("a due email is handed out once, finished once, and too late to undo", async () => {
  const doc = await newInvoice();
  await as(owner, "select public.mark_document_sent($1)", [doc]);
  const q = await queue(owner, doc);
  await pool.query("update public.document_sends set send_after = now() - interval '1 second' where id = $1", [q.id]);
  const [first, second] = await Promise.all([claimIds([q.id]), claimIds([q.id])]);
  assert.equal(first.length + second.length, 1, "two workers never get the same email");
  assert.equal((await as(owner, "select public.cancel_document_send($1) j", [q.id])).rows[0].j.cancelled, false);
  await svc("select public.finish_document_send($1, true, '')", [q.id]);
  await svc("select public.finish_document_send($1, true, '')", [q.id]);
  assert.equal((await one("select status from public.document_sends where id = $1", [q.id])).status, "sent");
  assert.equal((await one("select count(*)::int n from public.activity where document_id = $1 and action = 'document.emailed'", [doc])).n, 1);
});

test("an email stuck mid-send (the app restarted) is picked up again later", async () => {
  const doc = await newInvoice();
  await as(owner, "select public.mark_document_sent($1)", [doc]);
  const q = await queue(owner, doc);
  await pool.query("update public.document_sends set status = 'sending', claimed_at = now() - interval '20 minutes', attempts = 1 where id = $1", [q.id]);
  assert.equal((await claimIds([q.id])).length, 1);
  await pool.query("update public.document_sends set claimed_at = now() - interval '20 minutes', attempts = 3 where id = $1", [q.id]);
  assert.equal((await claimIds([q.id])).length, 0);
  assert.equal((await one("select status from public.document_sends where id = $1", [q.id])).status, "failed");
});

test("a schedule marks the draft sent only when it goes, as the person who set it", async () => {
  const doc = await newInvoice();
  await assert.rejects(queue(owner, doc), /Send the document first/);
  const at = new Date(Date.now() + 3 * 86400000).toISOString();
  const q = await queue(owner, doc, { at, mark: true });
  assert.equal((await one("select status from public.documents where id = $1", [doc])).status, "draft");
  await pool.query("update public.document_sends set send_after = now() - interval '1 second' where id = $1", [q.id]);
  const rows = await claimIds([q.id]);
  assert.equal(rows.length, 1);
  const d = await one("select status, sent_at from public.documents where id = $1", [doc]);
  assert.equal(d.status, "sent");
  const sent = await one("select actor_id, detail from public.activity where document_id = $1 and action = 'document.sent'", [doc]);
  assert.equal(sent.actor_id, owner);
  assert.equal(sent.detail.channel, "email");
});

test("a schedule that can no longer be sent fails cleanly instead of blocking the queue", async () => {
  const doc = await newInvoice();
  const q = await queue(owner, doc, { at: new Date(Date.now() + 60000).toISOString(), mark: true });
  await pool.query("update public.documents set status = 'void' where id = $1", [doc]);
  await pool.query("update public.document_sends set send_after = now() - interval '1 second' where id = $1", [q.id]);
  assert.equal((await claimIds([q.id])).length, 0);
  const s = await one("select status, error from public.document_sends where id = $1", [q.id]);
  assert.equal(s.status, "failed");
  assert.match(s.error, /voided/);
});

test("who may queue, cancel and claim", async () => {
  const doc = await newInvoice();
  await assert.rejects(queue(junior, doc, { at: new Date(Date.now() + 60000).toISOString(), mark: true }), /approve/);
  await assert.rejects(queue(outsider, doc, { mark: true }), /not found/i);
  await as(owner, "select public.mark_document_sent($1)", [doc]);
  await assert.rejects(queue(owner, doc, { to: "ade@adefoods" }), /look right/);
  await assert.rejects(queue(owner, doc, { cc: ["nope"] }), /CC/);
  await assert.rejects(queue(owner, doc, { at: new Date(Date.now() - 86400000).toISOString() }), /12 months/);
  const q = await queue(owner, doc);
  await assert.rejects(as(outsider, "select public.cancel_document_send($1)", [q.id]), /Not found/);
  await assert.rejects(as(owner, "select * from public.claim_due_sends(5)"));
  await assert.rejects(as(owner, "insert into public.document_sends(business_id, document_id, to_email) values ($1, $2, 'x@y.test')", [biz, doc]));
  assert.equal((await as(outsider, "select count(*)::int n from public.document_sends")).rows[0].n, 0, "other businesses can't read the queue");
});

test("shares are logged with their channel, without flooding the activity", async () => {
  const doc = await newInvoice();
  await as(owner, "select public.mark_document_sent($1)", [doc]);
  await as(owner, "select public.record_document_share($1, 'whatsapp')", [doc]);
  await as(owner, "select public.record_document_share($1, 'whatsapp')", [doc]);
  await as(owner, "select public.record_document_share($1, 'qr')", [doc]);
  const rows = (await pool.query("select action, detail->>'channel' ch from public.activity where document_id = $1 and action in ('document.sent','document.shared') order by id", [doc])).rows;
  assert.deepEqual(rows.map((r) => `${r.action}:${r.ch}`), ["document.sent:whatsapp", "document.shared:whatsapp", "document.shared:qr"]);
  await assert.rejects(as(owner, "select public.record_document_share($1, 'fax')", [doc]), /Unknown channel/);
  await assert.rejects(as(outsider, "select public.record_document_share($1, 'link')", [doc]), /not found/);
});

test("repeating invoices: one copy per period, however often the job runs", async () => {
  const doc = await newInvoice({ due_date: undefined });
  await pool.query("update public.documents set issue_date = '2026-01-31', due_date = '2026-02-14' where id = $1", [doc]);
  await assert.rejects(as(junior, "select public.set_document_recurrence($1, 'monthly', current_date + 1, false)", [doc]), /manager or finance/);
  await assert.rejects(as(owner, "select public.set_document_recurrence($1, 'monthly', current_date, false)", [doc]), /start date/);
  await as(owner, "select public.set_document_recurrence($1, 'monthly', current_date + 1, true)", [doc]);
  // the date has come: pretend it was set for 31 Jan
  await pool.query("update public.documents set recur_next_on = '2026-01-31', recur_day = 31 where id = $1", [doc]);
  const first = (await svc("select * from public.run_due_recurrences('2026-01-31')")).rows.filter((r) => r.source_id === doc);
  assert.equal(first.length, 1);
  assert.ok(first[0].new_id && first[0].send_id, "a copy was made and queued");
  // a second run for the same period (e.g. the job retried) makes nothing
  await pool.query("update public.documents set recur_next_on = '2026-01-31' where id = $1", [doc]);
  const again = (await svc("select * from public.run_due_recurrences('2026-01-31')")).rows.filter((r) => r.source_id === doc);
  assert.equal(again[0].new_id, null);
  assert.equal((await one("select count(*)::int n from public.documents where recur_source_id = $1", [doc])).n, 1);
  // month end: 31 Jan → 28 Feb → 31 Mar
  assert.equal((await one("select recur_next_on::text d from public.documents where id = $1", [doc])).d, "2026-02-28");
  await svc("select * from public.run_due_recurrences('2026-02-28')");
  assert.equal((await one("select recur_next_on::text d from public.documents where id = $1", [doc])).d, "2026-03-31");

  const copy = await one("select * from public.documents where id = $1", [first[0].new_id]);
  const src = await one("select * from public.documents where id = $1", [doc]);
  assert.equal(copy.status, "draft");
  assert.notEqual(copy.number, src.number);
  assert.notEqual(copy.access_token, src.access_token);
  assert.equal(copy.issue_date.toISOString().slice(0, 10) <= "2026-01-31", true);
  assert.equal(copy.total_minor, src.total_minor);
  assert.equal(copy.recur_interval, null, "the copy doesn't repeat itself");
  assert.equal((await one("select count(*)::int n from public.document_items where document_id = $1", [copy.id])).n, 1);
  assert.equal((await one("select count(*)::int n from public.document_costs where document_id = $1", [copy.id])).n, 1);
  // the queued copy goes out as the person who set up the repeat
  const rows = await claimIds([first[0].send_id]);
  assert.equal(rows.length, 1);
  assert.equal((await one("select status from public.documents where id = $1", [copy.id])).status, "sent");
  // stopping
  await as(owner, "select public.set_document_recurrence($1, null, null, false)", [doc]);
  assert.equal((await one("select recur_interval from public.documents where id = $1", [doc])).recur_interval, null);
});

test("weekly repeats move on by seven days", async () => {
  assert.equal((await one("select public.next_recurrence('2026-12-29', 'weekly', 29)::text d")).d, "2027-01-05");
  assert.equal((await one("select public.next_recurrence('2028-01-31', 'monthly', 31)::text d")).d, "2028-02-29");
  assert.equal((await one("select public.next_recurrence('2026-02-28', 'monthly', 30)::text d")).d, "2026-03-30");
});

test("duplicating an invoice gives a fresh draft and never copies the repeat", async () => {
  const doc = await newInvoice();
  await as(owner, "select public.set_document_recurrence($1, 'weekly', current_date + 7, false)", [doc]);
  // Duplicate in the app saves the same content as a new document
  const dup = await newInvoice();
  const [a, b] = [await one("select * from public.documents where id = $1", [doc]), await one("select * from public.documents where id = $1", [dup])];
  assert.notEqual(a.number, b.number);
  assert.notEqual(a.access_token, b.access_token);
  assert.equal(b.status, "draft");
  assert.equal(b.recur_interval, null);
  assert.equal(b.total_minor, a.total_minor);
});

test("the business is told about a view at most once a day", async () => {
  const doc = await newInvoice();
  assert.equal((await svc("select public.claim_view_notice($1) ok", [doc])).rows[0].ok, true);
  assert.equal((await svc("select public.claim_view_notice($1) ok", [doc])).rows[0].ok, false);
  await pool.query("update public.documents set view_notified_at = now() - interval '25 hours' where id = $1", [doc]);
  assert.equal((await svc("select public.claim_view_notice($1) ok", [doc])).rows[0].ok, true);
  await assert.rejects(as(owner, "select public.claim_view_notice($1)", [doc]));
});
