import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { safeInterpreter, safeObservation, type ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { stringTool } from "../../../../runtime/src/tools/common";

const execFileAsync = promisify(execFile);

function withWorkspacePath(pathLike: unknown): string {
  return String(pathLike);
}

function formatFinalFileContent(toolName: string, path: string, finalContent: string): string {
  return [
    `[${toolName} for '${path}'] Result:`,
    `The content was successfully saved to ${path}.`,
    "",
    `<final_file_content path="${path}">`,
    finalContent,
    "</final_file_content>",
    "",
    "IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference.",
  ].join("\n");
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
  return formatFinalFileContent("replace_in_file", path, next);
}

async function safeExec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, options);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return output.length > 0 ? output : "(no output)";
  } catch (error) {
    const processError = error as { code?: number; stdout?: string; stderr?: string };
    if (processError.code === 1) {
      const output = [processError.stdout, processError.stderr].filter(Boolean).join("\n").trim();
      return output.length > 0 ? output : "(no matches found)";
    }
    throw error;
  }
}

const executeCommandTool = stringTool(
  "execute_command",
  "Request to execute a CLI command on the system.",
  {
    type: "object",
    properties: {
      command: { type: "string" },
      requires_approval: { type: "boolean" },
      timeout: { type: "number" },
    },
    required: ["command", "requires_approval"],
  },
  async (args) => {
    const timeout =
      typeof args.timeout === "number" && Number.isFinite(args.timeout)
        ? args.timeout * 1000
        : undefined;
    return safeExec("/bin/zsh", ["-lc", String(args.command)], {
      cwd: process.cwd(),
      timeout,
    });
  },
);

const readFileTool = stringTool(
  "read_file",
  "Request to read the contents of a file at the specified path.",
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
  "Request to write content to a file at the specified path.",
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
    const content = String(args.content);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return formatFinalFileContent("write_to_file", path, content);
  },
);

const replaceInFileTool: ToolSpec = {
  name: "replace_in_file",
  description:
    "Request to replace sections of an existing file using SEARCH/REPLACE blocks.",
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
  "Request to perform a regex search across files in a specified directory.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      regex: { type: "string" },
      file_pattern: { type: "string" },
    },
    required: ["path", "regex"],
  },
  async (args) => {
    const path = withWorkspacePath(args.path);
    const commandArgs = ["-n"];
    if (typeof args.file_pattern === "string" && args.file_pattern.length > 0) {
      commandArgs.push("--glob", args.file_pattern);
    }
    commandArgs.push(String(args.regex), path);
    return safeExec("rg", commandArgs);
  },
);

const listFilesTool = stringTool(
  "list_files",
  "Request to list files and directories in the specified directory.",
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
    const recursive = args.recursive === true;

    if (recursive) {
      return safeExec("find", [root, "-mindepth", "1"]);
    }

    const entries = await readdir(root, { withFileTypes: true });
    const lines = entries
      .map((entry) => join(root, entry.name) + (entry.isDirectory() ? "/" : ""))
      .sort();
    return lines.length > 0 ? lines.join("\n") : "(empty directory)";
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
