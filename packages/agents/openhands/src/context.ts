import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

export class OpenHandsContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens = 8000) {}

  trim(context: Context): Context {
    const existingPrefix = context.entries[0]?.metadata.condensed === true;
    const baseEntries = existingPrefix ? context.entries.slice(1) : [...context.entries];

    if (context.tokenCount <= this.maxTokens || context.entries.length <= 2) {
      return {
        ...context,
        entries: [...context.entries],
      };
    }

    const trimmedEntries = [...baseEntries];
    while (trimmedEntries.length > 2 && estimateTokens(context.task, trimmedEntries) > this.maxTokens) {
      const deleteCount = trimmedEntries.length >= 2 ? 2 : 1;
      trimmedEntries.splice(0, deleteCount);
    }

    const prefix: ContextEntry = {
      role: "tool",
      content:
        "[Earlier OpenHands history condensed for the shared linear runtime. Delegation and exact event replay are not preserved.]",
      metadata: { condensed: true },
    };

    return {
      ...context,
      entries: [prefix, ...trimmedEntries],
      tokenCount: estimateTokens(context.task, [prefix, ...trimmedEntries]),
    };
  }
}

function estimateTokens(task: string, entries: ContextEntry[]): number {
  return Math.ceil(task.length / 4) + entries.reduce((sum, entry) => sum + Math.ceil(entry.content.length / 4), 0);
}
