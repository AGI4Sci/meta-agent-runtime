import type { ActionParser, ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import { GooseActionParser } from "./actionParser";
import { GooseContextStrategy } from "./contextStrategy";
import { GoosePromptBuilder } from "./promptBuilder";
import { GOOSE_TOOL_PRESET } from "./tools";

export const GOOSE_ADAPTER_NAME = "goose";

export function createGoosePromptBuilder(): PromptBuilder {
  return new GoosePromptBuilder();
}

export function createGooseActionParser(): ActionParser {
  return new GooseActionParser();
}

export function createGooseContextStrategy(): ContextStrategy {
  return new GooseContextStrategy();
}

export { GOOSE_TOOL_PRESET };
