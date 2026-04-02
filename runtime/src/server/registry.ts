import type { ActionParser, ContextStrategy, LLMClient, PromptBuilder } from "../core/interfaces";
import type { ToolSpec } from "../core/toolSpec";
import {
  createClineActionParser,
  createClineContextStrategy,
  createClinePromptBuilder,
  getClineToolPreset,
} from "../../../packages/agents/cline/src";
import { SelectiveRetentionStrategy } from "../context/selective";
import { SlidingWindowStrategy } from "../context/slidingWindow";
import { SummarizationStrategy } from "../context/summarization";
import { NoopContextStrategy } from "../context/noop";
import { AnthropicLLMClient } from "../llm/anthropicClient";
import { LocalLLMClient } from "../llm/localClient";
import { OpenAILLMClient } from "../llm/openaiClient";
import { FunctionCallActionParser } from "../parser/functionCall";
import { JSONActionParser } from "../parser/jsonParser";
import { ReActActionParser } from "../parser/reactParser";
import { XMLActionParser } from "../parser/xmlParser";
import { CoTPromptBuilder } from "../prompt/cot";
import { MinimalPromptBuilder } from "../prompt/minimal";
import { ReActPromptBuilder } from "../prompt/react";
import { SmolagentsPromptBuilder } from "../prompt/smolagents";
import { SWEAgentPromptBuilder } from "../prompt/sweAgent";
import { bashTool } from "../tools/bash";
import { fileEditTool } from "../tools/fileEdit";
import { fileReadTool } from "../tools/fileRead";
import { fileWriteTool } from "../tools/fileWrite";
import { searchTool } from "../tools/search";

export const PROMPT_BUILDERS: Record<string, () => PromptBuilder> = {
  react: () => new ReActPromptBuilder(),
  cot: () => new CoTPromptBuilder(),
  minimal: () => new MinimalPromptBuilder(),
  smolagents: () => new SmolagentsPromptBuilder(),
  swe_agent: () => new SWEAgentPromptBuilder(),
  cline: () => createClinePromptBuilder(),
};

export const ACTION_PARSERS: Record<string, () => ActionParser> = {
  json: () => new JSONActionParser(),
  xml: () => new XMLActionParser(),
  function_call: () => new FunctionCallActionParser(),
  react: () => new ReActActionParser(),
  cline: () => createClineActionParser(),
};

export const CONTEXT_STRATEGIES: Record<
  string,
  (params: { max_tokens?: number; llm?: LLMClient }) => ContextStrategy
> = {
  noop: () => new NoopContextStrategy(),
  sliding_window: ({ max_tokens = 8000 }) => new SlidingWindowStrategy(max_tokens),
  summarization: ({ max_tokens = 8000, llm }) => new SummarizationStrategy(max_tokens, llm!),
  selective: () => new SelectiveRetentionStrategy(),
  cline: ({ max_tokens = 8000, llm }) =>
    createClineContextStrategy({ max_tokens, llm }),
};

export const TOOL_PRESETS: Record<string, ToolSpec[]> = {
  swe: [bashTool, fileReadTool, fileWriteTool, fileEditTool, searchTool],
  minimal: [bashTool],
  cline_minimal: getClineToolPreset(),
};

export function createLLM(input: {
  provider: "anthropic" | "openai" | "local";
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): LLMClient {
  if (input.provider === "anthropic") {
    return new AnthropicLLMClient(input.model, input.apiKey);
  }
  if (input.provider === "openai") {
    return new OpenAILLMClient(input.model, input.apiKey, input.baseUrl);
  }
  return new LocalLLMClient(input.model, input.baseUrl);
}
