import test from "node:test";
import assert from "node:assert/strict";
import { pingTrackOja } from "../lib/keep-alive.js";

test("TrackOja keep-alive calls its public price list with the anon key", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response("[]", { status: 200 }); };
  const r = await pingTrackOja({ fetchImpl, env: { TRACKOJA_SUPABASE_URL: "https://abc.supabase.co/", TRACKOJA_SUPABASE_ANON_KEY: "anon-key" } });
  assert.equal(r.ok, true);
  assert.equal(seen.url, "https://abc.supabase.co/rest/v1/rpc/list_published_plans");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.apikey, "anon-key");
  assert.deepEqual(JSON.parse(seen.init.body), { p_product_key: "trackoja" });
});

test("skips without settings, reports failures, never throws", async () => {
  assert.match((await pingTrackOja({ env: {} })).skipped, /TRACKOJA_SUPABASE_URL/);
  assert.match((await pingTrackOja({ env: { TRACKOJA_SUPABASE_URL: "http://x", TRACKOJA_SUPABASE_ANON_KEY: "k" } })).error, /https/);
  const down = await pingTrackOja({ fetchImpl: async () => { throw new Error("boom"); }, env: { TRACKOJA_SUPABASE_URL: "https://x.supabase.co", TRACKOJA_SUPABASE_ANON_KEY: "k" } });
  assert.equal(down.ok, false); assert.match(down.error, /Couldn't reach/);
  const bad = await pingTrackOja({ fetchImpl: async () => new Response("no", { status: 404 }), env: { TRACKOJA_SUPABASE_URL: "https://x.supabase.co", TRACKOJA_SUPABASE_ANON_KEY: "k" } });
  assert.deepEqual(bad, { ok: false, status: 404 });
});
