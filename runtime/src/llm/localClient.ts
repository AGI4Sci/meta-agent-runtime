import { BaseLLMClient } from "./base";

export class LocalLLMClient extends BaseLLMClient {
  constructor(
    private readonly model: string,
    private readonly baseUrl = "http://localhost:11434",
  ) {
    super();
  }

  async complete(_prompt: string): Promise<string> {
    throw new Error(
      `LocalLLMClient for model '${this.model}' at '${this.baseUrl}' is a scaffold. Inject a real provider implementation before production use.`,
    );
  }
}

