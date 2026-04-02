import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeObservation } from "../../../../runtime/src/core/toolSpec";
import { CLAUDE_CODE_SOURCEMAP_TOOL_NAMES } from "./constants";

const execFileAsync = promisify(execFile);

function stringTool(
  name: string,
  description: string,
  argsSchema: Record<string, unknown>,
  call: (args: Record<string, unknown>) => Promise<string> | string,
): ToolSpec {
  return {
    name,
    description,
    argsSchema,
    call,
    interpreter: (raw) => safeObservation(String(raw ?? "")),
  };
}

function formatNumberedLines(content: string, startLine: number): string {
  const lines = content.split("\n");
  return lines
    .map((line, index) => `${String(startLine + index).padStart(6, " ")}\t${line}`)
    .join("\n");
}

export function createClaudeCodeSourcemapToolPreset(): ToolSpec[] {
  return [
    stringTool(
      CLAUDE_CODE_SOURCEMAP_TOOL_NAMES.bash,
      "Execute a shell command in the current workspace and return stdout/stderr. Prefer Claude Code's dedicated Read/Edit/Write/Grep tools when they fit better than shelling out.",
      {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute." },
          cwd: { type: "string", description: "Optional working directory." },
        },
        required: ["command"],
      },
      async (args) => {
        const command = String(args.command);
        const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
        const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
        return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
      },
    ),
    stringTool(
      CLAUDE_CODE_SOURCEMAP_TOOL_NAMES.read,
      "Read a file from the local filesystem. Supports optional line offset and limit, and returns numbered lines in cat -n style.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
          offset: { type: "number", description: "Optional 1-based starting line." },
          limit: { type: "number", description: "Optional number of lines to read." },
        },
        required: ["file_path"],
      },
      async (args) => {
        const path = String(args.file_path);
        const source = await readFile(path, "utf8");
        const offset = typeof args.offset === "number" && Number.isFinite(args.offset)
          ? Math.max(1, Math.trunc(args.offset))
          : 1;
        const limit = typeof args.limit === "number" && Number.isFinite(args.limit)
          ? Math.max(1, Math.trunc(args.limit))
          : undefined;
        const lines = source.split("\n");
        const sliced = lines.slice(offset - 1, limit === undefined ? undefined : offset - 1 + limit);
        return formatNumberedLines(sliced.join("\n"), offset);
      },
    ),
    stringTool(
      CLAUDE_CODE_SOURCEMAP_TOOL_NAMES.write,
      "Write a file to the local filesystem. Use this for new files or complete rewrites; prefer Edit for targeted modifications.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
          content: { type: "string", description: "Full file content to write." },
        },
        required: ["file_path", "content"],
      },
      async (args) => {
        const path = String(args.file_path);
        await writeFile(path, String(args.content), "utf8");
        return `Wrote ${path}`;
      },
    ),
    stringTool(
      CLAUDE_CODE_SOURCEMAP_TOOL_NAMES.edit,
      "Modify an existing text file by replacing an exact string. Prefer this over Write for targeted edits.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
          old_string: { type: "string", description: "Exact text to replace." },
          new_string: { type: "string", description: "Replacement text." },
          replace_all: { type: "boolean", description: "Replace every occurrence instead of exactly one." },
        },
        required: ["file_path", "old_string", "new_string"],
      },
      async (args) => {
        const path = String(args.file_path);
        const oldString = String(args.old_string);
        const newString = String(args.new_string);
        const replaceAll = args.replace_all === true;
        const source = await readFile(path, "utf8");

        if (!source.includes(oldString)) {
          throw new Error("old_string was not found in the file");
        }

        if (!replaceAll && source.indexOf(oldString) !== source.lastIndexOf(oldString)) {
          throw new Error("old_string appears multiple times; pass replace_all=true to replace every occurrence");
        }

        const next = replaceAll
          ? source.split(oldString).join(newString)
          : source.replace(oldString, newString);
        await writeFile(path, next, "utf8");
        return `Edited ${path}`;
      },
    ),
    stringTool(
      CLAUDE_CODE_SOURCEMAP_TOOL_NAMES.grep,
      "A powerful search tool built on ripgrep. Use Grep instead of invoking grep or rg through Bash for code search tasks.",
      {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression or plain-text pattern." },
          path: { type: "string", description: "Optional search root or target path." },
          glob: { type: "string", description: "Optional file glob filter such as *.ts or **/*.tsx." },
          type: { type: "string", description: "Optional ripgrep file type filter such as ts, js, or py." },
          output_mode: {
            type: "string",
            description: "One of content, files_with_matches, or count.",
          },
          multiline: { type: "boolean", description: "Enable multiline matching." },
        },
        required: ["pattern"],
      },
      async (args) => {
        const pattern = String(args.pattern);
        const commandArgs = ["-n"];

        if (args.multiline === true) {
          commandArgs.push("-U");
        }
        if (typeof args.glob === "string" && args.glob.length > 0) {
          commandArgs.push("-g", args.glob);
        }
        if (typeof args.type === "string" && args.type.length > 0) {
          commandArgs.push("-t", args.type);
        }

        const outputMode = args.output_mode === "content" || args.output_mode === "count" || args.output_mode === "files_with_matches"
          ? args.output_mode
          : "files_with_matches";
        if (outputMode === "files_with_matches") {
          commandArgs.push("--files-with-matches");
        } else if (outputMode === "count") {
          commandArgs.push("--count");
        }

        commandArgs.push(pattern);
        if (typeof args.path === "string" && args.path.length > 0) {
          commandArgs.push(args.path);
        }

        const { stdout, stderr } = await execFileAsync("rg", commandArgs, { cwd: process.cwd() });
        return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
      },
    ),
  ];
}

export const claudeCodeSourcemapToolPreset = createClaudeCodeSourcemapToolPreset();
