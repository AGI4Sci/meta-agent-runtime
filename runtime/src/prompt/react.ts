import type { PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { renderContext, renderTools } from "./helpers";

export class ReActPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are a coding agent operating in a tool loop.",
      "Think briefly, then produce one action as JSON: {\"name\": ..., \"args\": {...}}.",
      "When the task is complete, call finish.",
      "",
      `Task:\n${task}`,
      "",
      `Tools:\n${renderTools(tools)}`,
      "",
      `History:\n${renderContext(context)}`,
    ].join("\n");
  }
}

