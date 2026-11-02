import test from "node:test";
import assert from "node:assert/strict";
import { ALL_FEATURES, featuresOf, hasFeature, isPremiumTemplate, planFeatures, upgradeMessage } from "../lib/entitlements.js";
import { TEMPLATES } from "../lib/doc-templates.js";

test("an empty plan setting means: paid plans get everything, Free gets nothing", () => {
  assert.deepEqual(planFeatures({ price_minor: 500000 }), ALL_FEATURES);
  assert.deepEqual(planFeatures({ price_minor: 0 }), []);
  assert.deepEqual(planFeatures({ price_minor: 0, features_included: ["auto_reminders", "nonsense"] }), ["auto_reminders"]);
  assert.deepEqual(planFeatures({ price_minor: 500000, features_included: [] }), []);
});

test("Essential and Signature stay free; every other template is premium", () => {
  assert.equal(isPremiumTemplate("signature"), false);
  assert.equal(isPremiumTemplate("essential"), false);
  for (const id of Object.keys(TEMPLATES).filter((t) => !["signature", "essential"].includes(t))) assert.equal(isPremiumTemplate(id), true, id);
  assert.equal(isPremiumTemplate(""), false);
});

test("featuresOf: what the database says; before the SQL nothing is locked", async () => {
  const client = (result) => ({ rpc: async () => result });
  assert.deepEqual(await featuresOf(client({ data: ["auto_reminders"], error: null }), "b1"), ["auto_reminders"]);
  assert.deepEqual(await featuresOf(client({ data: [], error: null }), "b1"), []);
  assert.deepEqual(await featuresOf(client({ data: null, error: { message: "Could not find the function public.business_features" } }), "b1"), ALL_FEATURES);
  assert.deepEqual(await featuresOf({ rpc: async () => { throw new Error("down"); } }, "b1"), ALL_FEATURES);
  assert.deepEqual(await featuresOf(client({ data: ["x"] }), ""), []);
  assert.equal(hasFeature(["ai_full"], "ai_full"), true);
  assert.equal(hasFeature(null, "ai_full"), false);
});

test("upgrade messages read as one plain sentence", () => {
  assert.equal(upgradeMessage("auto_reminders"), "Automatic reminders are on paid plans. Upgrade in Settings → Plan & billing.");
  assert.equal(upgradeMessage("premium_templates"), "This template is on paid plans. Upgrade in Settings → Plan & billing.");
  assert.match(upgradeMessage("ai_full"), /^Connecting ChatGPT, Claude or Grok \(AI & MCP\) is on paid plans/);
});
