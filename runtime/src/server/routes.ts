import type { FastifyInstance } from "fastify";
import { AgentRuntime } from "../core/runtime";
import { ACTION_PARSERS, CONTEXT_STRATEGIES, createLLM, PROMPT_BUILDERS, TOOL_PRESETS } from "./registry";
import {
  HealthResponseSchema,
  RegistryResponseSchema,
  RunRequestCompatSchema,
  RunResponseSchema,
} from "./schema";
import { scopeToolsToWorkspace } from "../tools/workspace";
import type { Observer } from "../core/interfaces";

export function resolveToolPreset(requestedTools: string): string {
  if (requestedTools !== "custom") {
    if (!(requestedTools in TOOL_PRESETS)) {
      throw new Error(`Unknown tool preset: ${requestedTools}`);
    }
    return requestedTools;
  }

  const presetName = process.env.RUNTIME_TOOLS_PRESET;
  if (!presetName) {
    throw new Error('RUNTIME_TOOLS_PRESET must be set when tools="custom"');
  }
  if (!(presetName in TOOL_PRESETS)) {
    throw new Error(`RUNTIME_TOOLS_PRESET must reference a registered tool preset, got: ${presetName}`);
  }
  return presetName;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      version: "0.1.0",
    }),
  );

  app.get("/registry", async () =>
    RegistryResponseSchema.parse({
      prompt_builders: Object.keys(PROMPT_BUILDERS).sort(),
      action_parsers: Object.keys(ACTION_PARSERS).sort(),
      context_strategies: Object.keys(CONTEXT_STRATEGIES).sort(),
      tools: Object.keys(TOOL_PRESETS).sort(),
    }),
  );

  app.post("/run", async (request, reply) => {
    const payload = RunRequestCompatSchema.parse(request.body);
    const traceEnabled = process.env.RUNTIME_TRACE === "1";
    const llm = createLLM({
      provider: payload.llm.provider,
      model: payload.llm.model,
      apiKey: payload.llm.api_key,
      baseUrl: payload.llm.base_url,
    });
    const promptBuilder = PROMPT_BUILDERS[payload.prompt_builder]();
    const actionParser = ACTION_PARSERS[payload.action_parser]();
    const contextStrategy = CONTEXT_STRATEGIES[payload.context_strategy.name]({
      max_tokens: payload.context_strategy.max_tokens,
      llm,
    });
    const tools = scopeToolsToWorkspace(
      TOOL_PRESETS[resolveToolPreset(payload.tools)],
      payload.config.workspace_root,
    );
    const observers: Observer[] = traceEnabled
      ? [
          {
            onStep(record) {
              request.log.info(
                {
                  step: record.step,
                  action_name: record.action.name,
                  elapsed_ms: record.elapsedMs,
                  token_in: record.tokenIn,
                  token_out: record.tokenOut,
                  observation_error: record.observation.error,
                },
                "agent step completed",
              );
            },
            onRunEnd(result) {
              request.log.info(
                {
                  termination_reason: result.terminationReason,
                  success: result.success,
                  steps: result.steps.length,
                  total_elapsed_ms: result.totalElapsedMs,
                  total_token_in: result.totalTokenIn,
                  total_token_out: result.totalTokenOut,
                },
                "agent run completed",
              );
            },
          },
        ]
      : [];

    const runtime = new AgentRuntime({
      llm,
      tools,
      promptBuilder,
      actionParser,
      contextStrategy,
      observers,
      config: {
        maxSteps: payload.config.max_steps,
        maxTokens: payload.config.max_tokens,
        budgetToken: payload.config.budget_token,
        budgetTimeMs: payload.config.budget_time_ms,
        workspaceRoot: payload.config.workspace_root,
      },
    });

    const result = await runtime.run(payload.task);
    const response = RunResponseSchema.parse({
      success: result.success,
      result: result.result,
      termination_reason: result.terminationReason,
      steps: result.steps.map((step) => ({
        step: step.step,
        action_name: step.action.name,
        action_args: step.action.args,
        observation_content: step.observation.content,
        observation_error: step.observation.error,
        token_in: step.tokenIn,
        token_out: step.tokenOut,
        elapsed_ms: step.elapsedMs,
      })),
      total_token_in: result.totalTokenIn,
      total_token_out: result.totalTokenOut,
      total_elapsed_ms: result.totalElapsedMs,
    });

    return reply.send(response);
  });
}
