import { execFile } from "node:child_process";
import { access, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeObservation } from "../../../../runtime/src/core/toolSpec";

const execFileAsync = promisify(execFile);
const OPENHANDS_CWD_MARKER = "__OPENHANDS_CWD__";
const SECURITY_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

interface CommandResult {
  content: string;
  exitCode: number;
  metadata?: Record<string, unknown>;
}

class BashSession {
  private cwd = process.cwd();

  async run(args: Record<string, unknown>): Promise<CommandResult> {
    const command = String(args.command ?? "");
    const isInput = String(args.is_input ?? "false") === "true";
    const timeoutMs = readTimeoutMs(args.timeout);

    if (isInput) {
      return {
        content:
          "OpenHands compatibility mode does not support interactive stdin continuation yet. Re-run the full command with a larger timeout instead.",
        exitCode: 1,
        metadata: { compatibilityLoss: "interactive_process_control" },
      };
    }

    const script = [
      `cd ${shellQuote(this.cwd)}`,
      command,
      "openhands_exit_code=$?",
      `printf '\\n${OPENHANDS_CWD_MARKER}%s' \"$PWD\"`,
      "exit $openhands_exit_code",
    ].join("\n");

    const result = await runProcess("/bin/zsh", ["-lc", script], timeoutMs);
    const parsed = splitCwdMarker(result.content);
    this.cwd = parsed.cwd ?? this.cwd;
    return {
      content: parsed.content,
      exitCode: result.exitCode,
      metadata: {
        ...(result.metadata ?? {}),
        workingDir: this.cwd,
      },
    };
  }
}

class IPythonSession {
  private successfulCells: string[] = [];

  async run(args: Record<string, unknown>): Promise<CommandResult> {
    const code = String(args.code ?? "");
    const timeoutMs = readTimeoutMs(args.timeout);
    const script = [...this.successfulCells, code].join("\n\n");
    const result = await runProcess("python3", ["-c", script], timeoutMs);

    if (result.exitCode === 0) {
      this.successfulCells.push(code);
    }

    return {
      content: result.content,
      exitCode: result.exitCode,
      metadata: {
        ...(result.metadata ?? {}),
        persistedCells: this.successfulCells.length,
        compatibilityShim: "replayed_python_cells",
      },
    };
  }
}

class EditorSession {
  private readonly undoStack = new Map<string, string[]>();

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = String(args.command ?? "");
    const path = requireAbsolutePath(String(args.path ?? ""));

    if (command === "view") {
      return this.view(path, args.view_range);
    }
    if (command === "create") {
      return this.create(path, typeof args.file_text === "string" ? args.file_text : "");
    }
    if (command === "str_replace") {
      return this.strReplace(
        path,
        typeof args.old_str === "string" ? args.old_str : "",
        typeof args.new_str === "string" ? args.new_str : "",
      );
    }
    if (command === "insert") {
      return this.insert(
        path,
        typeof args.new_str === "string" ? args.new_str : "",
        Number(args.insert_line ?? 0),
      );
    }
    if (command === "undo_edit") {
      return this.undo(path);
    }

    throw new Error(`Unsupported editor command: ${command}`);
  }

  private async view(path: string, viewRange: unknown): Promise<string> {
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      return renderDirectoryTree(path);
    }

    const source = await readFile(path, "utf8");
    return renderNumberedView(source, viewRange);
  }

  private async create(path: string, fileText: string): Promise<string> {
    if (await exists(path)) {
      throw new Error(`Cannot create ${path}: file already exists`);
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, fileText, "utf8");
    return `Created ${path}`;
  }

  private async strReplace(path: string, oldStr: string, newStr: string): Promise<string> {
    const source = await readFile(path, "utf8");
    const occurrences = countOccurrences(source, oldStr);

    if (!oldStr) {
      throw new Error("str_replace requires a non-empty old_str");
    }
    if (occurrences === 0) {
      throw new Error(`String not found in ${path}`);
    }
    if (occurrences > 1) {
      throw new Error(`old_str matched ${occurrences} locations in ${path}; include more context`);
    }

    this.pushUndo(path, source);
    await writeFile(path, source.replace(oldStr, newStr), "utf8");
    return `Updated ${path}`;
  }

  private async insert(path: string, newStr: string, insertLine: number): Promise<string> {
    if (!Number.isInteger(insertLine) || insertLine < 0) {
      throw new Error("insert requires insert_line to be an integer >= 0");
    }

    const source = await readFile(path, "utf8");
    const lines = source.split("\n");
    const index = Math.min(lines.length, insertLine);
    this.pushUndo(path, source);
    lines.splice(index, 0, newStr);
    await writeFile(path, lines.join("\n"), "utf8");
    return `Inserted content into ${path}`;
  }

  private async undo(path: string): Promise<string> {
    const history = this.undoStack.get(path);
    if (!history?.length) {
      throw new Error(`No edit history available for ${path}`);
    }

    const previous = history.pop() ?? "";
    await writeFile(path, previous, "utf8");
    return `Reverted last edit for ${path}`;
  }

  private pushUndo(path: string, content: string): void {
    const history = this.undoStack.get(path) ?? [];
    history.push(content);
    this.undoStack.set(path, history);
  }
}

