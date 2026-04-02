import assert from "node:assert/strict";
import test from "node:test";
import { ClineActionParser } from "../../packages/agents/cline/src/actionParser";
import { ClineContextStrategy } from "../../packages/agents/cline/src/contextStrategy";
import { ClinePromptBuilder } from "../../packages/agents/cline/src/promptBuilder";
import { CLINE_MINIMAL_TOOLS } from "../../packages/agents/cline/src/toolPreset";
import type { Context } from "../src/core/types";

test("cline parser parses execute_command blocks", () => {
  const parser = new ClineActionParser();
  const action = parser.parse(
    "<execute_command><command>pwd</command><requires_approval>false</requires_approval></execute_command>",
  );
  const args = action.args as Record<string, unknown>;

  assert.equal(action.name, "execute_command");
  assert.equal(args.command, "pwd");
  assert.equal(args.requires_approval, false);
});

test("cline parser maps attempt_completion to finish", () => {
  const parser = new ClineActionParser();
  const action = parser.parse(
    "<attempt_completion><result>done</result><command>npm test</command></attempt_completion>",
  );
  const args = action.args as Record<string, unknown>;

  assert.equal(action.name, "finish");
  assert.equal(args.result, "done");
  assert.equal(args.command, "npm test");
});

test("cline prompt builder renders XML tool usage and history", () => {
  const promptBuilder = new ClinePromptBuilder();
  const context: Context = {
    task: "Fix failing tests",
    step: 1,
    tokenCount: 0,
    entries: [
      { role: "assistant", content: "<read_file><path>src/a.ts</path></read_file>", metadata: {} },
      { role: "tool", content: "file contents", metadata: {} },
    ],
  };

  const prompt = promptBuilder.build("Fix failing tests", CLINE_MINIMAL_TOOLS, context);

  assert.match(prompt, /# Tool Use Formatting/);
  assert.match(prompt, /<execute_command>/);
  assert.match(prompt, /\[tool_result\]/);
});

test("cline context strategy keeps assistant and tool entries paired", () => {
  const strategy = new ClineContextStrategy(15);
  const context: Context = {
    task: "abc",
    step: 2,
    tokenCount: 0,
    entries: [
      { role: "assistant", content: "first assistant message", metadata: {} },
      { role: "tool", content: "first tool result", metadata: {} },
      { role: "assistant", content: "second assistant message", metadata: {} },
      { role: "tool", content: "second tool result", metadata: {} },
    ],
  };

  const trimmed = strategy.trim(context);

  assert.deepEqual(
    trimmed.entries.map((entry) => entry.content),
    ["second assistant message", "second tool result"],
  );
});
