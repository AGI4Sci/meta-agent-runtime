import assert from "node:assert/strict";
import test from "node:test";
import {
  PI_MONO_ADAPTER_NAME,
  PiMonoActionParser,
  PiMonoContextStrategy,
  PiMonoPromptBuilder,
  piMonoCodingTools,
  piMonoReadonlyTools,
} from "../../packages/agents/pi-mono/src";
import type { Context } from "../src/core/types";

test("pi-mono adapter exports stable adapter name", () => {
  assert.equal(PI_MONO_ADAPTER_NAME, "pi-mono");
});

test("pi-mono parser accepts fenced json and normalizes shared runtime tool aliases", () => {
  const parser = new PiMonoActionParser();
  const action = parser.parse('```json\n{"name":"file_read","args":{"path":"README.md"}}\n```');
  assert.equal(action.name, "read");
  assert.deepEqual(action.args, { path: "README.md" });
});

test("pi-mono prompt builder includes task, tools, and json contract", () => {
  const prompt = new PiMonoPromptBuilder().build(
    "Inspect the repository",
    piMonoCodingTools,
    { task: "Inspect the repository", entries: [], step: 0, tokenCount: 0 },
  );

  assert.match(prompt, /You are an expert coding assistant operating inside pi/);
  assert.match(prompt, /- read: Read file contents/);
  assert.match(prompt, /Respond with a single JSON object/);
});

test("pi-mono context strategy keeps assistant and tool entries in pairs", () => {
  const context: Context = {
    task: "task",
    step: 3,
    tokenCount: 0,
    entries: [
      { role: "assistant", content: "first assistant", metadata: { step: 1 } },
      { role: "tool", content: "first tool", metadata: {} },
      { role: "assistant", content: "second assistant", metadata: { step: 2 } },
      { role: "tool", content: "second tool", metadata: {} },
    ],
  };

  const trimmed = new PiMonoContextStrategy(8).trim(context);
  assert.equal(trimmed.entries.length, 2);
  assert.equal(trimmed.entries[0].content, "second assistant");
  assert.equal(trimmed.entries[1].content, "second tool");
});

test("pi-mono tool presets expose minimal coding and readonly skeletons", () => {
  assert.deepEqual(
    piMonoCodingTools.map((tool) => tool.name),
    ["read", "bash", "edit", "write"],
  );
  assert.deepEqual(
    piMonoReadonlyTools.map((tool) => tool.name),
    ["read", "search"],
  );
});
