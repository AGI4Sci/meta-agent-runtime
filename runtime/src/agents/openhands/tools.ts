import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ToolSpec } from "../../core/toolSpec";
import { safeObservation } from "../../core/toolSpec";

const execFileAsync = promisify(execFile);

interface CommandResult {
  content: string;
  exitCode: number;
}

export const openHandsBashTool: ToolSpec = {
  name: "execute_bash",
  description:
    "Execute a bash command in the workspace. Use this for shell inspection, tests, and repository operations.",
  argsSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["command"],
  },
  async call(args) {
    return runCommand(String(args.command), typeof args.cwd === "string" ? args.cwd : process.cwd());
  },
  interpreter(raw) {
    const result = raw as CommandResult;
    return safeObservation(result.content, result.exitCode === 0 ? null : `Command exited with code ${result.exitCode}`, {
      exitCode: result.exitCode,
    });
  },
};

export const openHandsIPythonTool: ToolSpec = {
  name: "execute_ipython_cell",
  description:
    "Execute a Python code cell. Use this when a task is naturally solved with short Python snippets instead of shell pipelines.",
  argsSchema: {
    type: "object",
    properties: {
      code: { type: "string" },
    },
    required: ["code"],
  },
  async call(args) {
    return runCommand(`python3 -c ${shellQuote(String(args.code))}`);
  },
  interpreter(raw) {
    const result = raw as CommandResult;
    return safeObservation(result.content, result.exitCode === 0 ? null : `Python exited with code ${result.exitCode}`, {
      exitCode: result.exitCode,
    });
  },
};

export const openHandsEditorTool: ToolSpec = {
  name: "str_replace_editor",
  description:
    "OpenHands-compatible editor. Supported commands: view, create, str_replace, insert.",
  argsSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      path: { type: "string" },
      file_text: { type: "string" },
      old_str: { type: "string" },
      new_str: { type: "string" },
      insert_line: { type: "number" },
      view_range: { type: "array" },
    },
    required: ["command", "path"],
  },
  async call(args) {
    const command = String(args.command);
    const path = String(args.path);

    if (command === "view") {
      const source = await readFile(path, "utf8");
      return viewRange(source, args.view_range);
    }

    if (command === "create") {
      const fileText = typeof args.file_text === "string" ? args.file_text : "";
      await writeFile(path, fileText, "utf8");
      return `Created ${path}`;
    }

    if (command === "str_replace") {
      const oldStr = String(args.old_str ?? "");
      const newStr = String(args.new_str ?? "");
      const source = await readFile(path, "utf8");
      if (!source.includes(oldStr)) {
        throw new Error(`String not found in ${path}`);
      }
      await writeFile(path, source.replace(oldStr, newStr), "utf8");
      return `Updated ${path}`;
    }

    if (command === "insert") {
      const newStr = String(args.new_str ?? "");
      const insertLine = Number(args.insert_line ?? 0);
      const source = await readFile(path, "utf8");
      const lines = source.split("\n");
      const index = Math.max(0, Math.min(lines.length, insertLine));
      lines.splice(index, 0, newStr);
      await writeFile(path, lines.join("\n"), "utf8");
      return `Inserted content into ${path}`;
    }

    throw new Error(`Unsupported editor command: ${command}`);
  },
  interpreter(raw) {
    return safeObservation(String(raw ?? ""), null, {});
  },
};

export const openHandsThinkTool: ToolSpec = {
  name: "think",
  description: "Record private reasoning in the trace without changing the workspace.",
  argsSchema: {
    type: "object",
    properties: {
      thought: { type: "string" },
    },
    required: ["thought"],
  },
  call: (args) => `Thought recorded: ${String(args.thought ?? "")}`,
  interpreter: (raw) => safeObservation(String(raw ?? ""), null, { ephemeral: true }),
};

export const openHandsCondensationTool: ToolSpec = {
  name: "request_condensation",
  description:
    "Request history condensation. In the shared runtime this is a compatibility shim and returns a status message.",
  argsSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  call: () => "History condensation is handled by the selected ContextStrategy in meta-agent-runtime.",
  interpreter: (raw) => safeObservation(String(raw ?? ""), null, { compatibilityShim: true }),
};

export const OPENHANDS_MINIMAL_TOOLS: ToolSpec[] = [
  openHandsBashTool,
  openHandsIPythonTool,
  openHandsEditorTool,
  openHandsThinkTool,
  openHandsCondensationTool,
];

async function runCommand(command: string, cwd = process.cwd()): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
    return {
      content: stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim(),
      exitCode: 0,
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };
    return {
      content: [failure.stdout, failure.stderr, failure.message].filter(Boolean).join("\n").trim(),
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

function viewRange(source: string, viewRange: unknown): string {
  if (!Array.isArray(viewRange) || viewRange.length !== 2) {
    return source;
  }

  const start = Math.max(1, Number(viewRange[0] ?? 1));
  const end = Math.max(start, Number(viewRange[1] ?? start));
  return source
    .split("\n")
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
