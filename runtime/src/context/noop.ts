import type { ContextStrategy } from "../core/interfaces";
import type { Context } from "../core/types";

export class NoopContextStrategy implements ContextStrategy {
  trim(context: Context): Context {
    return {
      ...context,
      entries: [...context.entries],
    };
  }
}

