import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import {
  CLAUDE_CODE_SOURCEMAP_FINISH_EXAMPLE,
  CLAUDE_CODE_SOURCEMAP_FUNCTION_CALL_EXAMPLE,
} from "./constants";

function renderFunctions(tools: ToolSpec[]): string {
  return tools
    .map((tool) =>
      `<function>${JSON.stringify({
        name: tool.name,
        description: tool.description,
        parameters: tool.argsSchema,
      })}</function>`,
    )
    .join("\n");
}

function renderHistory(context: Context): string {
  if (context.entries.length === 0) {
    return "No previous conversation history.";
  }

  return context.entries
    .map((entry: ContextEntry, index: number) => {
      if (entry.role === "assistant") {
        return `[assistant ${index + 1}]\n${entry.content}`;
      }

      const error = typeof entry.metadata.error === "string" && entry.metadata.error.length > 0
        ? `\nerror: ${entry.metadata.error}`
        : "";
      return `[tool ${index + 1}]${error}\n${entry.content}`;
    })
    .join("\n\n");
}

export class ClaudeCodeSourcemapPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are Claude Code operating inside a shared runtime compatibility layer.",
      "Help the user with software engineering work using the available tools.",
      "Keep all reasoning and tool usage grounded in the current task and tool results.",
      "",
      "# System",
      "- Runtime prompt and tool descriptions are in English only.",
      "- Prefer the simplest action that moves the task forward.",
      "- If a tool fails, use the tool result to adjust instead of repeating the exact same action blindly.",
      "- When the task is complete, call the finish function with a concise final result.",
      "",
      "# Task",
      task,
      "",
      "# Available Functions",
      "<functions>",
      renderFunctions(tools),
      "</functions>",
      "",
      "# Response Format",
      "To call a function, respond with exactly:",
      CLAUDE_CODE_SOURCEMAP_FUNCTION_CALL_EXAMPLE,
      "",
      "When the task is complete, call:",
      CLAUDE_CODE_SOURCEMAP_FINISH_EXAMPLE,
      "",
      "# Conversation History",
      renderHistory(context),
    ].join("\n");
  }
}
