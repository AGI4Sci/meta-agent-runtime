import type { PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { renderContext, renderTools } from "./helpers";

export class CoTPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "Solve the coding task step by step.",
      "Reason privately and return only a JSON action object.",
      "",
      `Task:\n${task}`,
      "",
      `Available tools:\n${renderTools(tools)}`,
      "",
      `Context:\n${renderContext(context)}`,
    ].join("\n");
  }
}

