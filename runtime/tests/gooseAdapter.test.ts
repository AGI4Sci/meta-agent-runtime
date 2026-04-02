import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GooseActionParser } from "../../packages/agents/goose/src/actionParser";
import { GooseContextStrategy } from "../../packages/agents/goose/src/contextStrategy";
import { GoosePromptBuilder } from "../../packages/agents/goose/src/promptBuilder";
import { GOOSE_TOOL_PRESET, gooseEditTool, gooseShellTool, gooseTreeTool } from "../../packages/agents/goose/src/tools";

test("goose parser accepts native name/args payload", () => {
  const parser = new GooseActionParser();
  const action = parser.parse('{"name":"shell","args":{"command":"pwd"}}');
  assert.equal(action.name, "shell");
  assert.equal(action.args.command, "pwd");
});

test("goose parser accepts tool/arguments payload inside fence", () => {
  const parser = new GooseActionParser();
  const action = parser.parse('```json\n{"tool":"write","arguments":{"path":"a.txt","content":"x"}}\n```');
  assert.equal(action.name, "write");
  assert.equal(action.args.path, "a.txt");
});

test("goose prompt builder renders goose instructions and tools", () => {
  const builder = new GoosePromptBuilder();
  const prompt = builder.build(
    "Inspect the repo",
    GOOSE_TOOL_PRESET,
    { task: "Inspect the repo", entries: [], step: 0, tokenCount: 0 },
  );

  assert.match(prompt, /You are a general-purpose AI agent called goose/);
  assert.match(prompt, /## developer/);
  assert.match(prompt, /"name":"tool_name"/);
});

test("goose context strategy trims to last entries", () => {
  const strategy = new GooseContextStrategy(2);
  const trimmed = strategy.trim({
    task: "demo",
    step: 3,
    tokenCount: 10,
    entries: [
      { role: "assistant", content: "a", metadata: {} },
      { role: "tool", content: "b", metadata: {} },
      { role: "assistant", content: "c", metadata: {} },
    ],
  });

  assert.deepEqual(
    trimmed.entries.map((entry) => entry.content),
    ["b", "c"],
  );
});

test("goose tree tool respects depth and ignores .gitignored files via rg", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "goose-tree-"));
  try {
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await mkdir(path.join(tempDir, "ignored"), { recursive: true });
    await writeFile(path.join(tempDir, ".gitignore"), "ignored/\n", "utf8");
    await writeFile(path.join(tempDir, "src", "main.ts"), "line1\nline2\n", "utf8");
    await writeFile(path.join(tempDir, "ignored", "secret.txt"), "hidden\n", "utf8");

    const result = await gooseTreeTool.call({ path: tempDir, depth: 2 });
    const rendered = String(result);

    assert.match(rendered, /src\/\s+\[3\]/);
    assert.match(rendered, /main\.ts\s+\[3\]/);
    assert.doesNotMatch(rendered, /ignored/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("goose edit tool requires unique matches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "goose-edit-"));
  try {
    const filePath = path.join(tempDir, "demo.txt");
    await writeFile(filePath, "same\nsame\n", "utf8");

    await assert.rejects(
      async () => gooseEditTool.call({ path: filePath, old_text: "same", new_text: "new" }),
      /must match uniquely/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("goose shell tool preserves exit code in error output", async () => {
  const raw = await gooseShellTool.call({ command: "printf 'oops' 1>&2; exit 7" });
  const observation = gooseShellTool.interpreter(raw);

  assert.equal(observation.error, "shell exited with code 7");
  assert.match(observation.content, /exit_code: 7/);
  assert.match(observation.content, /stderr:\noops/);
});
