import test from "node:test";
import assert from "node:assert/strict";
import { clampShare, previewWidth, snapShare } from "../lib/split-core.js";

test("preview width snaps to 33 / 40 / 50 % when let go nearby", () => {
  assert.equal(snapShare(0.51), 0.5);
  assert.equal(snapShare(0.315), 0.33);
  assert.equal(snapShare(0.41), 0.4);
  assert.equal(snapShare(0.27), 0.27);
  assert.equal(clampShare(0.95), 0.8);
  assert.equal(clampShare(0.01), 0.15);
});

test("the preview never goes under 280px and the inputs keep 360px", () => {
  assert.equal(previewWidth(0.4, 1400, 320), 560);
  assert.equal(previewWidth(0.5, 1336, 320), 640); // 1336 − 320 − 16 − 360
  assert.equal(previewWidth(0.15, 1200, 0), 280);
  assert.equal(previewWidth(0.4, 700, 64), 280); // too narrow for both: the preview keeps its minimum
});
