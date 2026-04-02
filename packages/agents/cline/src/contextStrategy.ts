import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ClineContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const kept: ContextEntry[] = [];
    let tokenCount = estimateTokens(context.task);

    for (let index = context.entries.length - 1; index >= 0; ) {
      const current = context.entries[index];
      const pairStart =
        current?.role === "tool" &&
        index > 0 &&
        context.entries[index - 1]?.role === "assistant"
          ? index - 1
          : index;
      const chunk = context.entries.slice(pairStart, index + 1);
      const chunkTokens = chunk.reduce(
        (sum, entry) => sum + estimateTokens(entry.content),
        0,
      );

      if (kept.length > 0 && tokenCount + chunkTokens > this.maxTokens) {
        break;
      }

      kept.unshift(...chunk);
      tokenCount += chunkTokens;
      index = pairStart - 1;
    }

    return {
      ...context,
      entries: kept,
      tokenCount,
    };
  }
}
