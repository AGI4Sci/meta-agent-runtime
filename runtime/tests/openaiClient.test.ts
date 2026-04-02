import assert from "node:assert/strict";
import test from "node:test";
import { OpenAILLMClient } from "../src/llm/openaiClient";

test("openai client calls chat completions and returns message content", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "done",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const client = new OpenAILLMClient("demo-model", "demo-key", "http://example.com/v1");
    const result = await client.complete("hello");
    assert.equal(result, "done");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://example.com/v1/chat/completions");
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("authorization"), "Bearer demo-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
