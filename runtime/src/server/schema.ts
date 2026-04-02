import { z } from "zod";
import { ACTION_PARSERS, CONTEXT_STRATEGIES, PROMPT_BUILDERS, TOOL_PRESETS } from "./registry";

export const PUBLIC_PROMPT_BUILDERS = [
  "react",
  "cot",
  "minimal",
  "smolagents",
  "swe_agent",
] as const;

export const PUBLIC_ACTION_PARSERS = [
  "json",
  "xml",
  "function_call",
  "react",
] as const;

export const PUBLIC_CONTEXT_STRATEGIES = [
  "noop",
  "sliding_window",
  "summarization",
  "selective",
] as const;

export const PUBLIC_TOOL_PRESETS = ["swe", "minimal"] as const;

export const BASE_PROMPT_BUILDERS = PUBLIC_PROMPT_BUILDERS;
export const BASE_ACTION_PARSERS = PUBLIC_ACTION_PARSERS;
export const BASE_CONTEXT_STRATEGIES = PUBLIC_CONTEXT_STRATEGIES;
export const BASE_TOOL_PRESETS = PUBLIC_TOOL_PRESETS;

function registeredKeySchema<const TBase extends readonly [string, ...string[]]>(
  label: string,
  baseValues: TBase,
  registry: Record<string, unknown>,
) {
  return z.string().refine((value) => value in registry, {
    message: `${label} must be one of: ${[...new Set([...baseValues, ...Object.keys(registry)])].sort().join(", ")}`,
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
  prompt_builder: z.enum(PUBLIC_PROMPT_BUILDERS).default("react"),
  action_parser: z.enum(PUBLIC_ACTION_PARSERS).default("json"),
  context_strategy: z
    .object({
      name: z.enum(PUBLIC_CONTEXT_STRATEGIES),
      max_tokens: z.number().optional(),
    })
    .default({ name: "sliding_window", max_tokens: 8000 }),
  tools: z.enum(["swe", "minimal", "custom"]).default("swe"),
  config: z
    .object({
      max_steps: z.number().default(50),
      max_tokens: z.number().default(100000),
      budget_token: z.number().optional(),
      budget_time_ms: z.number().optional(),
    })
    .default({}),
});

export const RunRequestCompatSchema = z.object({
  task: z.string().min(1),
  llm: z.object({
    provider: z.enum(["anthropic", "openai", "local"]),
    model: z.string(),
    api_key: z.string().optional(),
    base_url: z.string().optional(),
  }),
  prompt_builder: registeredKeySchema("prompt_builder", BASE_PROMPT_BUILDERS, PROMPT_BUILDERS).default("react"),
  action_parser: registeredKeySchema("action_parser", BASE_ACTION_PARSERS, ACTION_PARSERS).default("json"),
  context_strategy: z
    .object({
      name: registeredKeySchema(
        "context_strategy.name",
        BASE_CONTEXT_STRATEGIES,
        CONTEXT_STRATEGIES,
      ),
      max_tokens: z.number().optional(),
    })
    .default({ name: "sliding_window", max_tokens: 8000 }),
  tools: registeredKeySchema("tools", [...BASE_TOOL_PRESETS, "custom"], TOOL_PRESETS)
    .or(z.literal("custom"))
    .default("swe"),
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

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

export const RegistryResponseSchema = z.object({
  prompt_builders: z.array(z.string()),
  action_parsers: z.array(z.string()),
  context_strategies: z.array(z.string()),
  tools: z.array(z.string()),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type RunRequestCompat = z.infer<typeof RunRequestCompatSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type RegistryResponse = z.infer<typeof RegistryResponseSchema>;
