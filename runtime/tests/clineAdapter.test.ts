import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClineActionParser } from "../../packages/agents/cline/src/actionParser";
import { ClineContextStrategy } from "../../packages/agents/cline/src/contextStrategy";
import { ClinePromptBuilder } from "../../packages/agents/cline/src/promptBuilder";
import { CLINE_PROMPT_TOOL_SPECS, getClinePromptToolSpec } from "../../packages/agents/cline/src/toolPromptSpec";
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

test("cline parser preserves full write_to_file content", () => {
  const parser = new ClineActionParser();
  const action = parser.parse(
    [
      "<write_to_file>",
      "<path>index.html</path>",
      "<content>",
      "<div>Hello</div>",
      "</content>",
      "</write_to_file>",
    ].join("\n"),
  );
  const args = action.args as Record<string, unknown>;

  assert.equal(action.name, "write_to_file");
  assert.equal(args.path, "index.html");
  assert.equal(args.content, "<div>Hello</div>");
});

test("cline parser parses search_files with file_pattern and list_files booleans", () => {
  const parser = new ClineActionParser();
  const search = parser.parse(
    "<search_files><path>src</path><regex>foo</regex><file_pattern>*.ts</file_pattern></search_files>",
  );
  const list = parser.parse(
    "<list_files><path>src</path><recursive>true</recursive></list_files>",
  );

  assert.deepEqual(search.args, {
    path: "src",
    regex: "foo",
    file_pattern: "*.ts",
  });
  assert.deepEqual(list.args, {
    path: "src",
    recursive: true,
  });
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

test("cline prompt builder renders XML tool usage and editing guidance", () => {
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
  assert.match(prompt, /file_pattern/);
  assert.match(prompt, /final_file_content/);
  assert.match(prompt, /\[tool_result\]/);
});

test("cline prompt-facing tool specs are modular and cover the migrated tools", () => {
  const promptFacingNames = Object.keys(CLINE_PROMPT_TOOL_SPECS).sort();
  const migratedToolNames = [...CLINE_MINIMAL_TOOLS.map((tool) => tool.name), "finish"].sort();

  assert.deepEqual(promptFacingNames, migratedToolNames);
  assert.equal(getClinePromptToolSpec(CLINE_MINIMAL_TOOLS[0]).name, "execute_command");
  assert.equal(getClinePromptToolSpec({ ...CLINE_MINIMAL_TOOLS[0], name: "finish" }).name, "attempt_completion");
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

test("cline file editing tools return final_file_content for future edits", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cline-adapter-"));
  const filePath = join(tempDir, "sample.ts");
  const writeTool = CLINE_MINIMAL_TOOLS.find((tool) => tool.name === "write_to_file");
  const replaceTool = CLINE_MINIMAL_TOOLS.find((tool) => tool.name === "replace_in_file");

  assert.ok(writeTool);
  assert.ok(replaceTool);

  const writeResult = String(
    await writeTool!.call({ path: filePath, content: 'export const name = "john"\n' }),
  );
  assert.match(writeResult, /<final_file_content path=/);
  assert.match(writeResult, /export const name = "john"/);

  const replaceResult = String(
    await replaceTool!.call({
      path: filePath,
      diff: [
        "------- SEARCH",
        'export const name = "john"',
        "=======",
        'export const name = "cline"',
        "+++++++ REPLACE",
      ].join("\n"),
    }),
  );

  assert.match(replaceResult, /IMPORTANT: For any future changes to this file/);
  assert.match(replaceResult, /export const name = "cline"/);
  assert.equal(await readFile(filePath, "utf8"), 'export const name = "cline"\n');
});

test("cline list_files includes directories and search_files respects file_pattern", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cline-adapter-files-"));
  await writeFile(join(tempDir, "root.txt"), "root\n", "utf8");
  await writeFile(join(tempDir, "note.md"), "note\n", "utf8");
  await writeFile(join(tempDir, "src.ts"), "const outside = 1\n", "utf8");
  await writeFile(join(tempDir, "src-placeholder"), "", "utf8");
  await writeFile(join(tempDir, "other.js"), "foo();\n", "utf8");
  await writeFile(join(tempDir, "match.ts"), "const foo = 1\n", "utf8");

  // create directory after files to avoid extra mkdir import in adapter tests
  const nestedDir = await mkdtemp(join(tempDir, "src-dir-"));
  const listTool = CLINE_MINIMAL_TOOLS.find((tool) => tool.name === "list_files");
  const searchTool = CLINE_MINIMAL_TOOLS.find((tool) => tool.name === "search_files");

  assert.ok(listTool);
  assert.ok(searchTool);

  const listOutput = String(await listTool!.call({ path: tempDir, recursive: false }));
  assert.match(listOutput, /root\.txt/);
  assert.match(listOutput, new RegExp(`${nestedDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));

  const searchOutput = String(
    await searchTool!.call({
      path: tempDir,
      regex: "foo",
      file_pattern: "*.ts",
    }),
  );

  assert.match(searchOutput, /match\.ts/);
  assert.doesNotMatch(searchOutput, /other\.js/);
  assert.doesNotMatch(searchOutput, /root\.txt/);
});
