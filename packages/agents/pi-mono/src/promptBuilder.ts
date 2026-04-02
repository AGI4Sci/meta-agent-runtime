import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";

export interface PiMonoPromptBuilderOptions {
  cwd?: string;
  now?: () => Date;
}

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
  const deduped = new Set<string>();
  const push = (line: string) => {
    if (deduped.has(line)) {
      return;
    }
    deduped.add(line);
    guidelines.push(line);
  };

  if (names.has("bash") && !names.has("grep") && !names.has("find") && !names.has("ls")) {
    push("Use bash for file operations like ls, rg, find");
  }
  if (names.has("bash") && (names.has("grep") || names.has("find") || names.has("ls"))) {
    push("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
  }
  if (names.has("read") && names.has("edit")) {
    push("Use read to examine files before editing. You must use this tool instead of cat or sed.");
  }
  if (names.has("edit")) {
    push("Use edit for precise changes (old text must match exactly)");
  }
  if (names.has("write")) {
    push("Use write only for new files or complete rewrites");
  }
  if (names.has("edit") || names.has("write")) {
    push("When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did");
  }
  push("Be concise in your responses.");
  push("Show file paths clearly when working with files.");

  // Shared runtime compatibility: pi-mono originally emits native tool calls,
  // but this adapter routes through the runtime JSON action contract.
  push("Return exactly one JSON action object each turn.");
  push("Use finish once the task is complete.");

  return guidelines;
}

export class PiMonoPromptBuilder implements PromptBuilder {
  constructor(private readonly options: PiMonoPromptBuilderOptions = {}) {}

  build(task: string, tools: ToolSpec[], context: Context): string {
    const visibleTools = tools.filter((tool) => tool.name !== "finish");
    const toolList =
      visibleTools.length > 0
        ? visibleTools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")
        : "(none)";
    const guidelines = buildGuidelines(tools)
      .map((line) => `- ${line}`)
      .join("\n");
    const now = (this.options.now?.() ?? new Date()).toLocaleString("en-US", {
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
      "You help users by reading files, executing commands, editing code, and writing new files.",
      "",
      "Available tools:",
      toolList,
      "",
      "In addition to the tools above, you may have access to other custom tools depending on the project.",
      "",
      "Guidelines:",
      guidelines,
      "",
      `Current date and time: ${now}`,
      `Current working directory: ${this.options.cwd ?? process.cwd()}`,
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
