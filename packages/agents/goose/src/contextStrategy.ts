import type { ContextStrategy } from "../../../../runtime/src/core/interfaces";
import type { Context } from "../../../../runtime/src/core/types";

export class GooseContextStrategy implements ContextStrategy {
  constructor(private readonly maxEntries: number = 24) {}

  trim(context: Context): Context {
    if (context.entries.length <= this.maxEntries) {
      return {
        ...context,
        entries: [...context.entries],
      };
    }

    return {
      ...context,
      entries: context.entries.slice(-this.maxEntries),
    };
  }
}
