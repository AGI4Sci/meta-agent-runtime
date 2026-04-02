import assert from "node:assert/strict";
import test from "node:test";
import { terminationCheck } from "../src/core/runtime";

test("finish has highest priority", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 999, tokenCount: 999999 },
    action: { name: "finish", args: { result: "ok" }, rawText: "" },
    config: { maxSteps: 1, maxTokens: 1 },
    totalTokenIn: 1,
    totalTokenOut: 1,
    totalElapsedMs: 1,
  });
  assert.equal(result, "finish");
});

