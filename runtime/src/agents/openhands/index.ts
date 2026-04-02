import { OpenHandsContextStrategy } from "./context";
import { OpenHandsActionParser } from "./parser";
import { OpenHandsPromptBuilder } from "./prompt";
import { OPENHANDS_MINIMAL_TOOLS } from "./tools";

export const OPENHANDS_ADAPTER_NAME = "openhands";
export const OPENHANDS_PROMPT_BUILDER = "openhands";
export const OPENHANDS_ACTION_PARSER = "openhands";
export const OPENHANDS_CONTEXT_STRATEGY = "openhands";
export const OPENHANDS_TOOL_PRESET = "openhands_minimal";

export function createOpenHandsPromptBuilder(): OpenHandsPromptBuilder {
  return new OpenHandsPromptBuilder();
}

export function createOpenHandsActionParser(): OpenHandsActionParser {
  return new OpenHandsActionParser();
}

export function createOpenHandsContextStrategy(params: {
  max_tokens?: number;
}): OpenHandsContextStrategy {
  return new OpenHandsContextStrategy(params.max_tokens ?? 8000);
}

export function createOpenHandsTools() {
  return [...OPENHANDS_MINIMAL_TOOLS];
}
