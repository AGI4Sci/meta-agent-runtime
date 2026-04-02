import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { renderContext, renderTools } from "../../../../runtime/src/prompt/helpers";

function currentHourTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00 UTC`;
}

export class GoosePromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are a general-purpose AI agent called goose, created by Block.",
      `The current date is ${currentHourTimestamp()}.`,
      "",
      "# Extensions",
      "",
      "Use the developer extension to build software and operate a terminal.",
      "Be efficient with tool use: inspect the workspace first, batch related reads, then edit and verify.",
      "Prefer tree for structure, shell for inspection and commands, and write/edit for file changes.",
      "",
      "The currently active tools are below.",
      "",
      "## developer",
      renderTools(tools),
      "",
      "# Response Guidelines",
      "",
      "Use Markdown for normal user-facing text.",
      "When you want to act, return exactly one JSON object with this shape:",
      '{"name":"tool_name","args":{"key":"value"}}',
      'Use {"name":"finish","args":{"result":"..."}} only when the task is complete.',
      "",
      "# Task",
      "",
      task,
      "",
      "# Conversation History",
      "",
      renderContext(context),
    ].join("\n");
  }
}
