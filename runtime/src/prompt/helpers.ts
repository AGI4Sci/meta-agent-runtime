import type { Context } from "../core/types";
import { localizeText, type ToolSpec } from "../core/toolSpec";
import type { PromptLanguage } from "../core/interfaces";

export function renderTools(tools: ToolSpec[], language: PromptLanguage): string {
  return tools
    .map(
      (tool) =>
        `- ${tool.name}: ${localizeText(tool.description, language)}\n  schema: ${JSON.stringify(tool.argsSchema)}`,
    )
    .join("\n");
}

export function renderContext(context: Context, language: PromptLanguage): string {
  if (context.entries.length === 0) {
    return label(language, {
      zh: "（暂无历史）",
      en: "(no history)",
    });
  }

  return context.entries
    .map((entry, index) => `[${index + 1}] ${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");
}

export function label(language: PromptLanguage, values: { zh: string; en: string }): string {
  return language === "zh" ? values.zh : values.en;
}
