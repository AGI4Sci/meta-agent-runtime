import type { ActionParser, ContextStrategy, LLMClient, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { ClineActionParser } from "./actionParser";
import { ClineContextStrategy } from "./contextStrategy";
import { ClinePromptBuilder } from "./promptBuilder";
import { CLINE_MINIMAL_TOOLS } from "./toolPreset";

export const CLINE_ADAPTER_NAME = "cline";

export function createClinePromptBuilder(): PromptBuilder {
  return new ClinePromptBuilder();
}

export function createClineActionParser(): ActionParser {
  return new ClineActionParser();
}

export function createClineContextStrategy(input: {
  max_tokens?: number;
  llm?: LLMClient;
}): ContextStrategy {
  return new ClineContextStrategy(input.max_tokens ?? 8000);
}

export function getClineToolPreset(): ToolSpec[] {
  return CLINE_MINIMAL_TOOLS;
}
