import type { Action, Context, RunResult, StepRecord } from "./types";
import type { ToolSpec } from "./toolSpec";

export interface LLMClient {
  complete(prompt: string): Promise<string> | string;
  countTokens(text: string): number;
}

export interface PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string;
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

