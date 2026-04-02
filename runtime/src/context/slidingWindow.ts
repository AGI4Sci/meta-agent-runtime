import type { ContextStrategy } from "../core/interfaces";
import type { Context, ContextEntry } from "../core/types";

export class SlidingWindowStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const entries: ContextEntry[] = [];
    let tokenCount = 0;

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      const estimated = Math.ceil(entry.content.length / 4);
      if (entries.length > 0 && tokenCount + estimated > this.maxTokens) {
        break;
      }
      entries.unshift(entry);
      tokenCount += estimated;
    }

    return {
      ...context,
      entries,
      tokenCount: Math.ceil(context.task.length / 4) + tokenCount,
    };
  }
}

