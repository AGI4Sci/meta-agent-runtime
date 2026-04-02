import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenCodeActionParser } from "../../packages/agents/opencode/src/actionParser";
import { OpenCodeContextStrategy } from "../../packages/agents/opencode/src/contextStrategy";
import { OpenCodePromptBuilder } from "../../packages/agents/opencode/src/promptBuilder";
import { openCodeToolPreset } from "../../packages/agents/opencode/src/toolPreset";
import { AgentRuntime } from "../src/core/runtime";
import type { LLMClient } from "../src/core/interfaces";

test("opencode parser parses tool/input payload", () => {
  const parser = new OpenCodeActionParser();
  const action = parser.parse('{"tool":"read","input":{"filePath":"README.md"}}');
  assert.equal(action.name, "read");
  assert.deepEqual(action.args, { filePath: "README.md" });
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
