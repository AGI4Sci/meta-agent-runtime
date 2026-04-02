import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";

function estimateEntryTokens(content: string): number {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export class GooseContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number = 8000) {}

  trim(context: Context): Context {
    let runningTotal = 0;
    const keptEntries = [...context.entries]
      .reverse()
      .filter((entry) => {
        const entryTokens = estimateEntryTokens(entry.content);
        if (runningTotal + entryTokens > this.maxTokens && runningTotal > 0) {
          return false;
        }
        runningTotal += entryTokens;
        return true;
      })
      .reverse();

    return {
      ...context,
      entries: keptEntries,
      tokenCount: Math.min(context.tokenCount, this.maxTokens),
    };
  }
}
