import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { stringTool } from "../../../../runtime/src/tools/common";
import { bashTool } from "../../../../runtime/src/tools/bash";
import { fileEditTool } from "../../../../runtime/src/tools/fileEdit";
import { fileReadTool } from "../../../../runtime/src/tools/fileRead";
import { fileWriteTool } from "../../../../runtime/src/tools/fileWrite";
import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function aliasTool(tool: ToolSpec, alias: { name: string; description: string }): ToolSpec {
  return {
    ...tool,
    name: alias.name,
    description: alias.description,
  };
}

const grepTool = stringTool(
  "grep",
  "Search file contents for patterns (respects .gitignore).",
  {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      glob: { type: "string" },
      ignoreCase: { type: "boolean" },
      literal: { type: "boolean" },
      context: { type: "number" },
      limit: { type: "number" },
    },
    required: ["pattern"],
  },
  async (args) => {
    const pathArg = typeof args.path === "string" && args.path.length > 0 ? String(args.path) : ".";
    const rgArgs = ["-n", "--color=never"];

    if (args.ignoreCase === true) {
      rgArgs.push("-i");
    }
    if (args.literal === true) {
      rgArgs.push("-F");
    }
    if (typeof args.context === "number" && Number.isFinite(args.context) && args.context > 0) {
      rgArgs.push(`-C${Math.trunc(args.context)}`);
    }
    if (typeof args.glob === "string" && args.glob.length > 0) {
      rgArgs.push("-g", args.glob);
    }

    rgArgs.push(String(args.pattern), pathArg);
    if (typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0) {
      rgArgs.push(...["-m", String(Math.trunc(args.limit))]);
    }

    try {
      const { stdout, stderr } = await execFileAsync("rg", rgArgs, { cwd: process.cwd() });
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim() || "No matches found";
    } catch (error) {
      if (isNoMatchRgExit(error)) {
        return "No matches found";
      }
      throw error;
    }
  },
);

const findTool = stringTool(
  "find",
  "Find files by glob pattern (respects .gitignore).",
  {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      limit: { type: "number" },
    },
    required: ["pattern"],
  },
  async (args) => {
    const cwd = typeof args.path === "string" && args.path.length > 0 ? String(args.path) : process.cwd();
    const rgArgs = ["--files", "-g", String(args.pattern)];
    let stdout = "";

    try {
      ({ stdout } = await execFileAsync("rg", rgArgs, { cwd }));
    } catch (error) {
      if (!isNoMatchRgExit(error)) {
        throw error;
      }
    }

    const matches = stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    const limited =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? matches.slice(0, Math.trunc(args.limit))
        : matches;
    return limited.length > 0 ? limited.join("\n") : "No files found matching pattern";
  },
);

function isNoMatchRgExit(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "number" &&
      (error as { code: number }).code === 1,
  );
}

const lsTool: ToolSpec = stringTool(
  "ls",
  "List directory contents.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      limit: { type: "number" },
    },
    required: [],
  },
  async (args) => {
    const cwd = typeof args.path === "string" ? String(args.path) : process.cwd();
    const entries = await readdir(cwd);
    entries.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? Math.trunc(args.limit)
        : entries.length;

    const rendered = await Promise.all(
      entries.slice(0, limit).map(async (entry) => {
        const fullPath = path.join(cwd, entry);
        const details = await stat(fullPath);
        return details.isDirectory() ? `${entry}/` : entry;
      }),
    );

    return rendered.length > 0 ? rendered.join("\n") : "(empty directory)";
  },
);

export const piMonoCodingTools: ToolSpec[] = [
  aliasTool(fileReadTool, { name: "read", description: "Read file contents." }),
  bashTool,
  aliasTool(fileEditTool, { name: "edit", description: "Make surgical edits to files." }),
  aliasTool(fileWriteTool, { name: "write", description: "Create or overwrite files." }),
];

export const piMonoReadonlyTools: ToolSpec[] = [
  aliasTool(fileReadTool, { name: "read", description: "Read file contents." }),
  grepTool,
  findTool,
  lsTool,
];
