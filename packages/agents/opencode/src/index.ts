import { OpenCodeActionParser } from "./actionParser";
import { OpenCodeContextStrategy } from "./contextStrategy";
import { OpenCodePromptBuilder } from "./promptBuilder";
import { openCodeToolPreset } from "./toolPreset";

export const OPENCODE_ADAPTER_NAME = "opencode";

export function createOpenCodePromptBuilder() {
  return new OpenCodePromptBuilder();
}

export function createOpenCodeActionParser() {
  return new OpenCodeActionParser();
}

export function createOpenCodeContextStrategy(maxTokens = 8_000) {
  return new OpenCodeContextStrategy(maxTokens);
}

export function createOpenCodeToolPreset() {
  return openCodeToolPreset;
}
