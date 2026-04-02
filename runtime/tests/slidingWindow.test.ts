import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowStrategy } from "../src/context/slidingWindow";

test("sliding window truncates an oversized latest entry to fit the budget", () => {
  const strategy = new SlidingWindowStrategy(10);
  const oversized = "a".repeat(200);

  const trimmed = strategy.trim({
    task: "task",
    entries: [
      { role: "tool", content: oversized, metadata: {} },
    ],
    step: 1,
    tokenCount: 0,
  });

  assert.equal(trimmed.entries.length, 1);
  assert.match(trimmed.entries[0]?.content ?? "", /\[truncated\]/);
  assert.ok((trimmed.entries[0]?.content.length ?? 0) < oversized.length);
  assert.ok(trimmed.tokenCount <= 10 + Math.ceil("task".length / 4));
});

test("sliding window keeps newest entries and drops older ones when needed", () => {
  const strategy = new SlidingWindowStrategy(8);

  const trimmed = strategy.trim({
    task: "task",
    entries: [
      { role: "assistant", content: "old".repeat(10), metadata: { step: 1 } },
      { role: "tool", content: "new".repeat(4), metadata: { step: 2 } },
    ],
    step: 2,
    tokenCount: 0,
  });

  assert.equal(trimmed.entries.at(-1)?.metadata.step, 2);
  assert.ok(trimmed.entries.length >= 1);
});
