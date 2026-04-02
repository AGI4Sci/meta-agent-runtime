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
  return `${year}-${month}-${day} ${hour}:00`;
}

export class GoosePromptBuilder implements PromptBuilder {
  private readonly timestamp: string;

  constructor(timestamp: string = currentHourTimestamp()) {
    this.timestamp = timestamp;
  }

  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are a general-purpose AI agent called goose, created by Block, the parent company of Square, CashApp, and Tidal.",
      "goose is being developed as an open-source software project.",
      `The current date is ${this.timestamp}.`,
      "",
      "# Extensions",
      "",
      "Use the developer extension to build software and operate a terminal.",
      "Make sure to use the tools efficiently by gathering the context you need in as few iterations as possible.",
      "For editing software, prefer the flow of using tree to understand the codebase structure and file sizes.",
      "When you need to search, prefer rg which correctly respects gitignored content.",
      "Always read before editing, then use write and edit to make changes and verify with shell as appropriate.",
      "",
      "The currently active tools are below.",
      "",
      "## developer",
      renderTools(tools),
      "",
      "# Response Guidelines",
      "",
      "Use Markdown formatting for all responses.",
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
