import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class PiMonoContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const preserved = context.entries.filter((entry) => entry.metadata.pinned === true);
    const preservedSet = new Set(preserved);
    const recent: ContextEntry[] = [];
    let tokenCount = preserved.reduce((sum, entry) => sum + estimateTokens(entry.content), 0);

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      if (preservedSet.has(entry)) {
        continue;
      }

      const previous = context.entries[index - 1];
      const isAssistantToolPair =
        entry.role === "tool" &&
        previous?.role === "assistant" &&
        previous.metadata.step === entry.metadata.step;

      const batch: ContextEntry[] = isAssistantToolPair ? [previous, entry] : [entry];
      const batchTokens = batch.reduce((sum, item) => sum + estimateTokens(item.content), 0);

      if (recent.length > 0 && tokenCount + batchTokens > this.maxTokens) {
        break;
      }

      recent.unshift(...batch);
      tokenCount += batchTokens;
      if (isAssistantToolPair) {
        index -= 1;
      }
    }

    const entries = [...preserved, ...recent];
    return {
      ...context,
      entries,
      tokenCount: estimateTokens(context.task) + entries.reduce((sum, entry) => sum + estimateTokens(entry.content), 0),
    };
  }
}
