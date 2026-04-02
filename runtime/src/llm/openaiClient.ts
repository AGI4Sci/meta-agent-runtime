import { BaseLLMClient } from "./base";

export class OpenAILLMClient extends BaseLLMClient {
  constructor(
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly baseUrl?: string,
  ) {
    super();
  }

  async complete(prompt: string): Promise<string> {
    const apiKey = this.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI-compatible provider requires an API key");
    }

    const baseUrl = (this.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const timeoutMs = Number(process.env.RUNTIME_LLM_TIMEOUT_MS ?? 300000);
    const shouldTrace = process.env.RUNTIME_TRACE === "1";
    const startedAt = Date.now();
    if (shouldTrace) {
      console.info(
        `[llm] start provider=openai model=${this.model} base_url=${baseUrl} prompt_chars=${prompt.length} timeout_ms=${timeoutMs}`,
      );
    }
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        if (shouldTrace) {
          console.info(
            `[llm] timeout provider=openai model=${this.model} elapsed_ms=${Date.now() - startedAt}`,
          );
        }
        throw new Error(`OpenAI-compatible request timed out after ${timeoutMs}ms`);
      }
      if (shouldTrace) {
        console.info(
          `[llm] error provider=openai model=${this.model} elapsed_ms=${Date.now() - startedAt} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          choices?: Array<{
            message?: {
              content?: string | Array<{ type?: string; text?: string }>;
            };
            text?: string;
          }>;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      const errorMessage = payload?.error?.message ?? `${response.status} ${response.statusText}`;
      if (shouldTrace) {
        console.info(
          `[llm] response_error provider=openai model=${this.model} status=${response.status} elapsed_ms=${Date.now() - startedAt} error=${errorMessage}`,
        );
      }
      throw new Error(`OpenAI-compatible request failed: ${errorMessage}`);
    }
    if (shouldTrace) {
      console.info(
        `[llm] success provider=openai model=${this.model} status=${response.status} elapsed_ms=${Date.now() - startedAt}`,
      );
    }

    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content;
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((item) => item?.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
        .join("");
      if (text.trim()) {
        return text;
      }
    }
    if (typeof choice?.text === "string" && choice.text.trim()) {
      return choice.text;
    }

    throw new Error("OpenAI-compatible response did not include a text completion");
  }
}
