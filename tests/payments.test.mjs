// Usetally's own subscription billing: only real, verified, live payments
// activate a plan, exactly once, and a double click reuses one checkout.
import test from "node:test";
import assert from "node:assert/strict";

process.env.APP_ENCRYPTION_KEY ||= "test-key-test-key-test-key-test-key-1234";
process.env.NODE_ENV = "production";
delete process.env.PAYTRAIL_ALLOW_TEST_PAYMENTS;

const { encryptSecret } = await import("../lib/crypto.js");
const pay = await import("../lib/payments/index.js");

const BIZ = "11111111-1111-4111-8111-111111111111", PLAN = "22222222-2222-4222-8222-222222222222";
let activations, providerAnswer, checkoutsCreated;
function setup(secretKey) {
  activations = 0; checkoutsCreated = 0;
  globalThis.__fakeDb = {
    tables: {
      platform_settings: [{ id: true, billing_provider: "bachs", billing_secret_enc: encryptSecret(secretKey), billing_webhook_secret_enc: encryptSecret("whsec_test_secret") }],
      payment_attempts: [],
    },
    unique: { payment_attempts: ["reference"] },
    rpc: async (name) => { if (name === "activate_subscription") activations++; return { data: null, error: null }; },
  };
  // the Bachs API
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith("/v1/checkout-sessions") && init.method === "POST") {
      checkoutsCreated++;
      const ref = JSON.parse(init.body).reference;
      return new Response(JSON.stringify({ checkout_id: `cs_${checkoutsCreated}`, checkout_url: `https://pay.bachs.test/${ref}` }), { status: 200 });
    }
    if (u.includes("/v1/checkout-sessions/")) return new Response(JSON.stringify(providerAnswer()), { status: 200 });
    return new Response("{}", { status: 404 });
  };
}
const start = () => pay.startCheckout({ billingBusinessId: BIZ, provider: "bachs", purpose: "subscription", planId: PLAN, amountMinor: 500000, currency: "NGN", customer: { email: "a@b.test" }, brand: { name: "Usetally" } });

test("a sandbox (test) billing key can't start a subscription payment", async () => {
  setup("sk_sandbox_abcdefghijk");
  await assert.rejects(start(), /test key/);
  assert.equal(globalThis.__fakeDb.tables.payment_attempts.length, 0);
});

test("a test-mode payment that 'succeeds' never activates a plan", async () => {
  setup("sk_live_abcdefghijk");
  const { reference } = await start();
  globalThis.__fakeDb.tables.payment_attempts[0].mode = "test"; // e.g. started before the key was replaced
  providerAnswer = () => ({ payment_status: "succeeded", amount: "5000.00", currency: "NGN", reference });
  const r = await pay.confirmAttempt(reference);
  assert.equal(r.state, "failed");
  assert.equal(activations, 0);
});

test("live: clicking Pay twice reuses the same checkout", async () => {
  setup("sk_live_abcdefghijk");
  const a = await start(), b = await start();
  assert.equal(a.url, b.url);
  assert.equal(checkoutsCreated, 1);
  assert.equal(globalThis.__fakeDb.tables.payment_attempts.length, 1);
  assert.equal(globalThis.__fakeDb.tables.payment_attempts[0].mode, "live");
});

test("live: nothing is activated until the provider confirms the payment", async () => {
  setup("sk_live_abcdefghijk");
  const { reference } = await start();
  providerAnswer = () => ({ payment_status: "pending", amount: "5000.00", currency: "NGN", reference });
  assert.equal((await pay.confirmAttempt(reference)).state, "pending");
  assert.equal(activations, 0);
});

test("live: a confirmed payment activates the plan exactly once (return page + webhook)", async () => {
  setup("sk_live_abcdefghijk");
  const { reference } = await start();
  providerAnswer = () => ({ payment_status: "succeeded", amount: "5000.00", currency: "NGN", reference });
  assert.equal((await pay.confirmAttempt(reference)).state, "succeeded");
  assert.equal((await pay.confirmAttempt(reference, { fromWebhook: true })).state, "succeeded");
  assert.equal(activations, 1);
});

test("live: a wrong amount or currency is refused", async () => {
  setup("sk_live_abcdefghijk");
  const { reference } = await start();
  providerAnswer = () => ({ payment_status: "succeeded", amount: "50.00", currency: "NGN", reference });
  assert.equal((await pay.confirmAttempt(reference)).state, "failed");
  assert.equal(activations, 0);
});

test("live: a failed or cancelled payment activates nothing", async () => {
  setup("sk_live_abcdefghijk");
  const { reference } = await start();
  providerAnswer = () => ({ payment_status: "cancelled", amount: "5000.00", currency: "NGN", reference });
  assert.equal((await pay.confirmAttempt(reference)).state, "failed");
  assert.equal(activations, 0);
});
