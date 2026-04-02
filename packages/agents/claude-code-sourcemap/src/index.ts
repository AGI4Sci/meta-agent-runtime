import type { ActionParser, ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import {
  CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME,
  CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES,
  CLAUDE_CODE_SOURCEMAP_FINISH_EXAMPLE,
  CLAUDE_CODE_SOURCEMAP_FUNCTION_CALL_EXAMPLE,
  CLAUDE_CODE_SOURCEMAP_TOOL_NAMES,
} from "./constants";
import { ClaudeCodeSourcemapActionParser } from "./actionParser";
import { ClaudeCodeSourcemapContextStrategy } from "./contextStrategy";
import { ClaudeCodeSourcemapPromptBuilder } from "./promptBuilder";
import {
  claudeCodeSourcemapToolPreset,
  createClaudeCodeSourcemapToolPreset,
} from "./toolPreset";
import {
  CLAUDE_CODE_SOURCEMAP_BASELINE_CONFIG,
  createClaudeCodeSourcemapAdapter,
} from "./adapter";

export function createClaudeCodeSourcemapPromptBuilder(): PromptBuilder {
  return new ClaudeCodeSourcemapPromptBuilder();
}

export function createClaudeCodeSourcemapActionParser(): ActionParser {
  return new ClaudeCodeSourcemapActionParser();
}

export function createClaudeCodeSourcemapContextStrategy(maxEntries = CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES): ContextStrategy {
  return new ClaudeCodeSourcemapContextStrategy(maxEntries);
}

export function getClaudeCodeSourcemapToolPreset(): ToolSpec[] {
  return createClaudeCodeSourcemapToolPreset();
}

export {
  CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME,
  CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES,
  CLAUDE_CODE_SOURCEMAP_FINISH_EXAMPLE,
  CLAUDE_CODE_SOURCEMAP_FUNCTION_CALL_EXAMPLE,
  CLAUDE_CODE_SOURCEMAP_TOOL_NAMES,
  CLAUDE_CODE_SOURCEMAP_BASELINE_CONFIG,
  ClaudeCodeSourcemapActionParser,
  ClaudeCodeSourcemapContextStrategy,
  ClaudeCodeSourcemapPromptBuilder,
  claudeCodeSourcemapToolPreset,
  createClaudeCodeSourcemapAdapter,
};
