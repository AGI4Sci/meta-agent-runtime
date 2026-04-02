import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { safeInterpreter, safeObservation } from "../../../../runtime/src/core/toolSpec";
import { TODO_CURRENT_PREFIX, TODO_READ_NAME, TODO_UPDATED_PREFIX, TODO_WRITE_NAME } from "./constants";
import { formatTodos, normalizeTodos, type TodoItem } from "./todoState";

const execFileAsync = promisify(execFile);

function stringObservation(raw: unknown) {
  return safeObservation(String(raw ?? ""));
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function createBashTool(): ToolSpec {
  return {
    name: "Bash",
    description:
      "Executes a bash command in the workspace. Accepts session_name, command, description, timeout, and wait_for_output for ii-agent compatibility.",
    argsSchema: {
      type: "object",
      properties: {
        session_name: { type: "string" },
        command: { type: "string" },
        description: { type: "string" },
        timeout: { type: "integer" },
        wait_for_output: { type: "boolean" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
    call: async (args) => {
      const command = ensureString(args.command);
      const cwd = ensureString(args.cwd, process.cwd());
      const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createReadTool(): ToolSpec {
  return {
    name: "Read",
    description:
      "Reads a text file from disk using ii-agent compatible arguments such as file_path, offset, and limit.",
    argsSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        offset: { type: "integer" },
        limit: { type: "integer" },
      },
      required: ["file_path"],
    },
    call: async (args) => {
      const filePath = ensureString(args.file_path);
      const offset = typeof args.offset === "number" ? Math.max(1, Math.trunc(args.offset)) : 1;
      const limit = typeof args.limit === "number" ? Math.max(1, Math.trunc(args.limit)) : undefined;
      const source = await readFile(filePath, "utf8");
      const lines = source.split("\n");
      const slice = lines.slice(offset - 1, limit ? offset - 1 + limit : undefined);
      return slice
        .map((line, index) => `${String(offset + index).padStart(6, " ")}\t${line}`)
        .join("\n");
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createWriteTool(): ToolSpec {
  return {
    name: "Write",
    description: "Writes a UTF-8 text file using ii-agent compatible file_path and content arguments.",
    argsSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        content: { type: "string" },
      },
      required: ["file_path", "content"],
    },
    call: async (args) => {
      const filePath = ensureString(args.file_path);
      await writeFile(filePath, ensureString(args.content), "utf8");
      return `Successfully wrote file: ${filePath}`;
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createEditTool(): ToolSpec {
  return {
    name: "Edit",
    description:
      "Performs exact string replacement using ii-agent compatible file_path, old_string, new_string, and replace_all arguments.",
    argsSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    call: async (args) => {
      const filePath = ensureString(args.file_path);
      const oldString = ensureString(args.old_string);
      const newString = ensureString(args.new_string);
      const replaceAll = args.replace_all === true;
      const source = await readFile(filePath, "utf8");
      const next = replaceAll ? source.split(oldString).join(newString) : source.replace(oldString, newString);
      await writeFile(filePath, next, "utf8");
      return `Modified file \`${filePath}\``;
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createGrepTool(): ToolSpec {
  return {
    name: "Grep",
    description:
      "Search file contents with ripgrep using ii-agent compatible pattern, path, and include arguments.",
    argsSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        include: { type: "string" },
      },
      required: ["pattern"],
    },
    call: async (args) => {
      const pattern = ensureString(args.pattern);
      const path = ensureString(args.path, process.cwd());
      const include = ensureString(args.include);
      const rgArgs = ["--line-number", "--no-heading", "--color=never"];
      if (include) {
        rgArgs.push("--glob", include);
      }
      rgArgs.push(pattern, path);
      const { stdout, stderr } = await execFileAsync("rg", rgArgs);
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim() || `No matches found for pattern "${pattern}"`;
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createTodoWriteTool(todoState: { todos: TodoItem[] }): ToolSpec {
  return {
    name: TODO_WRITE_NAME,
    description:
      "Create or update the structured todo list for the current coding session. Prefer this for non-trivial multi-step work.",
    argsSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["id", "content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
    call: (args) => {
      todoState.todos = normalizeTodos(args.todos);
      return formatTodos(TODO_UPDATED_PREFIX, todoState.todos);
    },
    interpreter: safeInterpreter(stringObservation),
  };
}

function createTodoReadTool(todoState: { todos: TodoItem[] }): ToolSpec {
  return {
    name: TODO_READ_NAME,
    description: "Read the current structured todo list for the session.",
    argsSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    call: () => formatTodos(TODO_CURRENT_PREFIX, todoState.todos),
    interpreter: safeInterpreter(stringObservation),
  };
}

export function createIIAgentToolPreset(): ToolSpec[] {
  const todoState = { todos: [] as TodoItem[] };
  return [
    createBashTool(),
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createGrepTool(),
    createTodoWriteTool(todoState),
    createTodoReadTool(todoState),
  ];
}

export const iiAgentToolPreset: ToolSpec[] = createIIAgentToolPreset();
