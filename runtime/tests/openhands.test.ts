import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenHandsActionParser,
  createOpenHandsBashTool,
  createOpenHandsCondensationTool,
  createOpenHandsContextStrategy,
  createOpenHandsEditorTool,
  createOpenHandsIPythonTool,
  createOpenHandsPromptBuilder,
  createOpenHandsThinkTool,
  createOpenHandsTools,
} from "../../packages/agents/openhands/src";

test("openhands parser parses compatibility tool envelope", () => {
  const parser = createOpenHandsActionParser();
  const action = parser.parse(
    JSON.stringify({
      thought: "Inspect the workspace first.",
      tool: {
        name: "execute_bash",
        arguments: { command: "pwd" },
      },
    }),
  );

  assert.equal(action.name, "execute_bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("openhands parser accepts tool_calls function envelope", () => {
  const parser = createOpenHandsActionParser();
  const action = parser.parse(
    JSON.stringify({
      content: "Inspect first",
      tool_calls: [
        {
          function: {
            name: "execute_bash",
            arguments: JSON.stringify({ command: "pwd", security_risk: "LOW" }),
          },
        },
      ],
    }),
  );

  assert.equal(action.name, "execute_bash");
  assert.deepEqual(action.args, { command: "pwd", security_risk: "LOW" });
});

test("openhands parser normalizes finish message to runtime finish args", () => {
  const parser = createOpenHandsActionParser();
  const action = parser.parse(
    JSON.stringify({
      name: "finish",
      arguments: { message: "done" },
    }),
  );

  assert.equal(action.name, "finish");
  assert.deepEqual(action.args, { result: "done" });
});

test("openhands prompt builder includes compatibility constraints", () => {
  const prompt = createOpenHandsPromptBuilder().build(
    "Fix the failing test",
    createOpenHandsTools(),
    {
      task: "Fix the failing test",
      entries: [],
      step: 0,
      tokenCount: 0,
    },
  );

  assert.match(prompt, /single-threaded/i);
  assert.match(prompt, /Return exactly one JSON object/);
  assert.match(prompt, /security_risk/i);
  assert.match(prompt, /undo_edit/);
  assert.match(prompt, /execute_bash/);
});

test("openhands context strategy trims old entries in pairs", () => {
  const strategy = createOpenHandsContextStrategy({ max_tokens: 20 });
  const trimmed = strategy.trim({
    task: "short task",
    step: 3,
    tokenCount: 100,
    entries: [
      { role: "assistant", content: "old assistant output", metadata: {} },
      { role: "tool", content: "old tool output", metadata: {} },
      { role: "assistant", content: "recent assistant output", metadata: {} },
      { role: "tool", content: "recent tool output", metadata: {} },
    ],
  });

  assert.equal(trimmed.entries[0]?.metadata.condensed, true);
  assert.match(trimmed.entries.at(-1)?.content ?? "", /recent tool output/);
});

test("openhands tools preserve source-like schemas for bash and editor", async () => {
  const tools = createOpenHandsTools();
  const bash = tools.find((tool) => tool.name === "execute_bash");
  const editor = tools.find((tool) => tool.name === "str_replace_editor");

  assert.ok(bash);
  assert.ok(editor);
  assert.deepEqual((bash?.argsSchema.required as string[]).sort(), ["command", "security_risk"]);
  assert.deepEqual((editor?.argsSchema.required as string[]).sort(), ["command", "path", "security_risk"]);
});

test("openhands tool factories are individually exportable for ablation studies", () => {
  const names = [
    createOpenHandsBashTool().name,
    createOpenHandsIPythonTool().name,
    createOpenHandsEditorTool().name,
    createOpenHandsThinkTool().name,
    createOpenHandsCondensationTool().name,
  ];

  assert.deepEqual(names, [
    "execute_bash",
    "execute_ipython_cell",
    "str_replace_editor",
    "think",
    "request_condensation",
  ]);
});

test("openhands editor supports create, unique str_replace, and undo_edit", async () => {
  const editor = createOpenHandsTools().find((tool) => tool.name === "str_replace_editor");
  assert.ok(editor);

  const root = await import("node:fs/promises").then((fs) => fs.mkdtemp("/tmp/openhands-editor-"));
  const path = `${root}/sample.txt`;

  try {
    await editor!.call({
      command: "create",
      path,
      file_text: "alpha\nbeta\nbeta\n",
      security_risk: "LOW",
    });

    await assert.rejects(
      async () =>
        editor!.call({
          command: "str_replace",
          path,
          old_str: "beta",
          new_str: "gamma",
          security_risk: "LOW",
        }),
      /matched 2 locations/i,
    );

    await editor!.call({
      command: "str_replace",
      path,
      old_str: "alpha\nbeta",
      new_str: "alpha\ngamma",
      security_risk: "LOW",
    });

    await editor!.call({
      command: "undo_edit",
      path,
      security_risk: "LOW",
    });

    const content = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    assert.equal(content, "alpha\nbeta\nbeta\n");
  } finally {
    await import("node:fs/promises").then((fs) => fs.rm(root, { recursive: true, force: true }));
  }
});

test("openhands tool presets isolate state between runs", async () => {
  const first = createOpenHandsTools();
  const second = createOpenHandsTools();
  const firstBash = first.find((tool) => tool.name === "execute_bash");
  const secondBash = second.find((tool) => tool.name === "execute_bash");

  assert.ok(firstBash);
  assert.ok(secondBash);

  const firstMove = await firstBash!.call({ command: "cd /tmp && pwd", security_risk: "LOW" });
  const firstAgain = await firstBash!.call({ command: "pwd", security_risk: "LOW" });
  const secondFresh = await secondBash!.call({ command: "pwd", security_risk: "LOW" });

  assert.equal((firstMove as { metadata?: { workingDir?: string } }).metadata?.workingDir, "/tmp");
  assert.equal((firstAgain as { metadata?: { workingDir?: string } }).metadata?.workingDir, "/tmp");
  assert.notEqual(
    (secondFresh as { metadata?: { workingDir?: string } }).metadata?.workingDir,
    "/tmp",
  );
});
