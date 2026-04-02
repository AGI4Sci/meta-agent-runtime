import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { safeInterpreter, safeObservation, type ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { stringTool } from "../../../../runtime/src/tools/common";

const execFileAsync = promisify(execFile);

function withWorkspacePath(pathLike: unknown): string {
  return String(pathLike);
}

function createSearchReplaceBlocks(diff: string): Array<{ search: string; replace: string }> {
  const blockPattern =
    /------- SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n\+\+\+\+\+\+\+ REPLACE/g;
  const blocks: Array<{ search: string; replace: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(diff)) !== null) {
    blocks.push({
      search: match[1] ?? "",
      replace: match[2] ?? "",
    });
  }

  return blocks;
}

async function replaceInFile(args: Record<string, unknown>): Promise<string> {
  const path = withWorkspacePath(args.path);
  const diff = String(args.diff ?? "");
  const source = await readFile(path, "utf8");
  const blocks = createSearchReplaceBlocks(diff);

  if (blocks.length === 0) {
    throw new Error("No SEARCH/REPLACE blocks found");
  }

  let next = source;
  for (const block of blocks) {
    if (!next.includes(block.search)) {
      throw new Error("SEARCH block did not match file content");
    }
    next = next.replace(block.search, block.replace);
  }

  await writeFile(path, next, "utf8");
  return `Applied ${blocks.length} SEARCH/REPLACE block(s) to ${path}`;
}

const executeCommandTool = stringTool(
  "execute_command",
  "Execute a shell command in the current workspace.",
  {
    type: "object",
    properties: {
      command: { type: "string" },
      requires_approval: { type: "boolean" },
      timeout: { type: "number" },
      cwd: { type: "string" },
    },
    required: ["command", "requires_approval"],
  },
  async (args) => {
    const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
    const timeout =
      typeof args.timeout === "number" && Number.isFinite(args.timeout)
        ? args.timeout * 1000
        : undefined;
    const { stdout, stderr } = await execFileAsync(
      "/bin/zsh",
      ["-lc", String(args.command)],
      { cwd, timeout },
    );
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

const readFileTool = stringTool(
  "read_file",
  "Read the contents of a UTF-8 text file.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  },
  async (args) => readFile(withWorkspacePath(args.path), "utf8"),
);

const writeFileTool = stringTool(
  "write_to_file",
  "Write complete UTF-8 text content to a file, creating parent directories if needed.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async (args) => {
    const path = withWorkspacePath(args.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(args.content), "utf8");
    return `Wrote ${path}`;
  },
);

const replaceInFileTool: ToolSpec = {
  name: "replace_in_file",
  description:
    "Edit an existing file using one or more SEARCH/REPLACE diff blocks.",
  argsSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      diff: { type: "string" },
    },
    required: ["path", "diff"],
  },
  call: replaceInFile,
  interpreter: safeInterpreter((raw) => safeObservation(String(raw ?? ""))),
};

const searchFilesTool = stringTool(
  "search_files",
  "Search workspace files with ripgrep and return matching lines.",
  {
    type: "object",
    properties: {
      regex: { type: "string" },
      path: { type: "string" },
    },
    required: ["regex"],
  },
  async (args) => {
    const cwd = typeof args.path === "string" ? args.path : process.cwd();
    const { stdout, stderr } = await execFileAsync("rg", ["-n", String(args.regex)], {
      cwd,
    });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

const listFilesTool = stringTool(
  "list_files",
  "List workspace files with optional recursive traversal.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      recursive: { type: "boolean" },
    },
    required: ["path"],
  },
  async (args) => {
    const root = withWorkspacePath(args.path);
    const command = ["--files", root];
    if (args.recursive === false) {
      command.push("--max-depth", "1");
    }
    const { stdout, stderr } = await execFileAsync("rg", command);
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

export const CLINE_MINIMAL_TOOLS: ToolSpec[] = [
  executeCommandTool,
  readFileTool,
  writeFileTool,
  replaceInFileTool,
  searchFilesTool,
  listFilesTool,
];
