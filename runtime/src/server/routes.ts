import type { FastifyInstance } from "fastify";
import { AgentRuntime } from "../core/runtime";
import { AGENT_REGISTRATIONS } from "./agentRegistry";
import { CONTEXT_STRATEGIES, ACTION_PARSERS, createLLM, PROMPT_BUILDERS, TOOL_PRESETS } from "./registry";
import { RunRequestSchema, RunResponseSchema } from "./schema";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    version: "0.1.0",
  }));

  app.get("/registry", async () => ({
    agents: AGENT_REGISTRATIONS.map((registration) => registration.agent),
    prompt_builders: Object.keys(PROMPT_BUILDERS),
    action_parsers: Object.keys(ACTION_PARSERS),
    context_strategies: Object.keys(CONTEXT_STRATEGIES),
    tools: Object.keys(TOOL_PRESETS),
  }));

  app.post("/run", async (request, reply) => {
    const payload = RunRequestSchema.parse(request.body);
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
    const tools = TOOL_PRESETS[payload.tools === "custom" ? process.env.RUNTIME_TOOLS_PRESET ?? "minimal" : payload.tools] ?? TOOL_PRESETS.minimal;

    const runtime = new AgentRuntime({
      llm,
      tools,
      promptBuilder,
      actionParser,
      contextStrategy,
      config: {
        maxSteps: payload.config.max_steps,
        maxTokens: payload.config.max_tokens,
        budgetToken: payload.config.budget_token,
        budgetTimeMs: payload.config.budget_time_ms,
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
