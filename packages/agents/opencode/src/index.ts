import type { ActionParser, ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import { OpenCodeActionParser } from "./actionParser";
import { OpenCodeContextStrategy } from "./contextStrategy";
import { OpenCodePromptBuilder } from "./promptBuilder";
import { createOpenCodeToolPreset, openCodeToolPreset } from "./toolPreset";

export const OPENCODE_ADAPTER_NAME = "opencode";
export const OPENCODE_PROMPT_BUILDER = "opencode";
export const OPENCODE_ACTION_PARSER = "opencode";
export const OPENCODE_CONTEXT_STRATEGY = "opencode";
export const OPENCODE_TOOL_PRESET = "opencode";

export function createOpenCodePromptBuilder(): PromptBuilder {
  return new OpenCodePromptBuilder();
}

export function createOpenCodeActionParser(): ActionParser {
  return new OpenCodeActionParser();
}

export function createOpenCodeContextStrategy(maxTokens = 8_000): ContextStrategy {
  return new OpenCodeContextStrategy(maxTokens);
}

export {
  OpenCodeActionParser,
  OpenCodeContextStrategy,
  OpenCodePromptBuilder,
  createOpenCodeToolPreset,
  openCodeToolPreset,
};
