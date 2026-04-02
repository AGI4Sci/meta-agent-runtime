import type { ActionParser, ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import {
  CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME,
  CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES,
} from "./constants";
import { ClaudeCodeSourcemapActionParser } from "./actionParser";
import { ClaudeCodeSourcemapContextStrategy } from "./contextStrategy";
import { ClaudeCodeSourcemapPromptBuilder } from "./promptBuilder";
import { createClaudeCodeSourcemapToolPreset } from "./toolPreset";

export interface ClaudeCodeSourcemapAdapterOptions {
  maxContextEntries?: number;
  tools?: ToolSpec[];
}

export interface ClaudeCodeSourcemapAdapter {
  name: string;
  promptBuilder: PromptBuilder;
  actionParser: ActionParser;
  contextStrategy: ContextStrategy;
  tools: ToolSpec[];
}

export const CLAUDE_CODE_SOURCEMAP_BASELINE_CONFIG = Object.freeze({
  maxContextEntries: CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES,
});

export function createClaudeCodeSourcemapAdapter(
  options: ClaudeCodeSourcemapAdapterOptions = {},
): ClaudeCodeSourcemapAdapter {
  return {
    name: CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME,
    promptBuilder: new ClaudeCodeSourcemapPromptBuilder(),
    actionParser: new ClaudeCodeSourcemapActionParser(),
    contextStrategy: new ClaudeCodeSourcemapContextStrategy(
      options.maxContextEntries ?? CLAUDE_CODE_SOURCEMAP_BASELINE_CONFIG.maxContextEntries,
    ),
    tools: options.tools ?? createClaudeCodeSourcemapToolPreset(),
  };
}
