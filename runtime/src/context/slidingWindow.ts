import type { ContextStrategy } from "../core/interfaces";
import type { Context, ContextEntry } from "../core/types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return "";
  }

  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {
    return text;
  }

  const marker = "\n...[truncated]...\n";
  const available = Math.max(0, maxChars - marker.length);
  const headChars = Math.ceil(available / 2);
  const tailChars = Math.floor(available / 2);
  return `${text.slice(0, headChars)}${marker}${text.slice(text.length - tailChars)}`;
}

export class SlidingWindowStrategy implements ContextStrategy {
  constructor(private readonly maxTokens: number) {}

  trim(context: Context): Context {
    const entries: ContextEntry[] = [];
    let tokenCount = 0;
    let omitted = 0;

    for (let index = context.entries.length - 1; index >= 0; index -= 1) {
      const entry = context.entries[index];
      const estimated = estimateTokens(entry.content);
      const remaining = this.maxTokens - tokenCount;
      if (remaining <= 0) {
        omitted = index + 1;
        break;
      }

      if (estimated > remaining) {
        if (entries.length > 0) {
          omitted = index + 1;
          break;
        }
        const truncatedContent = truncateToTokenBudget(entry.content, remaining);
        entries.unshift({ ...entry, content: truncatedContent });
        tokenCount += estimateTokens(truncatedContent);
        omitted = index;
        break;
      }

      if (entries.length > 0 && tokenCount + estimated > this.maxTokens) {
        omitted = index + 1;
        break;
      }
      entries.unshift(entry);
      tokenCount += estimated;
    }

    if (omitted > 0) {
      const marker = `[Earlier history compacted: ${omitted} entries omitted]`;
      const markerTokens = estimateTokens(marker);
      while (entries.length > 1 && tokenCount + markerTokens > this.maxTokens) {
        const removed = entries.shift();
        if (removed) {
          tokenCount -= estimateTokens(removed.content);
          omitted += 1;
        }
      }
      if (tokenCount + markerTokens <= this.maxTokens) {
        entries.unshift({
          role: "assistant",
          content: marker,
          metadata: { condensed: true, omittedEntries: omitted, synthetic: true },
        });
        tokenCount += markerTokens;
      }
    }

    return {
      ...context,
      entries,
      tokenCount: estimateTokens(context.task) + tokenCount,
    };
  }
}
