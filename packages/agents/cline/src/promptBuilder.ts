import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { getClinePromptToolSpec } from "./toolPromptSpec";

function renderTool(tool: ToolSpec): string {
  const rendered = getClinePromptToolSpec(tool);
  return [
    `## ${rendered.name}`,
    `Description: ${rendered.description}`,
    "Parameters:",
    ...rendered.parameters,
    "Usage:",
    ...rendered.usage,
  ].join("\n");
}

function renderHistory(context: Context): string {
  if (context.entries.length === 0) {
    return "(no previous assistant/tool history)";
  }

  return context.entries
    .map((entry) => {
      if (entry.role === "assistant") {
        return `[assistant]\n${entry.content}`;
      }
      if (entry.role === "tool") {
        const error =
          typeof entry.metadata.error === "string" && entry.metadata.error.length > 0
            ? `\n[error]\n${entry.metadata.error}`
            : "";
        return `[tool_result]\n${entry.content}${error}`;
      }
      return `[user]\n${entry.content}`;
    })
    .join("\n\n");
}

export class ClinePromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    const renderedTools = tools.map(renderTool).join("\n\n");

    return [
      "You are Cline running inside a shared research runtime.",
      "You are a coding agent. Work step by step, use exactly one XML-style tool block per assistant turn, and wait for the tool result before the next action.",
      "ALWAYS wait for the tool result before deciding the next step. Never assume a tool succeeded without seeing its result.",
      "For targeted edits, prefer replace_in_file with carefully crafted SEARCH/REPLACE blocks. When several changes are needed in the same file, prefer a single replace_in_file call with multiple blocks in file order.",
      "The write_to_file and replace_in_file tool responses will include the final state of the file. Use that final_file_content as the reference point for any subsequent edits.",
      "When the task is fully complete and verified, respond with <attempt_completion>...</attempt_completion>.",
      "",
      "# Tool Use Formatting",
      "Use XML-style tags for tool calls.",
      "<tool_name>",
      "<parameter_name>value</parameter_name>",
      "</tool_name>",
      "Use exactly one tool block per message.",
      "",
      "# Tools",
      renderedTools,
      "",
      "# Objective",
      task,
      "",
      "# History",
      renderHistory(context),
    ].join("\n");
  }
}
