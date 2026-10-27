import test from "node:test";
import assert from "node:assert/strict";
import { normalizePostcode, formatPostcodeInput, postcodeProblem, areaLabel } from "../lib/postcode.js";

test("postcode format: tolerant input, strict result", () => {
  assert.equal(normalizePostcode("EK-01-A03-FK-01"), "EK-01-A03-FK-01");
  assert.equal(normalizePostcode("ek01a03fk01"), "EK-01-A03-FK-01");
  assert.equal(normalizePostcode("EK 01 A03 FK 01"), "EK-01-A03-FK-01");
  assert.equal(normalizePostcode("LA-12-B7C-KT-45"), "LA-12-B7C-KT-45");
  assert.equal(normalizePostcode("EK-00-A03-FK-01"), null); // 00 isn't valid
  assert.equal(normalizePostcode("E1-01-A03-FK-01"), null);
  assert.equal(normalizePostcode("EK-01-A03-F1-01"), null);
  assert.equal(normalizePostcode("EK-01-A03-FK"), null);
});

test("typing adds the hyphens", () => {
  assert.equal(formatPostcodeInput("e"), "E");
  assert.equal(formatPostcodeInput("ek0"), "EK-0");
  assert.equal(formatPostcodeInput("ek01a0"), "EK-01-A0");
  assert.equal(formatPostcodeInput("ek01a03fk01xx"), "EK-01-A03-FK-01");
});

test("plain-words problems and area names", () => {
  assert.equal(postcodeProblem(""), null);
  assert.match(postcodeProblem("EK01"), /11 characters/);
  assert.equal(postcodeProblem("EK-01-A03-FK-01"), null);
  assert.equal(areaLabel({ state_name: "EKITI", lga_name: "ADO EKITI", locality_name: "ADO EKITI" }), "Ado Ekiti, Ekiti");
  assert.equal(areaLabel({}), "");
});

test("NIPOST lookup: verified, not found, credits fallback, unreachable", async () => {
  process.env.POSTCODE_API_KEY = "nipost_test_x";
  process.env.POSTCODE_LOOKUP_LEVEL = "2";
  const { verifyPostcode, postcodeFields } = await import("../lib/postcode-server.js");
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push([String(url), opts.headers["X-API-Key"]]);
    const code = new URL(url).searchParams.get("code"), level = new URL(url).searchParams.get("level");
    const json = (status, body) => ({ status, json: async () => body });
    if (code === "EK-01-A03-FK-01") return json(200, { data: { postcode: code, valid: true, administrative_address: { state_name: "EKITI", lga_name: "ADO EKITI", locality_name: "ADO EKITI" } } });
    if (code === "LA-01-A03-FK-01" && level === "2") return json(402, { error: { code: "insufficient_credits" } });
    if (code === "LA-01-A03-FK-01") return json(200, { data: { postcode: code, valid: true } });
    if (code === "KN-02-B11-AB-03") return json(200, { data: { postcode: code, valid: false } });
    throw Object.assign(new Error("down"), { name: "TypeError" });
  };
  assert.deepEqual(await verifyPostcode("ek01a03fk01"), { status: "verified", code: "EK-01-A03-FK-01", area: "Ado Ekiti, Ekiti" });
  assert.equal(calls[0][1], "nipost_test_x");
  assert.match(calls[0][0], /\/lookup\?code=EK-01-A03-FK-01&level=2$/);
  assert.deepEqual(await verifyPostcode("LA-01-A03-FK-01"), { status: "verified", code: "LA-01-A03-FK-01", area: "" }); // fell back to free level 1
  assert.equal((await verifyPostcode("KN-02-B11-AB-03")).status, "invalid");
  assert.equal((await verifyPostcode("OY-03-C22-CD-04")).status, "unchecked");
  assert.equal((await verifyPostcode("nonsense")).status, "format");
  assert.match((await postcodeFields("KN-02-B11-AB-03")).error, /doesn't recognise/);
  const ok = await postcodeFields("EK-01-A03-FK-01");
  assert.equal(ok.fields.postcode, "EK-01-A03-FK-01"); assert.ok(ok.fields.postcode_verified_at); assert.equal(ok.verified, true);
  const unk = await postcodeFields("OY-03-C22-CD-04");
  assert.equal(unk.fields.postcode, "OY-03-C22-CD-04"); assert.equal(unk.fields.postcode_verified_at, null); // kept, not blocked
  assert.deepEqual((await postcodeFields("")).fields.postcode, "");
});
