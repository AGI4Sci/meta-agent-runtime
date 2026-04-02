import type { ContextStrategy } from "../../core/interfaces";
import type { Context, ContextEntry } from "../../core/types";

export class OpenHandsContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens = 8000) {}

  trim(context: Context): Context {
    if (context.tokenCount <= this.maxTokens || context.entries.length <= 2) {
      return context;
    }

    const trimmedEntries = [...context.entries];
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
