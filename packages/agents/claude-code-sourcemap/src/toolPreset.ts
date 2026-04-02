import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { bashTool } from "../../../../runtime/src/tools/bash";
import { fileEditTool } from "../../../../runtime/src/tools/fileEdit";
import { fileReadTool } from "../../../../runtime/src/tools/fileRead";
import { fileWriteTool } from "../../../../runtime/src/tools/fileWrite";
import { searchTool } from "../../../../runtime/src/tools/search";

type ToolTransform = {
  name: string;
  description: string;
  argsSchema: Record<string, unknown>;
  mapArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
};

function remapTool(base: ToolSpec, transform: ToolTransform): ToolSpec {
  return {
    name: transform.name,
    description: transform.description,
    argsSchema: transform.argsSchema,
    call: (args: Record<string, unknown>) => base.call(transform.mapArgs ? transform.mapArgs(args) : args),
    interpreter: base.interpreter,
  };
}

export function createClaudeCodeSourcemapToolPreset(): ToolSpec[] {
  return [
    remapTool(bashTool, {
      name: "Bash",
      description:
        "Execute a shell command in the current workspace. Use a short command description only when it materially clarifies intent.",
      argsSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute." },
          cwd: { type: "string", description: "Optional working directory." },
        },
        required: ["command"],
      },
    }),
    remapTool(fileReadTool, {
      name: "Read",
      description: "Read a UTF-8 text file from disk.",
      argsSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
        },
        required: ["file_path"],
      },
      mapArgs: (args) => ({ path: args.file_path }),
    }),
    remapTool(fileWriteTool, {
      name: "Write",
      description: "Write UTF-8 text content to a file, replacing any existing content.",
      argsSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
          content: { type: "string", description: "Full file content to write." },
        },
        required: ["file_path", "content"],
      },
      mapArgs: (args) => ({ path: args.file_path, content: args.content }),
    }),
    remapTool(fileEditTool, {
      name: "Edit",
      description: "Replace one exact substring in a UTF-8 text file.",
      argsSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute or workspace-relative file path." },
          old_string: { type: "string", description: "Exact text to replace." },
          new_string: { type: "string", description: "Replacement text." },
        },
        required: ["file_path", "old_string", "new_string"],
      },
      mapArgs: (args) => ({
        path: args.file_path,
        old_text: args.old_string,
        new_text: args.new_string,
      }),
    }),
    remapTool(searchTool, {
      name: "Grep",
      description: "Search files in the workspace with ripgrep and return matching lines.",
      argsSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression or plain-text pattern." },
          cwd: { type: "string", description: "Optional working directory." },
        },
        required: ["pattern"],
      },
      mapArgs: (args) => ({ query: args.pattern, cwd: args.cwd }),
    }),
  ];
}
