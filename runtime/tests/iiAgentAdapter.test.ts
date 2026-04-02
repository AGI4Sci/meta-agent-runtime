import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime } from "../src/core/runtime";
import type { LLMClient } from "../src/core/interfaces";
import {
  IIAgentActionParser,
  IIAgentContextStrategy,
  IIAgentPromptBuilder,
  iiAgentToolPreset,
} from "../../packages/agents/ii-agent/src";

test("ii-agent parser accepts native-style tool envelopes", () => {
  const parser = new IIAgentActionParser();
  const action = parser.parse('{"tool_name":"ShellRunCommand","tool_input":{"command":"pwd"}}');
  assert.equal(action.name, "ShellRunCommand");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("ii-agent parser extracts fenced json", () => {
  const parser = new IIAgentActionParser();
  const action = parser.parse('```json\n{"name":"FileRead","args":{"path":"README.md"}}\n```');
  assert.equal(action.name, "FileRead");
  assert.deepEqual(action.args, { path: "README.md" });
});

test("ii-agent prompt builder renders task, tools, and history", () => {
  const builder = new IIAgentPromptBuilder();
  const prompt = builder.build("Inspect the repository", iiAgentToolPreset, {
    task: "Inspect the repository",
    entries: [{ role: "tool", content: "README.md contents", metadata: {} }],
    step: 1,
    tokenCount: 10,
  });
  assert.match(prompt, /You are II Agent/);
  assert.match(prompt, /ShellRunCommand/);
  assert.match(prompt, /README\.md contents/);
});

test("ii-agent context strategy keeps the newest history within budget", () => {
  const strategy = new IIAgentContextStrategy(8);
  const trimmed = strategy.trim({
    task: "task",
    entries: [
      { role: "assistant", content: "older content that should drop", metadata: {} },
      { role: "tool", content: "recent", metadata: {} },
    ],
    step: 2,
    tokenCount: 999,
  });

  assert.equal(trimmed.entries.length, 1);
  assert.equal(trimmed.entries[0]?.content, "recent");
});

test("ii-agent preset runs a minimal tool loop", async () => {
  class ScriptedLLM implements LLMClient {
    private calls = 0;

    complete(): string {
      this.calls += 1;
      if (this.calls === 1) {
        return '{"tool_name":"ShellRunCommand","tool_input":{"command":"printf hello"}}';
      }
      return '{"name":"finish","args":{"result":"done"}}';
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  const runtime = new AgentRuntime({
    llm: new ScriptedLLM(),
    tools: iiAgentToolPreset,
    promptBuilder: new IIAgentPromptBuilder(),
    actionParser: new IIAgentActionParser(),
    contextStrategy: new IIAgentContextStrategy(),
    config: { maxSteps: 4, maxTokens: 10_000 },
  });

  const result = await runtime.run("say hello");
  assert.equal(result.success, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.action.name, "ShellRunCommand");
  assert.equal(result.steps[0]?.observation.content, "hello");
});
