import type { ContextStrategy, LLMClient } from "../core/interfaces";
import type { Context } from "../core/types";
import { SlidingWindowStrategy } from "./slidingWindow";

export class SummarizationStrategy implements ContextStrategy {
  private readonly slidingWindow: SlidingWindowStrategy;

  constructor(
    maxTokens: number,
    private readonly _llm: LLMClient,
  ) {
    this.slidingWindow = new SlidingWindowStrategy(maxTokens);
  }

  trim(context: Context): Context {
    // Placeholder: keep boundary stable while allowing a future LLM-backed summarizer.
    return this.slidingWindow.trim(context);
  }
}

