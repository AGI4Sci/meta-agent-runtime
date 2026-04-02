import { ParseError } from "./errors";
import type { ActionParser, ContextStrategy, LLMClient, Observer, PromptBuilder } from "./interfaces";
import { FINISH_TOOL, type ToolSpec, safeObservation, safeInterpreter } from "./toolSpec";
import {
  DEFAULT_RUNTIME_CONFIG,
  type Action,
  type Context,
  type ContextEntry,
  type Observation,
  type RunResult,
  type RuntimeConfig,
  type StepRecord,
  type TerminationReason,
} from "./types";

export interface AgentRuntimeOptions {
  llm: LLMClient;
  tools: ToolSpec[];
  promptBuilder: PromptBuilder;
  actionParser: ActionParser;
  contextStrategy: ContextStrategy;
  config?: Partial<RuntimeConfig>;
  observers?: Observer[];
}

export class AgentRuntime {
  private readonly llm: LLMClient;
  private readonly tools: ToolSpec[];
  private readonly promptBuilder: PromptBuilder;
  private readonly actionParser: ActionParser;
  private readonly contextStrategy: ContextStrategy;
  private readonly config: RuntimeConfig;
  private readonly observers: Observer[];

  constructor(options: AgentRuntimeOptions) {
    this.llm = options.llm;
    this.promptBuilder = options.promptBuilder;
    this.actionParser = options.actionParser;
    this.contextStrategy = options.contextStrategy;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...options.config };
    this.observers = options.observers ?? [];
    this.tools = this.normalizeTools(options.tools);
  }

  async run(task: string): Promise<RunResult> {
    const context: Context = { task, entries: [], step: 0, tokenCount: 0 };
    const records: StepRecord[] = [];
    let currentContext = context;
    let totalTokenIn = 0;
    let totalTokenOut = 0;
    const runStartedAt = Date.now();

    try {
      while (true) {
        const prompt = this.promptBuilder.build(task, this.tools, currentContext);
        const startedAt = Date.now();
        let rawText: string;

        try {
          rawText = await this.llm.complete(prompt);
        } catch (error) {
          return this.finalize({
            success: false,
            result: "",
            steps: records,
            totalTokenIn,
            totalTokenOut,
            totalElapsedMs: Date.now() - runStartedAt,
            terminationReason: "error",
          });
        }

        const tokenIn = this.llm.countTokens(prompt);
        const tokenOut = this.llm.countTokens(rawText);
        totalTokenIn += tokenIn;
        totalTokenOut += tokenOut;

        let action: Action;
        let observation: Observation;

        try {
          action = this.actionParser.parse(rawText);
        } catch (error) {
          if (error instanceof ParseError) {
            action = { name: "__parse_error__", args: {}, rawText };
            observation = safeObservation("", `Parse failed: ${error.message}`);
            currentContext = this.updateAndTrim(currentContext, rawText, observation);
            currentContext = { ...currentContext, step: currentContext.step + 1 };
            records.push({
              step: currentContext.step,
              prompt,
              rawText,
              action,
              observation,
              tokenIn,
              tokenOut,
              elapsedMs: Date.now() - startedAt,
            });
            this.notifyStep(records.at(-1)!);
            continue;
          }

          return this.finalize({
            success: false,
            result: "",
            steps: records,
            totalTokenIn,
            totalTokenOut,
            totalElapsedMs: Date.now() - runStartedAt,
            terminationReason: "error",
          });
        }

        const done = terminationCheck({
          context: currentContext,
          action,
          config: this.config,
          totalTokenIn,
          totalTokenOut,
          totalElapsedMs: Date.now() - runStartedAt,
        });

        if (done) {
          return this.finalize({
            success: done === "finish",
            result: action.name === "finish" ? String(action.args.result ?? "") : "",
            steps: records,
            totalTokenIn,
            totalTokenOut,
            totalElapsedMs: Date.now() - runStartedAt,
            terminationReason: done,
          });
        }

        const tool = this.tools.find((candidate) => candidate.name === action.name);
        if (!tool) {
          observation = safeObservation("", `Unknown tool: ${action.name}`);
        } else {
          const validationError = validateArgs(action.args, tool.argsSchema);
          if (validationError) {
            observation = safeObservation("", `Invalid args: ${validationError}`);
          } else {
            try {
              const raw = await tool.call(action.args);
              observation = safeInterpreter(tool.interpreter)(raw);
            } catch (error) {
              observation = safeObservation(
                "",
                `Tool error: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }

        currentContext = this.updateAndTrim(currentContext, rawText, observation);
        currentContext = { ...currentContext, step: currentContext.step + 1 };

        const record: StepRecord = {
          step: currentContext.step,
          prompt,
          rawText,
          action,
          observation,
          tokenIn,
          tokenOut,
          elapsedMs: Date.now() - startedAt,
        };
        records.push(record);
        this.notifyStep(record);
      }
    } catch {
      return this.finalize({
        success: false,
        result: "",
        steps: records,
        totalTokenIn,
        totalTokenOut,
        totalElapsedMs: Date.now() - runStartedAt,
        terminationReason: "error",
      });
    }
  }

  private normalizeTools(tools: ToolSpec[]): ToolSpec[] {
    const duplicateFinish = tools.some((tool) => tool.name === FINISH_TOOL.name);
    if (duplicateFinish) {
      throw new Error("Do not pass a custom finish tool; it is registered by runtime.");
    }
    return [...tools, FINISH_TOOL];
  }

  private updateAndTrim(context: Context, rawText: string, observation: Observation): Context {
    const newEntries: ContextEntry[] = [
      ...context.entries,
      { role: "assistant", content: rawText, metadata: { step: context.step + 1 } },
      { role: "tool", content: observation.content, metadata: { error: observation.error } },
    ];
    const nextContext: Context = {
      ...context,
      entries: newEntries,
      tokenCount: this.countContextTokens(context.task, newEntries),
    };
    return this.contextStrategy.trim(nextContext);
  }

  private countContextTokens(task: string, entries: ContextEntry[]): number {
    return this.llm.countTokens(task) + entries.reduce((sum, entry) => sum + this.llm.countTokens(entry.content), 0);
  }

  private notifyStep(record: StepRecord): void {
    for (const observer of this.observers) {
      try {
        observer.onStep(record);
      } catch {
        // observer failures must not break the loop
      }
    }
  }

  private finalize(result: RunResult): RunResult {
    for (const observer of this.observers) {
      try {
        observer.onRunEnd(result);
      } catch {
        // observer failures must not break finalization
      }
    }
    return result;
  }
}

export function terminationCheck(input: {
  context: Context;
  action: Action;
  config: RuntimeConfig;
  totalTokenIn: number;
  totalTokenOut: number;
  totalElapsedMs: number;
}): TerminationReason | null {
  const { context, action, config, totalTokenIn, totalTokenOut, totalElapsedMs } = input;

  if (action.name === "finish") {
    return "finish";
  }
  if (context.step >= config.maxSteps) {
    return "max_steps";
  }
  if (context.tokenCount >= config.maxTokens) {
    return "max_tokens";
  }
  if (config.budgetToken !== undefined && totalTokenIn + totalTokenOut >= config.budgetToken) {
    return "budget_token";
  }
  if (config.budgetTimeMs !== undefined && totalElapsedMs >= config.budgetTimeMs) {
    return "budget_time";
  }
  return null;
}

export function validateArgs(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): string | null {
  const normalizedSchema = schema as {
    required?: unknown;
    properties?: unknown;
  };
  const required = Array.isArray(normalizedSchema.required) ? normalizedSchema.required : [];
  for (const key of required) {
    if (!(key in args)) {
      return `Missing required key: ${String(key)}`;
    }
  }

  const properties =
    normalizedSchema.properties && typeof normalizedSchema.properties === "object"
      ? (normalizedSchema.properties as Record<string, Record<string, unknown>>)
      : {};

  for (const [key, value] of Object.entries(args)) {
    const propertySchema = properties[key];
    if (!propertySchema || typeof propertySchema.type !== "string") {
      continue;
    }

    const ok =
      (propertySchema.type === "string" && typeof value === "string") ||
      (propertySchema.type === "number" && typeof value === "number") ||
      (propertySchema.type === "boolean" && typeof value === "boolean") ||
      (propertySchema.type === "object" && typeof value === "object" && value !== null) ||
      (propertySchema.type === "array" && Array.isArray(value));

    if (!ok) {
      return `Invalid type for key '${key}', expected ${propertySchema.type}`;
    }
  }

  return null;
}
