import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime } from "../src/core/runtime";
import type {
  ActionParser,
  ContextStrategy,
  LLMClient,
  PromptBuilder,
  PromptBuildOptions,
} from "../src/core/interfaces";
import type { Context } from "../src/core/types";
import type { ToolSpec } from "../src/core/toolSpec";
import { NoopContextStrategy } from "../src/context/noop";

class StubLLM implements LLMClient {
  private calls = 0;

  complete(): string {
    this.calls += 1;
    return this.calls === 1 ? JSON.stringify({ name: "finish", args: { result: "done" } }) : "";
  }

  countTokens(text: string): number {
    return text.length;
  }
}

class StubPromptBuilder implements PromptBuilder {
  build(task: string, _tools: ToolSpec[], _context: Context, options: PromptBuildOptions): string {
    return `${options.language}:${task}`;
  }
}

class StubActionParser implements ActionParser {
  parse(rawText: string) {
    const parsed = JSON.parse(rawText) as { name: string; args: Record<string, unknown> };
    return { name: parsed.name, args: parsed.args, rawText };
  }
}

test("runtime returns finish result", async () => {
  const runtime = new AgentRuntime({
    llm: new StubLLM(),
    tools: [],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
  });

  const result = await runtime.run("test task");
  assert.equal(result.success, true);
  assert.equal(result.terminationReason, "finish");
  assert.equal(result.result, "done");
});

test("runtime forwards prompt language to prompt builder", async () => {
  const runtime = new AgentRuntime({
    llm: new StubLLM(),
    tools: [],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
    promptOptions: { language: "en" },
  });

  const result = await runtime.run("test task");
  assert.equal(result.success, true);
  assert.equal(result.totalTokenIn > 0, true);
});
