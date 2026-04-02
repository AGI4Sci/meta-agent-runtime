import type { PromptBuildOptions, PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { label, renderContext, renderTools } from "./helpers";

export class MinimalPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context, options: PromptBuildOptions): string {
    const language = options.language;
    return [
      `${label(language, { zh: "任务", en: "TASK" })}:\n${task}`,
      `${label(language, { zh: "工具", en: "TOOLS" })}:\n${renderTools(tools, language)}`,
      `${label(language, { zh: "历史", en: "HISTORY" })}:\n${renderContext(context, language)}`,
    ].join("\n\n");
  }
}
