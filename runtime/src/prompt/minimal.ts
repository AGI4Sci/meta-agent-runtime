import type { PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { renderContext, renderTools } from "./helpers";

export class MinimalPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [`TASK:\n${task}`, `TOOLS:\n${renderTools(tools)}`, `HISTORY:\n${renderContext(context)}`].join("\n\n");
  }
}

