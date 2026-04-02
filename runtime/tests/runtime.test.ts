import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenCodeContextStrategy } from "../../packages/agents/opencode/src/contextStrategy";
import { OpenCodePromptBuilder } from "../../packages/agents/opencode/src/promptBuilder";
import { openCodeToolPreset } from "../../packages/agents/opencode/src/toolPreset";
import { AgentRuntime } from "../src/core/runtime";
import type {
  ActionParser,
  ContextStrategy,
  LLMClient,
  PromptBuilder,
} from "../src/core/interfaces";
import type { Context } from "../src/core/types";
import type { ToolSpec } from "../src/core/toolSpec";
import { NoopContextStrategy } from "../src/context/noop";
import { MinimalPromptBuilder } from "../src/prompt/minimal";

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
  build(task: string, _tools: ToolSpec[], _context: Context): string {
    return task;
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

test("minimal prompt renders english tool descriptions", () => {
  const promptBuilder = new MinimalPromptBuilder();
  const tool: ToolSpec = {
    name: "demo_tool",
    description: "English tool description",
    argsSchema: { type: "object", properties: {} },
    call: () => "",
    interpreter: () => ({ content: "", error: null, metadata: {} }),
  };
  const context = { task: "t", entries: [], step: 0, tokenCount: 0 };

  const prompt = promptBuilder.build("task", [tool], context);

  assert.match(prompt, /English tool description/);
});

test("opencode prompt renders json action contract", () => {
  const promptBuilder = new OpenCodePromptBuilder();
  const prompt = promptBuilder.build("inspect the workspace", openCodeToolPreset, {
    task: "inspect the workspace",
    entries: [],
    step: 0,
    tokenCount: 0,
  });

  assert.match(prompt, /"tool":"<tool-name>"/);
  assert.match(prompt, /You are OpenCode/);
});

test("opencode tool preset supports read and write loop", async () => {
  const tmpdir = await mkdtemp(path.join(os.tmpdir(), "opencode-runtime-"));
  const target = path.join(tmpdir, "note.txt");

  await writeFile(target, "alpha\nbeta\n", "utf8");

  class OpenCodeStubLLM implements LLMClient {
    private calls = 0;

    complete(): string {
      this.calls += 1;
      if (this.calls === 1) {
        return JSON.stringify({ tool: "read", input: { filePath: target, offset: 1, limit: 1 } });
      }
      if (this.calls === 2) {
        return JSON.stringify({
          tool: "write",
          input: { filePath: target, content: "rewritten\n" },
        });
      }
      return JSON.stringify({ tool: "finish", input: { result: "done" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  const runtime = new AgentRuntime({
    llm: new OpenCodeStubLLM(),
    tools: openCodeToolPreset,
    promptBuilder: new OpenCodePromptBuilder(),
    actionParser: {
      parse(rawText: string) {
        const parsed = JSON.parse(rawText) as { tool: string; input?: Record<string, unknown> };
        return { name: parsed.tool, args: parsed.input ?? {}, rawText };
      },
    },
    contextStrategy: new OpenCodeContextStrategy(8_000),
  });

  const result = await runtime.run("Read a file, overwrite it, then finish.");
  const finalContent = await readFile(target, "utf8");

  assert.equal(result.success, true);
  assert.equal(result.terminationReason, "finish");
  assert.equal(finalContent, "rewritten\n");
});
