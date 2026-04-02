import { existsSync } from "node:fs";
import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";

function renderEnvironment(): string {
  const cwd = process.cwd();
  return [
    "<env>",
    `  Working directory: ${cwd}`,
    `  Is directory a git repo: ${existsSync(`${cwd}/.git`) ? "yes" : "no"}`,
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    "</env>",
  ].join("\n");
}

function renderTools(tools: ToolSpec[]): string {
  return tools
    .map(
      (tool) =>
        [
          `- ${tool.name}`,
          `  description: ${tool.description}`,
          `  schema: ${JSON.stringify(tool.argsSchema)}`,
        ].join("\n"),
    )
    .join("\n");
}

function renderHistory(context: Context): string {
  if (context.entries.length === 0) {
    return "(no prior assistant/tool history)";
  }

  return context.entries
    .map((entry, index) => {
      const step = entry.metadata.step ?? "?";
      return `[${index + 1}] ${entry.role.toUpperCase()} step=${step}\n${entry.content}`;
    })
    .join("\n\n");
}

export class OpenCodePromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are OpenCode, an interactive CLI coding agent.",
      "You help with software engineering tasks inside the current workspace.",
      "",
      "Follow these rules:",
      "- Prefer specialized tools over shell when a file-oriented tool fits.",
      "- Keep edits minimal and preserve unrelated user changes.",
      "- Use ASCII by default when editing files.",
      "- Return only a single JSON object with no markdown fences or extra prose.",
      "- For tool calls, use: {\"tool\":\"<tool-name>\",\"input\":{...}}.",
      "- When the task is complete, use: {\"tool\":\"finish\",\"input\":{\"result\":\"...\"}}.",
      "",
      renderEnvironment(),
      "",
      "Available tools:",
      renderTools(tools),
      "",
      "User task:",
      task,
      "",
      "Assistant and tool history:",
      renderHistory(context),
      "",
      "Respond with exactly one JSON object.",
    ].join("\n");
  }
}