export function createOpenHandsBashTool(session = new BashSession()): ToolSpec {
  return {
    name: "execute_bash",
    description:
      "Execute one bash command in a persistent shell session. Supports command, is_input, timeout, and security_risk arguments.",
    argsSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        is_input: { type: "string" },
        timeout: { type: "number" },
        security_risk: { type: "string", enum: [...SECURITY_RISK_LEVELS] },
      },
      required: ["command", "security_risk"],
    },
    call: (args) => session.run(args),
    interpreter(raw) {
      const result = raw as CommandResult;
      return safeObservation(
        result.content,
        result.exitCode === 0 ? null : `Command exited with code ${result.exitCode}`,
        {
          exitCode: result.exitCode,
          ...(result.metadata ?? {}),
        },
      );
    },
  };
}

export function createOpenHandsIPythonTool(session = new IPythonSession()): ToolSpec {
  return {
    name: "execute_ipython_cell",
    description:
      "Execute Python code in a simulated persistent IPython-like session. Supports code, timeout, and security_risk arguments.",
    argsSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        timeout: { type: "number" },
        security_risk: { type: "string", enum: [...SECURITY_RISK_LEVELS] },
      },
      required: ["code", "security_risk"],
    },
    call: (args) => session.run(args),
    interpreter(raw) {
      const result = raw as CommandResult;
      return safeObservation(
        result.content,
        result.exitCode === 0 ? null : `Python exited with code ${result.exitCode}`,
        {
          exitCode: result.exitCode,
          ...(result.metadata ?? {}),
        },
      );
    },
  };
}

export function createOpenHandsEditorTool(session = new EditorSession()): ToolSpec {
  return {
    name: "str_replace_editor",
    description:
      "OpenHands-compatible editor. Supported commands: view, create, str_replace, insert, undo_edit. Paths must be absolute.",
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
        security_risk: { type: "string", enum: [...SECURITY_RISK_LEVELS] },
      },
      required: ["command", "path", "security_risk"],
    },
    call: (args) => session.execute(args),
    interpreter(raw) {
      return safeObservation(String(raw ?? ""), null, {});
    },
  };
}

export function createOpenHandsThinkTool(): ToolSpec {
  return {
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
}

export function createOpenHandsCondensationTool(): ToolSpec {
  return {
    name: "request_condensation",
    description:
      "Request history condensation. In the shared runtime this is a compatibility shim and returns a status message.",
    argsSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    call: () =>
      "History condensation is handled by the selected ContextStrategy in meta-agent-runtime.",
    interpreter: (raw) => safeObservation(String(raw ?? ""), null, { compatibilityShim: true }),
  };
}

export function createOpenHandsTools(): ToolSpec[] {
  return [
    createOpenHandsBashTool(),
    createOpenHandsIPythonTool(),
    createOpenHandsEditorTool(),
    createOpenHandsThinkTool(),
    createOpenHandsCondensationTool(),
  ];
}

export const OPENHANDS_MINIMAL_TOOLS = createOpenHandsTools;

async function runProcess(
  file: string,
  args: string[],
  timeoutMs?: number,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return {
      content: joinOutput(stdout, stderr),
      exitCode: 0,
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
      message?: string;
    };

    const timedOut = failure.killed || failure.signal === "SIGTERM";
    return {
      content: joinOutput(failure.stdout, failure.stderr, failure.message),
      exitCode: timedOut ? -1 : typeof failure.code === "number" ? failure.code : 1,
      metadata: timedOut ? { timedOut: true } : {},
    };
  }
}

function joinOutput(...parts: Array<string | undefined>): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .trim();
}

function splitCwdMarker(content: string): { content: string; cwd: string | null } {
  const index = content.lastIndexOf(OPENHANDS_CWD_MARKER);
  if (index === -1) {
    return { content, cwd: null };
  }

  const visible = content.slice(0, index).trim();
  const cwd = content.slice(index + OPENHANDS_CWD_MARKER.length).trim() || null;
  return { content: visible, cwd };
}

function readTimeoutMs(timeout: unknown): number | undefined {
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    return undefined;
  }
  return Math.round(timeout * 1000);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function requireAbsolutePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`OpenHands editor requires an absolute path, got: ${path}`);
  }
  return resolve(path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function countOccurrences(source: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function renderNumberedView(source: string, viewRange: unknown): string {
  const lines = source.split("\n");
  let start = 1;
  let end = lines.length;

  if (Array.isArray(viewRange) && viewRange.length === 2) {
    start = Math.max(1, Number(viewRange[0] ?? 1));
    end = Number(viewRange[1] ?? lines.length);
    if (end === -1) {
      end = lines.length;
    }
    end = Math.max(start, Math.min(lines.length, end));
  }

  return lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n");
}

async function renderDirectoryTree(root: string): Promise<string> {
  const lines: string[] = [];
  await walkDirectory(root, root, 0, 2, lines);
  return lines.length ? lines.join("\n") : `${root}/`;
}

async function walkDirectory(
  root: string,
  current: string,
  depth: number,
  maxDepth: number,
  lines: string[],
): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  const entries = (await readdir(current, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const nextPath = resolve(current, entry.name);
    const rel = relative(root, nextPath) || entry.name;
    lines.push(entry.isDirectory() ? `${rel}/` : rel);
    if (entry.isDirectory() && depth < maxDepth) {
      await walkDirectory(root, nextPath, depth + 1, maxDepth, lines);
    }
  }
}
