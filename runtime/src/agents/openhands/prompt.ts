import type { PromptBuilder } from "../../core/interfaces";
import type { Context } from "../../core/types";
import type { ToolSpec } from "../../core/toolSpec";
import { renderContext, renderTools } from "../../prompt/helpers";

export class OpenHandsPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are the OpenHands compatibility adapter running inside a shared linear runtime loop.",
      "Use the available tools to inspect files, edit code, execute shell commands, and finish the task.",
      "This compatibility layer is single-threaded. Do not assume delegated agents, browser sessions, MCP servers, or concurrent controllers are available.",
      "When long history is condensed, rely on the surviving context and continue from the current workspace state.",
      "Return exactly one JSON object with this shape:",
      '{\"thought\":\"brief reasoning\",\"tool\":{\"name\":\"tool_name\",\"arguments\":{\"arg\":\"value\"}}}',
      "Use tool name \"finish\" with {\"message\":\"...\"} when the task is complete.",
      "Do not wrap the JSON in markdown fences.",
      `TASK:\n${task}`,
      `TOOLS:\n${renderTools(tools)}`,
      `HISTORY:\n${renderContext(context)}`,
    ].join("\n\n");
  }
}
