import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

export class OpenCodeContextStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const kept: ContextEntry[] = [];
    let tokenCount = Math.ceil(context.task.length / 4);

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      const estimated = Math.ceil(entry.content.length / 4);
      if (kept.length > 0 && tokenCount + estimated > this.maxTokens) {
        break;
      }
      kept.unshift(entry);
      tokenCount += estimated;
    }

    const omitted = context.entries.length - kept.length;
    if (omitted > 0) {
      const marker = `[Earlier OpenCode history omitted: ${omitted} entries]`;
      kept.unshift({
        role: "assistant",
        content: marker,
        metadata: { omittedEntries: omitted, condensed: true, synthetic: true },
      });
      tokenCount += Math.ceil(marker.length / 4);
    }

    return {
      ...context,
      entries: kept.map((entry) => ({
        ...entry,
        metadata: { ...entry.metadata },
      })),
      tokenCount,
    };
  }
}
