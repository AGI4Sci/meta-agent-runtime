import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeInterpreter, safeObservation } from "../../../../runtime/src/core/toolSpec";

const execFileAsync = promisify(execFile);
const DEFAULT_READ_LIMIT = 2_000;
const DEFAULT_BASH_TIMEOUT_MS = 2 * 60 * 1000;

export const OPEN_CODE_TOOL_NAMES = [
  "bash",
  "read",
  "edit",
  "write",
  "grep",
  "glob",
] as const;

export type OpenCodeToolName = (typeof OPEN_CODE_TOOL_NAMES)[number];

function resolveFromWorkspace(input: unknown): string {
  return path.isAbsolute(String(input)) ? String(input) : path.resolve(process.cwd(), String(input));
}

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

export const openCodeBashTool = stringTool(
  "bash",
  "Execute a shell command in the current workspace. Prefer this for git, builds, tests, and scripts.",
  {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "number" },
      workdir: { type: "string" },
      description: { type: "string" },
    },
    required: ["command"],
  },
  async (args) => {
    const command = String(args.command);
    const cwd = typeof args.workdir === "string" ? resolveFromWorkspace(args.workdir) : process.cwd();
    const timeout =
      typeof args.timeout === "number" && Number.isFinite(args.timeout) && args.timeout >= 0
        ? Math.floor(args.timeout)
        : DEFAULT_BASH_TIMEOUT_MS;
    const description = typeof args.description === "string" ? args.description : "";

    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(command, {
        shell: process.env.SHELL || "/bin/zsh",
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, timeout + 100);

      proc.stdout?.on("data", (chunk) => {
        output += chunk.toString();
      });
      proc.stderr?.on("data", (chunk) => {
        output += chunk.toString();
      });
      proc.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      proc.once("close", (code) => {
        clearTimeout(timer);
        const metadata: string[] = [];
        if (description) metadata.push(`Description: ${description}`);
        if (timedOut) metadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`);
        if (code !== null) metadata.push(`Exit code: ${code}`);
        const suffix = metadata.length > 0 ? `\n\n<bash_metadata>\n${metadata.join("\n")}\n</bash_metadata>` : "";
        resolve(`${output.trim()}${suffix}`.trim());
      });
    });
  },
);

export const openCodeReadTool = stringTool(
  "read",
  "Read a text file or list a directory. Supports line offset and limit.",
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
    const filePath = resolveFromWorkspace(args.filePath);
    const start = Math.max(1, typeof args.offset === "number" ? Math.floor(args.offset) : 1);
    const limit = Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : DEFAULT_READ_LIMIT);
    const info = await stat(filePath);

    if (info.isDirectory()) {
      const entries = (await readdir(filePath)).sort((a, b) => a.localeCompare(b));
      const slice = entries.slice(start - 1, start - 1 + limit);
      const truncated = start - 1 + slice.length < entries.length;
      return [
        `<path>${filePath}</path>`,
        "<type>directory</type>",
        "<entries>",
        slice.join("\n"),
        truncated
          ? `\n(Showing ${slice.length} of ${entries.length} entries. Use offset=${start + slice.length} to continue.)`
          : `\n(${entries.length} entries)`,
        "</entries>",
      ].join("\n");
    }

    const source = await readFile(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    if (lines.length < start && !(lines.length === 0 && start === 1)) {
      throw new Error(`Offset ${start} is out of range for this file (${lines.length} lines)`);
    }
    const slice = lines.slice(start - 1, start - 1 + limit);
    const numbered = slice.map((line, index) => `${start + index}: ${line}`);
    const truncated = start - 1 + slice.length < lines.length;
    return [
      `<path>${filePath}</path>`,
      "<type>file</type>",
      "<content>",
      ...numbered,
      "",
      truncated
        ? `(Showing lines ${start}-${start + slice.length - 1} of ${lines.length}. Use offset=${start + slice.length} to continue.)`
        : `(End of file - total ${lines.length} lines)`,
      "</content>",
    ].join("\n");
  },
);

export const openCodeEditTool = stringTool(
  "edit",
  "Replace one substring in a UTF-8 text file.",
  {
    type: "object",
    properties: {
      filePath: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["filePath", "oldString", "newString"],
  },
  async (args) => {
    const filePath = resolveFromWorkspace(args.filePath);
    const oldString = String(args.oldString);
    const newString = String(args.newString);
    const replaceAll = args.replaceAll === true;
    const source = await readFile(filePath, "utf8");

    if (oldString === newString) {
      throw new Error("No changes to apply: oldString and newString are identical.");
    }
    if (!source.includes(oldString)) {
      throw new Error(`String not found in ${filePath}`);
    }

    const replaced = replaceAll ? source.split(oldString).join(newString) : source.replace(oldString, newString);
    await writeFile(filePath, replaced, "utf8");
    return "Edit applied successfully.";
  },
);

export const openCodeWriteTool = stringTool(
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
    const filePath = resolveFromWorkspace(args.filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, String(args.content), "utf8");
    return "Wrote file successfully.";
  },
);

export const openCodeGrepTool = stringTool(
  "grep",
  "Search file contents with ripgrep. Supports an optional include glob.",
  {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      include: { type: "string" },
    },
    required: ["pattern"],
  },
  async (args) => {
    const pattern = String(args.pattern);
    const targetPath = typeof args.path === "string" ? resolveFromWorkspace(args.path) : process.cwd();
    const commandArgs = ["-nH", "--hidden", "--no-messages", "--regexp", pattern];
    if (typeof args.include === "string") {
      commandArgs.push("--glob", args.include);
    }
    commandArgs.push(targetPath);

    try {
      const { stdout, stderr } = await execFileAsync("rg", commandArgs, { cwd: process.cwd() });
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
    } catch (error) {
      const cast = error as { stdout?: string; stderr?: string; code?: number };
      if (cast.code === 1) {
        return "No files found";
      }
      return `${cast.stdout ?? ""}\n${cast.stderr ?? ""}`.trim();
    }
  },
);

export const openCodeGlobTool = stringTool(
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
    const base = typeof args.path === "string" ? resolveFromWorkspace(args.path) : process.cwd();
    try {
      const { stdout, stderr } = await execFileAsync("rg", ["--files", "-g", pattern, base], { cwd: process.cwd() });
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
    } catch (error) {
      const cast = error as { stdout?: string; stderr?: string; code?: number };
      if (cast.code === 1) {
        return "No files found";
      }
      return `${cast.stdout ?? ""}\n${cast.stderr ?? ""}`.trim();
    }
  },
);

const OPEN_CODE_TOOLSET: Record<OpenCodeToolName, ToolSpec> = {
  bash: openCodeBashTool,
  read: openCodeReadTool,
  edit: openCodeEditTool,
  write: openCodeWriteTool,
  grep: openCodeGrepTool,
  glob: openCodeGlobTool,
};

export const openCodeToolPreset: ToolSpec[] = [...OPEN_CODE_TOOL_NAMES].map((name) => OPEN_CODE_TOOLSET[name]);

export function createOpenCodeToolPreset(options?: {
  include?: readonly OpenCodeToolName[];
}): ToolSpec[] {
  const include = options?.include ?? OPEN_CODE_TOOL_NAMES;
  return [...include].map((name) => OPEN_CODE_TOOLSET[name]);
}
