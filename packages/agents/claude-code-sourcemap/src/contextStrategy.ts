import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import { CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES } from "./constants";

export class ClaudeCodeSourcemapContextStrategy implements ContextStrategy {
  constructor(private readonly maxEntries = CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES) {}

  trim(context: Context): Context {
    const entries = [...context.entries];
    if (entries.length <= this.maxEntries) {
      return {
        ...context,
        entries,
      };
    }

    let start = Math.max(0, entries.length - this.maxEntries);
    if (
      start > 0 &&
      entries[start]?.role === "tool" &&
      entries[start - 1]?.role === "assistant"
    ) {
      start -= 1;
    }

    return {
      ...context,
      entries: entries.slice(start),
    };
  }
}
