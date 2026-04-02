import { BaseLLMClient } from "./base";

export class AnthropicLLMClient extends BaseLLMClient {
  constructor(
    private readonly model: string,
    private readonly apiKey?: string,
  ) {
    super();
  }

  async complete(_prompt: string): Promise<string> {
    throw new Error(
      `AnthropicLLMClient for model '${this.model}' is a scaffold. Inject a real provider implementation before production use.`,
    );
  }
}

