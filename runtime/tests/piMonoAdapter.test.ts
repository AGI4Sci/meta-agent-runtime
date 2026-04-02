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

test("pi-mono parser accepts source-style tool call envelopes", () => {
  const parser = new PiMonoActionParser();
  const action = parser.parse('{"type":"toolCall","name":"bash","arguments":{"command":"pwd"}}');
  assert.equal(action.name, "bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("pi-mono prompt builder includes task, tools, and json contract", () => {
  const prompt = new PiMonoPromptBuilder({
    cwd: "/repo",
    now: () => new Date("2026-01-02T03:04:05Z"),
  }).build(
    "Inspect the repository",
    piMonoCodingTools,
    { task: "Inspect the repository", entries: [], step: 0, tokenCount: 0 },
  );

  assert.match(prompt, /You are an expert coding assistant operating inside pi/);
  assert.match(prompt, /- read: Read file contents/);
  assert.match(prompt, /Current working directory: \/repo/);
  assert.match(prompt, /Respond with a single JSON object/);
});

test("pi-mono prompt builder keeps original readonly exploration guidance", () => {
  const prompt = new PiMonoPromptBuilder().build(
    "Inspect the repository",
    piMonoReadonlyTools,
    { task: "Inspect the repository", entries: [], step: 0, tokenCount: 0 },
  );

  assert.match(prompt, /- grep: Search file contents for patterns/);
  assert.match(prompt, /- find: Find files by glob pattern/);
  assert.match(prompt, /- ls: List directory contents/);
  assert.match(prompt, /Show file paths clearly when working with files/);
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

test("pi-mono context strategy preserves non-tool trailing entries", () => {
  const context: Context = {
    task: "task",
    step: 2,
    tokenCount: 0,
    entries: [
      { role: "assistant", content: "assistant", metadata: { step: 1 } },
      { role: "tool", content: "tool", metadata: { step: 1 } },
      { role: "user", content: "follow-up", metadata: { step: 2 } },
    ],
  };

  const trimmed = new PiMonoContextStrategy(4).trim(context);
  assert.equal(trimmed.entries.at(-1)?.role, "user");
  assert.equal(trimmed.entries.at(-1)?.content, "follow-up");
});

test("pi-mono tool presets expose minimal coding and readonly skeletons", () => {
  assert.deepEqual(
    piMonoCodingTools.map((tool) => tool.name),
    ["read", "bash", "edit", "write"],
  );
  assert.deepEqual(
    piMonoReadonlyTools.map((tool) => tool.name),
    ["read", "grep", "find", "ls"],
  );
});
