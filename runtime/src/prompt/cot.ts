import type { PromptBuildOptions, PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { label, renderContext, renderTools } from "./helpers";

export class CoTPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context, options: PromptBuildOptions): string {
    const language = options.language;
    return [
      label(language, {
        zh: "请分步骤完成这个编程任务。",
        en: "Solve the coding task step by step.",
      }),
      label(language, {
        zh: "请在内部思考，并且只返回 JSON action 对象。",
        en: "Reason privately and return only a JSON action object.",
      }),
      "",
      `${label(language, { zh: "任务", en: "Task" })}:\n${task}`,
      "",
      `${label(language, { zh: "可用工具", en: "Available tools" })}:\n${renderTools(tools, language)}`,
      "",
      `${label(language, { zh: "上下文", en: "Context" })}:\n${renderContext(context, language)}`,
    ].join("\n");
  }
}
