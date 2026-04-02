import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeInterpreter, safeObservation } from "../../../../runtime/src/core/toolSpec";
import { stringTool } from "../../../../runtime/src/tools/common";

const execFileAsync = promisify(execFile);

type TreeNode = {
  dirs: Map<string, TreeNode>;
  files: Map<string, number>;
  totalLines: number;
};

function createTreeNode(): TreeNode {
  return {
    dirs: new Map<string, TreeNode>(),
    files: new Map<string, number>(),
    totalLines: 0,
  };
}

async function walkTree(rootDir: string, currentDir: string, lines: string[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath) || ".";

    if (entry.isDirectory()) {
      lines.push(`${relativePath}/`);
      await walkTree(rootDir, absolutePath, lines);
      continue;
    }

    const fileStat = await stat(absolutePath);
    lines.push(`${relativePath} (${fileStat.size} bytes)`);
  }
}

async function listTrackedFiles(rootDir: string): Promise<string[] | null> {
  try {
    const rootIgnore = path.join(rootDir, ".gitignore");
    const args = ["--files", "--hidden", "-g", "!.git"];
    try {
      await access(rootIgnore);
      args.push("--ignore-file", rootIgnore);
    } catch {
      // no explicit root ignore file
    }

    const { stdout } = await execFileAsync("rg", args, {
      cwd: rootDir,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

function normalizeDepth(value: unknown): number | null {
  if (value === undefined) {
    return 2;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 2;
  }
  if (parsed === 0) {
    return null;
  }
  return Math.floor(parsed);
}

async function countFileLines(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.length === 0 ? 0 : content.split("\n").length;
  } catch {
    return 0;
  }
}

function insertTreePath(root: TreeNode, relativePath: string, lineCount: number): void {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return;
  }

  let node = root;
  for (const segment of parts.slice(0, -1)) {
    const next = node.dirs.get(segment) ?? createTreeNode();
    node.dirs.set(segment, next);
    node = next;
  }
  node.files.set(parts.at(-1)!, lineCount);
}

function computeTotalLines(node: TreeNode): number {
  let total = 0;
  for (const child of node.dirs.values()) {
    total += computeTotalLines(child);
  }
  for (const lineCount of node.files.values()) {
    total += lineCount;
  }
  node.totalLines = total;
  return total;
}

function formatLineCount(lines: number): string {
  if (lines >= 1000) {
    return `[${Math.floor(lines / 1000)}K]`;
  }
  return `[${lines}]`;
}

function renderTree(node: TreeNode, depth: number, maxDepth: number | null, output: string[]): void {
  if (maxDepth !== null && depth >= maxDepth) {
    return;
  }

  for (const [dirName, child] of [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    output.push(`${"  ".repeat(depth)}${dirName}/  ${formatLineCount(child.totalLines)}`);
    renderTree(child, depth + 1, maxDepth, output);
  }

  for (const [fileName, lineCount] of [...node.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    output.push(`${"  ".repeat(depth)}${fileName}  ${formatLineCount(lineCount)}`);
  }
}

async function renderGooseStyleTree(rootDir: string, depth: number | null): Promise<string> {
  const trackedFiles = await listTrackedFiles(rootDir);
  if (trackedFiles === null) {
    const fallbackLines: string[] = ["./"];
    await walkTree(rootDir, rootDir, fallbackLines);
    return fallbackLines.join("\n");
  }

  if (trackedFiles.length === 0) {
    return "(empty directory)";
  }

  const root = createTreeNode();
  for (const relativePath of trackedFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    const lineCount = await countFileLines(absolutePath);
    insertTreePath(root, relativePath, lineCount);
  }
  computeTotalLines(root);

  const lines: string[] = [];
  renderTree(root, 0, depth, lines);
  return lines.length > 0 ? lines.join("\n") : "(empty directory)";
}

function shellInterpreter(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return safeObservation(String(raw ?? ""));
  }

  const result = raw as { stdout?: unknown; stderr?: unknown; exitCode?: unknown };
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const exitCode =
    typeof result.exitCode === "number" ? result.exitCode : Number(result.exitCode ?? 0);

  const content = [`exit_code: ${exitCode}`, stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`]
    .filter(Boolean)
    .join("\n\n");

  return safeObservation(content, exitCode === 0 ? null : `shell exited with code ${exitCode}`, {
    exitCode,
    stdout,
    stderr,
  });
}

export const gooseShellTool: ToolSpec = {
  name: "shell",
  description:
    "Execute a shell command in the user's default shell in the current dir. Returns stdout, stderr, and exit code.",
  argsSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["command"],
  },
  call: async (args) => {
    const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
    const command = String(args.command ?? "");

    try {
      const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      if (error && typeof error === "object") {
        const commandError = error as {
          stdout?: string;
          stderr?: string;
          code?: number | string;
          message?: string;
        };
        return {
          stdout: commandError.stdout ?? "",
          stderr: commandError.stderr ?? commandError.message ?? "",
          exitCode: Number(commandError.code ?? 1),
        };
      }
      return { stdout: "", stderr: String(error), exitCode: 1 };
    }
  },
  interpreter: safeInterpreter(shellInterpreter),
};

export const gooseWriteTool = stringTool(
  "write",
  "Create a new file or overwrite an existing file. Creates parent directories if needed.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async (args) => {
    const targetPath = String(args.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, String(args.content), "utf8");
    return `Wrote ${targetPath}`;
  },
);

export const gooseEditTool = stringTool(
  "edit",
  "Edit a file by finding and replacing text. The before text must match exactly and uniquely.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      old_text: { type: "string" },
      new_text: { type: "string" },
    },
    required: ["path", "old_text", "new_text"],
  },
  async (args) => {
    const targetPath = String(args.path);
    const oldText = String(args.old_text);
    const newText = String(args.new_text);
    const source = await readFile(targetPath, "utf8");

    if (!source.includes(oldText)) {
      throw new Error("old_text not found in file");
    }
    if (source.indexOf(oldText) !== source.lastIndexOf(oldText)) {
      throw new Error("old_text must match uniquely");
    }

    const next = source.replace(oldText, newText);
    await writeFile(targetPath, next, "utf8");
    return `Edited ${targetPath}`;
  },
);

export const gooseTreeTool = stringTool(
  "tree",
  "List a directory tree with approximate line counts. Traversal respects ripgrep/gitignore rules when available.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      depth: { type: "number" },
    },
  },
  async (args) => {
    const rootDir = typeof args.path === "string" ? path.resolve(args.path) : process.cwd();
    return renderGooseStyleTree(rootDir, normalizeDepth(args.depth));
  },
);

export const GOOSE_TOOL_PRESET: ToolSpec[] = [
  gooseShellTool,
  gooseWriteTool,
  gooseEditTool,
  gooseTreeTool,
];
