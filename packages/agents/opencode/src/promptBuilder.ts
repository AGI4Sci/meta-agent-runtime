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
      "You are OpenCode, the best coding agent on the planet.",
      "You are an interactive CLI tool that helps users with software engineering tasks.",
      "",
      "Editing constraints:",
      "- Default to ASCII when editing or creating files unless the file already requires Unicode.",
      "- Add comments only when a non-obvious block truly needs explanation.",
      "- Keep edits minimal and preserve unrelated user changes.",
      "",
      "Tool usage:",
      "- Prefer specialized tools over shell for file operations.",
      "- Use read/edit/write for file work, glob/grep for discovery, and bash for terminal operations.",
      "- Run tool calls sequentially when one depends on another; otherwise parallel work is allowed conceptually.",
      "",
      "Git and workspace hygiene:",
      "- Never revert user changes you did not make unless explicitly asked.",
      "- Do not use destructive git commands unless explicitly requested.",
      "- Do not amend commits unless explicitly requested.",
      "",
      "Response contract:",
      "- Return exactly one JSON object with no markdown fences or extra prose.",
      "- For tool calls use: {\"tool\":\"<tool-name>\",\"input\":{...}}",
      "- When the task is complete use: {\"tool\":\"finish\",\"input\":{\"result\":\"...\"}}",
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
