import type { PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";
import {
  II_AGENT_SYSTEM_PROMPT,
  TODO_READ_NAME,
  TODO_WRITE_NAME,
} from "./constants";
import { findLatestTodoSnapshot } from "./todoState";

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

function hasTool(tools: ToolSpec[], name: string): boolean {
  return tools.some((tool) => tool.name === name);
}

function buildBehaviorRules(tools: ToolSpec[]): string[] {
  const rules = [
    "- Inspect relevant files before editing them.",
    "- Prefer search and read operations before write or edit operations.",
    "- Use small verifiable steps and check results after each tool call.",
  ];

  if (hasTool(tools, TODO_WRITE_NAME)) {
    rules.push(`- Use ${TODO_WRITE_NAME} proactively for non-trivial multi-step work.`);
  }
  if (hasTool(tools, TODO_READ_NAME)) {
    rules.push(`- Use ${TODO_READ_NAME} when you need to recover the current plan.`);
  }

  rules.push("- When the task is complete, provide a concise final result.");
  return rules;
}

export class IIAgentPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    const toolSection = tools.map(renderTool).join("\n");
    const historySection =
      context.entries.length > 0
        ? context.entries.map(renderEntry).join("\n")
        : "(no prior turns)";
    const todoNote = findLatestTodoSnapshot(context.entries);
    const behaviorRules = buildBehaviorRules(tools).join("\n");

    return [
      II_AGENT_SYSTEM_PROMPT,
      "",
      `Workspace: ${process.cwd()}`,
      `Operating System: ${process.platform}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      "",
      "<behavior_rules>",
      behaviorRules,
      "</behavior_rules>",
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
      ...(todoNote
        ? [
            "<preserved_todo_state>",
            todoNote.content,
            "</preserved_todo_state>",
            "",
          ]
        : []),
      "If you need a tool, return one JSON action now.",
      'Example: {"name":"Read","args":{"file_path":"/abs/path/to/file.ts"}}',
      'If you are ready to conclude, use {"name":"finish","args":{"result":"..."}} or provide the final answer directly.',
    ].join("\n");
  }
}
