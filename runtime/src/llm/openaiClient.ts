import { BaseLLMClient } from "./base";

export class OpenAILLMClient extends BaseLLMClient {
  constructor(
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly baseUrl?: string,
  ) {
    super();
  }

  async complete(_prompt: string): Promise<string> {
    throw new Error(
      `OpenAILLMClient for model '${this.model}' is a scaffold. Inject a real provider implementation before production use.`,
    );
  }
}

