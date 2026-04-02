import { execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeInterpreter, safeObservation } from "../../../../runtime/src/core/toolSpec";

const execFileAsync = promisify(execFile);

function stringTool(
  name: string,
  description: string,
  argsSchema: Record<string, unknown>,
  call: ToolSpec["call"],
): ToolSpec {
  return {
    name,
    description,
    argsSchema,
    call,
    interpreter: safeInterpreter((raw) => safeObservation(String(raw ?? ""))),
  };
}

const bash = stringTool(
  "bash",
  "Execute a shell command in the current workspace and return stdout/stderr.",
  {
    type: "object",
    properties: {
      command: { type: "string" },
      workdir: { type: "string" },
    },
    required: ["command"],
  },
  async (args) => {
    const command = String(args.command);
    const cwd = typeof args.workdir === "string" ? args.workdir : process.cwd();
    const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

const read = stringTool(
  "read",
  "Read a text file or list a directory. Supports optional line offset and limit.",
  {
    type: "object",
    properties: {
      filePath: { type: "string" },
      offset: { type: "number" },
      limit: { type: "number" },
    },
    required: ["filePath"],
  },
  async (args) => {
    const filePath = path.resolve(String(args.filePath));
    const start = Math.max(1, typeof args.offset === "number" ? Math.floor(args.offset) : 1);
    const limit = Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : 200);
    const info = await stat(filePath);

    if (info.isDirectory()) {
      const entries = (await readdir(filePath)).sort((a, b) => a.localeCompare(b));
      const slice = entries.slice(start - 1, start - 1 + limit);
      const suffix =
        start - 1 + slice.length < entries.length
          ? `(Showing ${slice.length} of ${entries.length} entries. Use offset=${start + slice.length} to continue.)`
          : `(${entries.length} entries)`;
      return ["<path>" + filePath + "</path>", "<type>directory</type>", "<entries>", ...slice, suffix, "</entries>"].join(
        "\n",
      );
    }

    const source = await readFile(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    const slice = lines.slice(start - 1, start - 1 + limit);
    const numbered = slice.map((line, index) => `${start + index}: ${line}`);
    const suffix =
      start - 1 + slice.length < lines.length
        ? `(Showing lines ${start}-${start + slice.length - 1} of ${lines.length}. Use offset=${start + slice.length} to continue.)`
        : `(End of file - total ${lines.length} lines)`;
    return ["<path>" + filePath + "</path>", "<type>file</type>", "<content>", ...numbered, suffix, "</content>"].join(
      "\n",
    );
  },
);

const edit = stringTool(
  "edit",
  "Replace one substring in a UTF-8 text file.",
  {
    type: "object",
    properties: {
      filePath: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
    },
    required: ["filePath", "oldString", "newString"],
  },
  async (args) => {
    const filePath = path.resolve(String(args.filePath));
    const oldString = String(args.oldString);
    const newString = String(args.newString);
    const source = await readFile(filePath, "utf8");
    if (!source.includes(oldString)) {
      throw new Error(`String not found in ${filePath}`);
    }
    await writeFile(filePath, source.replace(oldString, newString), "utf8");
    return `Edited ${filePath}`;
  },
);

const write = stringTool(
  "write",
  "Write UTF-8 text content to a file, replacing existing content.",
  {
    type: "object",
    properties: {
      filePath: { type: "string" },
      content: { type: "string" },
    },
    required: ["filePath", "content"],
  },
  async (args) => {
    const filePath = path.resolve(String(args.filePath));
    await writeFile(filePath, String(args.content), "utf8");
    return `Wrote ${filePath}`;
  },
);

const grep = stringTool(
  "grep",
  "Search file contents with ripgrep.",
  {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
    },
    required: ["pattern"],
  },
  async (args) => {
    const pattern = String(args.pattern);
    const targetPath = typeof args.path === "string" ? String(args.path) : ".";
    const { stdout, stderr } = await execFileAsync("rg", ["-n", pattern, targetPath], { cwd: process.cwd() });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

const glob = stringTool(
  "glob",
  "List files matching a glob pattern.",
  {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
    },
    required: ["pattern"],
  },
  async (args) => {
    const pattern = String(args.pattern);
    const base = typeof args.path === "string" ? String(args.path) : ".";
    const { stdout, stderr } = await execFileAsync("rg", ["--files", "-g", pattern, base], { cwd: process.cwd() });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

export const openCodeToolPreset: ToolSpec[] = [bash, read, edit, write, grep, glob];
