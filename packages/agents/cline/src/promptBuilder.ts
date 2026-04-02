import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";

function renderTool(tool: ToolSpec): string {
  const schema = tool.argsSchema as {
    properties?: Record<string, { type?: unknown }>;
    required?: unknown;
  };
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  const properties = schema.properties ?? {};
  const params =
    Object.keys(properties).length === 0
      ? "Parameters: None"
      : [
          "Parameters:",
          ...Object.entries(properties).map(
            ([name, config]) =>
              `- ${name}: (${required.has(name) ? "required" : "optional"}) ${String(
                config.type ?? "string",
              )}`,
          ),
        ].join("\n");
  const usage =
    tool.name === "finish"
      ? [
          "<attempt_completion>",
          "<result>Final result here</result>",
          "<command>Optional demo command</command>",
          "</attempt_completion>",
        ].join("\n")
      : [
          `<${tool.name}>`,
          ...Object.keys(properties).map((name) => `<${name}>...</${name}>`),
          `</${tool.name}>`,
        ].join("\n");

  return [`## ${tool.name}`, `Description: ${tool.description}`, params, "Usage:", usage].join("\n");
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
      "Prefer the smallest tool needed for the current step.",
      "When the task is fully complete, respond with <attempt_completion>...</attempt_completion>.",
      "",
      "# Tool Use Formatting",
      "Use XML-style tags for tool calls.",
      "<tool_name>",
      "<parameter_name>value</parameter_name>",
      "</tool_name>",
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
