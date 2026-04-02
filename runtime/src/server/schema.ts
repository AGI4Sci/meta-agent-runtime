import { z } from "zod";
import { ACTION_PARSERS, CONTEXT_STRATEGIES, PROMPT_BUILDERS, TOOL_PRESETS } from "./registry";

function registryKeySchema(label: string, registry: Record<string, unknown>) {
  return z.string().refine((value) => value in registry, {
    message: `${label} must be one of: ${Object.keys(registry).sort().join(", ")}`,
  });
}

export const RunRequestSchema = z.object({
  task: z.string().min(1),
  llm: z.object({
    provider: z.enum(["anthropic", "openai", "local"]),
    model: z.string(),
    api_key: z.string().optional(),
    base_url: z.string().optional(),
  }),
  prompt_builder: registryKeySchema("prompt_builder", PROMPT_BUILDERS).default("react"),
  action_parser: registryKeySchema("action_parser", ACTION_PARSERS).default("json"),
  context_strategy: z
    .object({
      name: registryKeySchema("context_strategy.name", CONTEXT_STRATEGIES),
      max_tokens: z.number().optional(),
    })
    .default({ name: "sliding_window", max_tokens: 8000 }),
  tools: registryKeySchema("tools", TOOL_PRESETS).or(z.literal("custom")).default("swe"),
  config: z
    .object({
      max_steps: z.number().default(50),
      max_tokens: z.number().default(100000),
      budget_token: z.number().optional(),
      budget_time_ms: z.number().optional(),
    })
    .default({}),
});

export const RunResponseSchema = z.object({
  success: z.boolean(),
  result: z.string(),
  termination_reason: z.enum(["finish", "max_steps", "max_tokens", "budget_token", "budget_time", "error"]),
  steps: z.array(
    z.object({
      step: z.number(),
      action_name: z.string(),
      action_args: z.record(z.unknown()),
      observation_content: z.string(),
      observation_error: z.string().nullable(),
      token_in: z.number(),
      token_out: z.number(),
      elapsed_ms: z.number(),
    }),
  ),
  total_token_in: z.number(),
  total_token_out: z.number(),
  total_elapsed_ms: z.number(),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
