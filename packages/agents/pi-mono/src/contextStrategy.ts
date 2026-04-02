import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class PiMonoContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const preserved = context.entries.filter((entry) => entry.metadata.pinned === true);
    const recent: ContextEntry[] = [];
    let tokenCount = preserved.reduce((sum, entry) => sum + estimateTokens(entry.content), 0);

    for (let index = context.entries.length - 1; index >= 0; index -= 2) {
      const assistantEntry = context.entries[index - 1];
      const toolEntry = context.entries[index];

      if (!assistantEntry || !toolEntry) {
        continue;
      }

      const pairTokens = estimateTokens(assistantEntry.content) + estimateTokens(toolEntry.content);
      if (recent.length > 0 && tokenCount + pairTokens > this.maxTokens) {
        break;
      }

      recent.unshift(assistantEntry, toolEntry);
      tokenCount += pairTokens;
    }

    const entries = [...preserved, ...recent];
    return {
      ...context,
      entries,
      tokenCount: estimateTokens(context.task) + entries.reduce((sum, entry) => sum + estimateTokens(entry.content), 0),
    };
  }
}
