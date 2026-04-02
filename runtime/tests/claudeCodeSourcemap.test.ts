import assert from "node:assert/strict";
import test from "node:test";
import {
  ClaudeCodeSourcemapActionParser,
} from "../../packages/agents/claude-code-sourcemap/src/actionParser";
import {
  ClaudeCodeSourcemapPromptBuilder,
} from "../../packages/agents/claude-code-sourcemap/src/promptBuilder";
import { createClaudeCodeSourcemapToolPreset } from "../../packages/agents/claude-code-sourcemap/src/toolPreset";

test("claude-code-sourcemap parser handles function_calls envelope", () => {
  const parser = new ClaudeCodeSourcemapActionParser();
  const action = parser.parse(
    '<function_calls>\n<invoke name="Bash">\n{"command":"pwd"}\n</invoke>\n</function_calls>',
  );

  assert.equal(action.name, "Bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("claude-code-sourcemap prompt renders function list and xml contract", () => {
  const promptBuilder = new ClaudeCodeSourcemapPromptBuilder();
  const tools = createClaudeCodeSourcemapToolPreset();
  const context = { task: "inspect repo", entries: [], step: 0, tokenCount: 0 };

  const prompt = promptBuilder.build("inspect repo", tools, context);

  assert.match(prompt, /<functions>/);
  assert.match(prompt, /"name":"Bash"/);
  assert.match(prompt, /<function_calls>/);
  assert.match(prompt, /Runtime prompt and tool descriptions are in English only/);
});

test("claude-code-sourcemap tool preset exposes source-like tool names", () => {
  const tools = createClaudeCodeSourcemapToolPreset();
  const readToolRequired = (tools[1]?.argsSchema as { required?: string[] }).required ?? [];

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["Bash", "Read", "Write", "Edit", "Grep"],
  );
  assert.equal(readToolRequired[0], "file_path");
});
