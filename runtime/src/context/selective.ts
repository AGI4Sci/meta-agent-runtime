import type { ContextStrategy } from "../core/interfaces";
import type { Context } from "../core/types";

export class SelectiveRetentionStrategy implements ContextStrategy {
  trim(context: Context): Context {
    const retained = context.entries.filter((entry) => {
      const error = entry.metadata.error;
      return typeof error === "string" && error.length > 0;
    });
    const latest = context.entries.slice(-4);
    const merged = [...retained, ...latest].filter(
      (entry, index, array) => array.findIndex((candidate) => candidate === entry) === index,
    );
    return {
      ...context,
      entries: merged,
      tokenCount: Math.ceil(context.task.length / 4) + merged.reduce((sum, entry) => sum + Math.ceil(entry.content.length / 4), 0),
    };
  }
}

