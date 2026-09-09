import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateController } from "../js/controller.js";

const config = JSON.parse(
  await readFile(new URL("../data/controller.json", import.meta.url)),
);
const cases = JSON.parse(
  await readFile(new URL("./fixtures/controller-cases.json", import.meta.url)),
);
test("browser inference matches Python safe_control and real aggregation", () => {
  for (const { input, expected } of cases) {
    const result = evaluateController(config, input);
    assert.ok(
      Math.abs(result.command - expected.command) < 1e-10,
      JSON.stringify(input),
    );
    assert.equal(result.status, expected.status);
    assert.equal(result.clipped, expected.clipped);
    assert.equal(
      result.activeRules.length,
      (expected.activeRules ?? []).length,
    );
    for (const [i, rule] of (expected.activeRules ?? []).entries()) {
      assert.deepEqual(result.activeRules[i], rule);
    }
    for (const [i, value] of (expected.aggregatedMembership ?? []).entries()) {
      assert.ok(Math.abs(result.aggregatedMembership[i] - value) < 1e-12);
    }
  }
});
test("nonfinite sensors fail closed and finite override precedes sensor validation", () => {
  for (const value of [NaN, Infinity, -Infinity, undefined]) {
    assert.equal(
      evaluateController(config, { error: value, outdoor: 15 }).status,
      "sensor_fault",
    );
    assert.equal(
      evaluateController(config, { error: 0, outdoor: value }).command,
      0,
    );
    assert.equal(
      evaluateController(config, {
        error: value,
        outdoor: value,
        manualOverride: 25,
      }).command,
      25,
    );
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      evaluateController(config, {
        error: 0,
        outdoor: 15,
        manualOverride: value,
      }).status,
      "invalid_manual_override",
    );
  }
});
test("successive decisions are independent and leave config unchanged", () => {
  const before = JSON.stringify(config);
  const first = evaluateController(config, { error: -4, outdoor: 30 });
  evaluateController(config, { error: 8, outdoor: -10 });
  assert.deepEqual(
    evaluateController(config, { error: -4, outdoor: 30 }),
    first,
  );
  assert.equal(JSON.stringify(config), before);
});
