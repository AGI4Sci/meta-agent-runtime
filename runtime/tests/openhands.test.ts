import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenHandsActionParser,
  createOpenHandsContextStrategy,
  createOpenHandsPromptBuilder,
  createOpenHandsTools,
} from "../../packages/agents/openhands/src";

test("openhands parser parses compatibility tool envelope", () => {
  const parser = createOpenHandsActionParser();
  const action = parser.parse(
    JSON.stringify({
      thought: "Inspect the workspace first.",
      tool: {
        name: "execute_bash",
        arguments: { command: "pwd" },
      },
    }),
  );

  assert.equal(action.name, "execute_bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("openhands parser normalizes finish message to runtime finish args", () => {
  const parser = createOpenHandsActionParser();
  const action = parser.parse(
    JSON.stringify({
      name: "finish",
      arguments: { message: "done" },
    }),
  );

  assert.equal(action.name, "finish");
  assert.deepEqual(action.args, { result: "done" });
});

test("openhands prompt builder includes compatibility constraints", () => {
  const prompt = createOpenHandsPromptBuilder().build(
    "Fix the failing test",
    createOpenHandsTools(),
    {
      task: "Fix the failing test",
      entries: [],
      step: 0,
      tokenCount: 0,
    },
  );

  assert.match(prompt, /single-threaded/i);
  assert.match(prompt, /Return exactly one JSON object/);
  assert.match(prompt, /execute_bash/);
});

test("openhands context strategy trims old entries in pairs", () => {
  const strategy = createOpenHandsContextStrategy({ max_tokens: 20 });
  const trimmed = strategy.trim({
    task: "short task",
    step: 3,
    tokenCount: 100,
    entries: [
      { role: "assistant", content: "old assistant output", metadata: {} },
      { role: "tool", content: "old tool output", metadata: {} },
      { role: "assistant", content: "recent assistant output", metadata: {} },
      { role: "tool", content: "recent tool output", metadata: {} },
    ],
  });

  assert.equal(trimmed.entries[0]?.metadata.condensed, true);
  assert.match(trimmed.entries.at(-1)?.content ?? "", /recent tool output/);
});
