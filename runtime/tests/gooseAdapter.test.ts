import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("goose parser accepts function envelope with stringified arguments", async () => {
  const parser = new GooseActionParser();
  const fixturePath = path.join(process.cwd(), "tests/fixtures/goose/function-call-envelope.json");
  const payload = await readFile(fixturePath, "utf8");
  const action = parser.parse(payload);

  assert.equal(action.name, "edit");
  assert.equal(action.args.path, "src/main.ts");
  assert.equal(action.args.before, "old");
  assert.equal(action.args.after, "new");
});

test("goose prompt builder renders goose instructions and tools", () => {
  const builder = new GoosePromptBuilder("2026-04-02 12:00");
  const prompt = builder.build(
    "Inspect the repo",
    GOOSE_TOOL_PRESET,
    { task: "Inspect the repo", entries: [], step: 0, tokenCount: 0 },
  );

  assert.match(prompt, /You are a general-purpose AI agent called goose/);
  assert.match(prompt, /open-source software project/);
  assert.match(prompt, /## developer/);
  assert.match(prompt, /The current date is 2026-04-02 12:00\./);
  assert.match(prompt, /"name":"tool_name"/);
});

test("goose context strategy trims to fit token budget", () => {
  const strategy = new GooseContextStrategy(5);
  const trimmed = strategy.trim({
    task: "demo",
    step: 3,
    tokenCount: 10,
    entries: [
      { role: "assistant", content: "12345678901234567890", metadata: {} },
      { role: "tool", content: "12345678", metadata: {} },
      { role: "assistant", content: "12345678", metadata: {} },
    ],
  });

  assert.deepEqual(
    trimmed.entries.map((entry) => entry.content),
    ["12345678", "12345678"],
  );
  assert.equal(trimmed.tokenCount, 5);
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
      async () => gooseEditTool.call({ path: filePath, before: "same", after: "new" }),
      /must match uniquely/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("goose edit tool accepts empty after text for deletion", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "goose-edit-delete-"));
  try {
    const filePath = path.join(tempDir, "demo.txt");
    await writeFile(filePath, "keep\nremove\n", "utf8");

    const result = await gooseEditTool.call({ path: filePath, before: "remove\n", after: "" });
    const updated = await readFile(filePath, "utf8");

    assert.match(String(result), /Edited .* \(1 lines -> 0 lines\)/);
    assert.equal(updated, "keep\n");
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

test("goose shell tool supports timeout_secs", async () => {
  const raw = await gooseShellTool.call({ command: "sleep 2", timeout_secs: 1 });
  const observation = gooseShellTool.interpreter(raw);

  assert.equal(observation.error, "shell timed out");
  assert.match(observation.content, /timed_out: true/);
});
