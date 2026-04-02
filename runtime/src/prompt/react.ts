import type { PromptBuildOptions, PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { label, renderContext, renderTools } from "./helpers";

export class ReActPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context, options: PromptBuildOptions): string {
    const language = options.language;
    return [
      label(language, {
        zh: "你是一个在工具循环中运行的代码智能体。",
        en: "You are a coding agent operating in a tool loop.",
      }),
      label(language, {
        zh: "请先简短思考，然后只输出一个 JSON action：{\"name\": ..., \"args\": {...}}。",
        en: "Think briefly, then produce one action as JSON: {\"name\": ..., \"args\": {...}}.",
      }),
      label(language, {
        zh: "当任务完成时，请调用 finish。",
        en: "When the task is complete, call finish.",
      }),
      "",
      `${label(language, { zh: "任务", en: "Task" })}:\n${task}`,
      "",
      `${label(language, { zh: "工具", en: "Tools" })}:\n${renderTools(tools, language)}`,
      "",
      `${label(language, { zh: "历史", en: "History" })}:\n${renderContext(context, language)}`,
    ].join("\n");
  }
}
