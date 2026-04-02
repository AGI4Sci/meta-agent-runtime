import assert from "node:assert/strict";
import test from "node:test";
import { safeObservation, type ToolSpec } from "../src/core/toolSpec";
import { createClaudeCodeSourcemapAdapter } from "../../packages/agents/claude-code-sourcemap/src/adapter";
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

test("claude-code-sourcemap parser accepts native tool_use json payloads", () => {
  const parser = new ClaudeCodeSourcemapActionParser();
  const action = parser.parse(
    '{"type":"tool_use","name":"Read","input":{"file_path":"/tmp/demo.txt","offset":3}}',
  );

  assert.equal(action.name, "Read");
  assert.deepEqual(action.args, { file_path: "/tmp/demo.txt", offset: 3 });
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
  const grepProperties = (tools[4]?.argsSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const editProperties = (tools[3]?.argsSchema as { properties?: Record<string, unknown> }).properties ?? {};

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["Bash", "Read", "Write", "Edit", "Grep"],
  );
  assert.equal(readToolRequired[0], "file_path");
  assert.ok("offset" in grepProperties === false);
  assert.ok("output_mode" in grepProperties);
  assert.ok("replace_all" in editProperties);
});

test("claude-code-sourcemap adapter keeps research knobs explicit", () => {
  const customTool: ToolSpec = {
    name: "CustomReadOnlyTool",
    description: "Synthetic tool for ablation tests.",
    argsSchema: { type: "object", properties: {} },
    call: () => "ok",
    interpreter: (raw) => safeObservation(String(raw ?? "")),
  };
  const adapter = createClaudeCodeSourcemapAdapter({
    maxContextEntries: 2,
    tools: [customTool],
  });
  const trimmed = adapter.contextStrategy.trim({
    task: "task",
    step: 0,
    tokenCount: 0,
    entries: [
      { role: "assistant", content: "step 1", metadata: {} },
      { role: "assistant", content: "step 2", metadata: {} },
      { role: "assistant", content: "step 3", metadata: {} },
    ],
  });

  assert.equal(adapter.name, "claude-code-sourcemap");
  assert.deepEqual(adapter.tools.map((tool) => tool.name), ["CustomReadOnlyTool"]);
  assert.equal(trimmed.entries.length, 2);
  assert.deepEqual(
    trimmed.entries.map((entry) => entry.content),
    ["step 2", "step 3"],
  );
});
