import type { LLMClient } from "../core/interfaces";

export abstract class BaseLLMClient implements LLMClient {
  abstract complete(prompt: string): Promise<string>;

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

