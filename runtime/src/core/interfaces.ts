import type { Action, Context, RunResult, StepRecord } from "./types";
import type { ToolSpec } from "./toolSpec";

export type PromptLanguage = "zh" | "en";

export interface PromptBuildOptions {
  language: PromptLanguage;
}

export interface LLMClient {
  complete(prompt: string): Promise<string> | string;
  countTokens(text: string): number;
}

export interface PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context, options: PromptBuildOptions): string;
}

export interface ActionParser {
  parse(rawText: string): Action;
}

export interface ContextStrategy {
  trim(context: Context): Context;
}

export interface Observer {
  onStep(record: StepRecord): void;
  onRunEnd(result: RunResult): void;
}
