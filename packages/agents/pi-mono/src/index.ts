import type { ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import { PiMonoContextStrategy } from "./contextStrategy";
import { PiMonoActionParser } from "./parser";
import { PiMonoPromptBuilder } from "./promptBuilder";
import { piMonoCodingTools, piMonoReadonlyTools } from "./tools";

export const PI_MONO_ADAPTER_NAME = "pi-mono";

export function createPiMonoPromptBuilder(): PromptBuilder {
  return new PiMonoPromptBuilder();
}

export function createPiMonoActionParser(): PiMonoActionParser {
  return new PiMonoActionParser();
}

export function createPiMonoContextStrategy(maxTokens = 8000): ContextStrategy {
  return new PiMonoContextStrategy(maxTokens);
}

export { PiMonoActionParser, PiMonoContextStrategy, PiMonoPromptBuilder, piMonoCodingTools, piMonoReadonlyTools };
