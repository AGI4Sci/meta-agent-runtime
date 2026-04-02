import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateEntryTokens(entry: ContextEntry): number {
  return estimateTokens(entry.content);
}

export class IIAgentContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens = 8000) {}

  trim(context: Context): Context {
    if (context.entries.length === 0) {
      return context;
    }

    const taskTokens = estimateTokens(context.task);
    let runningTokens = taskTokens;
    const kept: ContextEntry[] = [];

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      const entryTokens = estimateEntryTokens(entry);
      if (kept.length > 0 && runningTokens + entryTokens > this.maxTokens) {
        break;
      }
      kept.unshift(entry);
      runningTokens += entryTokens;
    }

    return {
      ...context,
      entries: kept,
      tokenCount: runningTokens,
    };
  }
}
