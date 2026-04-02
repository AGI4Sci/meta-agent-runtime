import type { ActionParser, ContextStrategy, PromptBuilder } from "../../../../runtime/src/core/interfaces";
import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { ClaudeCodeSourcemapActionParser } from "./actionParser";
import { ClaudeCodeSourcemapContextStrategy } from "./contextStrategy";
import { ClaudeCodeSourcemapPromptBuilder } from "./promptBuilder";
import { createClaudeCodeSourcemapToolPreset } from "./toolPreset";

export const CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME = "claude-code-sourcemap";

export function createClaudeCodeSourcemapPromptBuilder(): PromptBuilder {
  return new ClaudeCodeSourcemapPromptBuilder();
}

export function createClaudeCodeSourcemapActionParser(): ActionParser {
  return new ClaudeCodeSourcemapActionParser();
}

export function createClaudeCodeSourcemapContextStrategy(): ContextStrategy {
  return new ClaudeCodeSourcemapContextStrategy();
}

export function getClaudeCodeSourcemapToolPreset(): ToolSpec[] {
  return createClaudeCodeSourcemapToolPreset();
}
