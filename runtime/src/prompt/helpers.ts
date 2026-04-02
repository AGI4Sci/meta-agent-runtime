import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";

export function renderTools(tools: ToolSpec[]): string {
  return tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  schema: ${JSON.stringify(tool.argsSchema)}`,
    )
    .join("\n");
}

export function renderContext(context: Context): string {
  if (context.entries.length === 0) {
    return "(no history)";
  }

  return context.entries
    .map((entry, index) => `[${index + 1}] ${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");
}
