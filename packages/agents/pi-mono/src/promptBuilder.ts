import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  read: "Read file contents",
  bash: "Execute bash commands (ls, grep, find, etc.)",
  edit: "Make surgical edits to files (find exact text and replace)",
  write: "Create or overwrite files",
  search: "Search file contents for patterns with ripgrep",
  finish: "Finish the task and provide the final result",
};

function renderHistory(context: Context): string {
  if (context.entries.length === 0) {
    return "(empty)";
  }

  return context.entries
    .map((entry, index) => {
      const label =
        entry.role === "assistant" ? "Assistant" : entry.role === "tool" ? "Tool" : "User";
      return `${index + 1}. ${label}\n${entry.content || "(empty)"}`;
    })
    .join("\n\n");
}

function buildGuidelines(tools: ToolSpec[]): string[] {
  const names = new Set(tools.map((tool) => tool.name));
  const guidelines: string[] = [];

  if (names.has("bash") && !names.has("search")) {
    guidelines.push("Use bash for file exploration when dedicated search tools are unavailable.");
  }
  if (names.has("read") && names.has("edit")) {
    guidelines.push("Use read before edit when you need file context.");
  }
  if (names.has("edit")) {
    guidelines.push("Use edit for precise changes when the target text is known.");
  }
  if (names.has("write")) {
    guidelines.push("Use write only for new files or full rewrites.");
  }

  guidelines.push("Be concise in your responses.");
  guidelines.push("Return exactly one JSON action object each turn.");
  guidelines.push("Use finish once the task is complete.");

  return guidelines;
}

export class PiMonoPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    const toolList = tools
      .map((tool) => `- ${tool.name}: ${TOOL_DESCRIPTIONS[tool.name] ?? tool.description}`)
      .join("\n");
    const guidelines = buildGuidelines(tools)
      .map((line) => `- ${line}`)
      .join("\n");
    const now = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });

    return [
      "You are an expert coding assistant operating inside pi, a coding agent harness.",
      "",
      "Available tools:",
      toolList,
      "",
      "Guidelines:",
      guidelines,
      "",
      `Current date and time: ${now}`,
      "",
      "Task:",
      task,
      "",
      "Conversation history:",
      renderHistory(context),
      "",
      'Respond with a single JSON object: {"name":"tool_name","args":{...}}',
    ].join("\n");
  }
}
