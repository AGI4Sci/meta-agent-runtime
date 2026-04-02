import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context, ContextEntry } from "../../../../runtime/src/core/types";

export class ClaudeCodeSourcemapContextStrategy implements ContextStrategy {
  constructor(private readonly maxEntries = 12) {}

  trim(context: Context): Context {
    if (context.entries.length <= this.maxEntries) {
      return context;
    }

    const errors = context.entries.filter(
      (entry: ContextEntry) =>
        entry.role === "tool" &&
        typeof entry.metadata.error === "string" &&
        entry.metadata.error.length > 0,
    );
    const tail = context.entries.slice(-this.maxEntries);
    const deduped = new Map<string, ContextEntry>();

    for (const entry of [...errors, ...tail]) {
      const key = `${entry.role}:${entry.content}:${String(entry.metadata.error ?? "")}`;
      deduped.set(key, entry);
    }

    return {
      ...context,
      entries: Array.from(deduped.values()),
    };
  }
}
