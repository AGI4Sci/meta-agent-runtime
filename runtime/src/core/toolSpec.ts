import type { Observation } from "./types";
import type { PromptLanguage } from "./interfaces";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ToolSpec {
  name: string;
  description: string | LocalizedText;
  argsSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  interpreter: (raw: unknown) => Observation;
}

export function localizeText(
  value: string | LocalizedText,
  language: PromptLanguage,
): string {
  if (typeof value === "string") {
    return value;
  }
  return value[language];
}

export function safeObservation(
  content: string,
  error: string | null = null,
  metadata: Record<string, unknown> = {},
): Observation {
  return { content, error, metadata };
}

export function safeInterpreter(
  interpreter: (raw: unknown) => Observation,
): (raw: unknown) => Observation {
  return (raw: unknown) => {
    try {
      const result = interpreter(raw);
      return {
        content: result.content ?? "",
        error: result.error ?? null,
        metadata: result.metadata ?? {},
      };
    } catch (error) {
      return safeObservation(
        "",
        `Interpreter error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}

export const FINISH_TOOL: ToolSpec = {
  name: "finish",
  description: {
    zh: "当任务完成时调用该工具，并通过 result 传入最终结果。",
    en: "Call this when the task is complete. Pass the final result as 'result'.",
  },
  argsSchema: {
    type: "object",
    properties: {
      result: { type: "string" },
    },
    required: ["result"],
  },
  call: (args) => args.result,
  interpreter: safeInterpreter((raw) =>
    safeObservation(String(raw ?? ""), null, { isFinish: true }),
  ),
};
