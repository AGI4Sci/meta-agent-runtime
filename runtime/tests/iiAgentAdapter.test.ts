import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime } from "../src/core/runtime";
import type { LLMClient } from "../src/core/interfaces";
import {
  IIAgentActionParser,
  IIAgentContextStrategy,
  IIAgentPromptBuilder,
  createIIAgentToolPreset,
  findLatestTodoSnapshot,
} from "../../packages/agents/ii-agent/src";

test("ii-agent parser accepts native-style tool envelopes", () => {
  const parser = new IIAgentActionParser();
  const action = parser.parse('{"tool_name":"Bash","tool_input":{"command":"pwd"}}');
  assert.equal(action.name, "Bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("ii-agent parser extracts fenced json", () => {
  const parser = new IIAgentActionParser();
  const action = parser.parse('```json\n{"name":"Read","args":{"file_path":"README.md"}}\n```');
  assert.equal(action.name, "Read");
  assert.deepEqual(action.args, { file_path: "README.md" });
});

test("ii-agent parser maps plain text completion to finish", () => {
  const parser = new IIAgentActionParser();
  const action = parser.parse("Task completed successfully.");
  assert.equal(action.name, "finish");
  assert.deepEqual(action.args, { result: "Task completed successfully." });
});

test("ii-agent prompt builder renders task, tools, and history", () => {
  const builder = new IIAgentPromptBuilder();
  const prompt = builder.build("Inspect the repository", createIIAgentToolPreset(), {
    task: "Inspect the repository",
    entries: [{ role: "tool", content: "README.md contents", metadata: {} }],
    step: 1,
    tokenCount: 10,
  });
  assert.match(prompt, /You are II Agent/);
  assert.match(prompt, /TodoWrite/);
  assert.match(prompt, /README\.md contents/);
});

test("ii-agent context strategy keeps todo state while trimming recent history", () => {
  const strategy = new IIAgentContextStrategy(20);
  const trimmed = strategy.trim({
    task: "task",
    entries: [
      { role: "tool", content: "Todo list updated:\n- [pending|high] 1. Inspect project", metadata: {} },
      { role: "assistant", content: "older content that should drop", metadata: {} },
      { role: "tool", content: "recent", metadata: {} },
    ],
    step: 2,
    tokenCount: 999,
  });

  assert.equal(trimmed.entries.length, 2);
  assert.match(trimmed.entries[0]?.content ?? "", /Todo list updated:/);
  assert.equal(trimmed.entries[1]?.content, "recent");
});

test("ii-agent todo snapshot detection is shared across modules", () => {
  const entries = [
    { role: "tool" as const, content: "other tool output", metadata: {} },
    { role: "tool" as const, content: "Current todo list:\n- [pending|medium] 1. Check tests", metadata: {} },
  ];

  assert.equal(findLatestTodoSnapshot(entries)?.content, entries[1]?.content);
});

test("ii-agent preset runs a minimal tool loop", async () => {
  class ScriptedLLM implements LLMClient {
    private calls = 0;

    complete(): string {
      this.calls += 1;
      if (this.calls === 1) {
        return '{"tool_name":"Bash","tool_input":{"command":"printf hello"}}';
      }
      return "done";
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  const runtime = new AgentRuntime({
    llm: new ScriptedLLM(),
    tools: createIIAgentToolPreset(),
    promptBuilder: new IIAgentPromptBuilder(),
    actionParser: new IIAgentActionParser(),
    contextStrategy: new IIAgentContextStrategy(),
    config: { maxSteps: 4, maxTokens: 10_000 },
  });

  const result = await runtime.run("say hello");
  assert.equal(result.success, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.action.name, "Bash");
  assert.equal(result.steps[0]?.observation.content, "hello");
  assert.equal(result.result, "done");
});

test("ii-agent preset exposes source-faithful tool names and todo tools", () => {
  const tools = createIIAgentToolPreset();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["Bash", "Read", "Write", "Edit", "Grep", "TodoWrite", "TodoRead"],
  );
});
