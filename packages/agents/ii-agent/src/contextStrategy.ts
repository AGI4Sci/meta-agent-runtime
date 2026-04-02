import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";
import { findLatestTodoSnapshotIndex } from "./todoState";

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateEntryTokens(entry: Context["entries"][number]): number {
  return estimateTokens(entry.content);
}

export class IIAgentContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens = 8000) {}

  trim(context: Context): Context {
    const taskTokens = estimateTokens(context.task);
    let runningTokens = taskTokens;
    const keptIndices = new Set<number>();
    const latestTodoIndex = findLatestTodoSnapshotIndex(context.entries);

    if (latestTodoIndex >= 0) {
      const todoEntry = context.entries[latestTodoIndex]!;
      keptIndices.add(latestTodoIndex);
      runningTokens += estimateEntryTokens(todoEntry);
    }

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      if (keptIndices.has(index)) {
        continue;
      }
      const entryTokens = estimateEntryTokens(entry);
      if (keptIndices.size > 0 && runningTokens + entryTokens > this.maxTokens) {
        break;
      }
      keptIndices.add(index);
      runningTokens += entryTokens;
    }

    const kept = context.entries.filter((_, index) => keptIndices.has(index));

    return {
      ...context,
      entries: kept,
      tokenCount: runningTokens,
    };
  }
}
