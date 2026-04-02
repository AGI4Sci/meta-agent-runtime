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

test("max steps is checked before token and budget limits", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 5, tokenCount: 999999 },
    action: { name: "bash", args: {}, rawText: "" },
    config: { maxSteps: 1, maxTokens: 1, budgetToken: 1, budgetTimeMs: 1 },
    totalTokenIn: 100,
    totalTokenOut: 100,
    totalElapsedMs: 100,
  });
  assert.equal(result, "max_steps");
});

test("max tokens is checked before budget limits", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 0, tokenCount: 999999 },
    action: { name: "bash", args: {}, rawText: "" },
    config: { maxSteps: 10, maxTokens: 1, budgetToken: 1, budgetTimeMs: 1 },
    totalTokenIn: 100,
    totalTokenOut: 100,
    totalElapsedMs: 100,
  });
  assert.equal(result, "max_tokens");
});

test("budget token is checked before budget time", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 0, tokenCount: 0 },
    action: { name: "bash", args: {}, rawText: "" },
    config: { maxSteps: 10, maxTokens: 10_000, budgetToken: 1, budgetTimeMs: 1 },
    totalTokenIn: 1,
    totalTokenOut: 1,
    totalElapsedMs: 100,
  });
  assert.equal(result, "budget_token");
});

test("termination check returns null when no condition is met", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 0, tokenCount: 0 },
    action: { name: "bash", args: {}, rawText: "" },
    config: { maxSteps: 10, maxTokens: 10_000, budgetToken: 100, budgetTimeMs: 1000 },
    totalTokenIn: 1,
    totalTokenOut: 1,
    totalElapsedMs: 1,
  });
  assert.equal(result, null);
});
