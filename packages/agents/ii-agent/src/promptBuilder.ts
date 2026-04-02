import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";
import { II_AGENT_SYSTEM_PROMPT } from "./constants";

function renderTool(tool: ToolSpec): string {
  return [
    `- ${tool.name}`,
    `  description: ${tool.description}`,
    `  input_schema: ${JSON.stringify(tool.argsSchema)}`,
  ].join("\n");
}

function renderEntry(entry: ContextEntry, index: number): string {
  const prefix =
    entry.role === "assistant" ? "assistant" : entry.role === "tool" ? "tool" : "user";
  return `[${index + 1}] ${prefix}: ${entry.content}`;
}

export class IIAgentPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    const toolSection = tools.map(renderTool).join("\n");
    const historySection =
      context.entries.length > 0
        ? context.entries.map(renderEntry).join("\n")
        : "(no prior turns)";

    return [
      II_AGENT_SYSTEM_PROMPT,
      "",
      "<task>",
      task,
      "</task>",
      "",
      "<available_tools>",
      toolSection,
      "</available_tools>",
      "",
      "<history>",
      historySection,
      "</history>",
      "",
      "Return one next action now.",
    ].join("\n");
  }
}
