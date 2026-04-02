import { ParseError } from "./errors";
import type {
  ActionParser,
  ContextStrategy,
  LLMClient,
  Observer,
  PromptBuilder,
} from "./interfaces";
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
  private static readonly MAX_CONTEXT_OBSERVATION_CHARS = 4_000;
  private static readonly REPEATED_ACTION_WINDOW = 2;

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
        const preActionDone = terminationCheck({
          context: currentContext,
          action: { name: "__continue__", args: {}, rawText: "" },
          config: this.config,
          totalTokenIn,
          totalTokenOut,
          totalElapsedMs: Date.now() - runStartedAt,
        });

        if (preActionDone) {
          return this.finalize({
            success: preActionDone === "finish",
            result: records.at(-1)?.observation.content ?? "",
            steps: records,
            totalTokenIn,
            totalTokenOut,
            totalElapsedMs: Date.now() - runStartedAt,
            terminationReason: preActionDone,
          });
        }

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
            if (process.env.RUNTIME_TRACE === "1") {
              console.info(
                `[runtime] parse_error step=${currentContext.step + 1} message=${error.message} raw_preview=${JSON.stringify(rawText.slice(0, 400))}`,
              );
            }
            action = { name: "__parse_error__", args: {}, rawText };
            observation = safeObservation("", `Parse failed: ${error.message}`);
            currentContext = this.updateAndTrim(currentContext, action, rawText, observation);
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
            result: this.resolveRunResult(records, action, done),
            steps: records,
            totalTokenIn,
            totalTokenOut,
            totalElapsedMs: Date.now() - runStartedAt,
            terminationReason: done,
          });
        }

        const repeatedActionMessage = this.detectRepeatedAction(records, action);
        if (repeatedActionMessage) {
          observation = safeObservation(
            "",
            repeatedActionMessage,
            { repeated_action: true, action_name: action.name },
          );
        } else {
          const tool = this.tools.find((candidate) => candidate.name === action.name);
          if (!tool) {
          observation = safeObservation("", `Unknown tool: ${action.name}`);
          } else {
            const validationError = validateArgs(action.args, tool.argsSchema);
            if (validationError) {
              observation = safeObservation("", `Invalid args: ${validationError}`);
            } else {
              try {
                const traceEnabled = process.env.RUNTIME_TRACE === "1";
                const toolStartedAt = Date.now();
                if (traceEnabled) {
                  console.info(
                    `[runtime] tool_start step=${currentContext.step + 1} tool=${action.name} args=${JSON.stringify(action.args).slice(0, 400)}`,
                  );
                }
                const raw = await tool.call(action.args);
                if (traceEnabled) {
                  console.info(
                    `[runtime] tool_end step=${currentContext.step + 1} tool=${action.name} elapsed_ms=${Date.now() - toolStartedAt} raw_preview=${JSON.stringify(String(raw ?? "").slice(0, 400))}`,
                  );
                }
                observation = safeInterpreter(tool.interpreter)(raw);
              } catch (error) {
                if (process.env.RUNTIME_TRACE === "1") {
                  console.info(
                    `[runtime] tool_error step=${currentContext.step + 1} tool=${action.name} error=${error instanceof Error ? error.message : String(error)}`,
                  );
                }
                observation = safeObservation(
                  "",
                  `Tool error: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          }
        }

        currentContext = this.updateAndTrim(currentContext, action, rawText, observation);
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

  private updateAndTrim(
    context: Context,
    action: Action,
    rawText: string,
    observation: Observation,
  ): Context {
    const step = context.step + 1;
    const actionSignature = this.actionSignature(action);
    const newEntries: ContextEntry[] = [
      ...context.entries,
      { role: "assistant", content: rawText, metadata: { step } },
      {
        role: "tool",
        content: this.observationToContextContent(context, action, observation),
        metadata: {
          step,
          error: observation.error,
          action_name: action.name,
          action_signature: actionSignature,
          raw_observation_content: observation.content,
        },
      },
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

  private observationToContextContent(
    context: Context,
    action: Action,
    observation: Observation,
  ): string {
    const deduped = this.deduplicateObservationContent(context, action, observation);
    if (deduped) {
      return deduped;
    }
    if (observation.error && observation.content) {
      return this.compactContextContent(`${observation.content}\n\nERROR: ${observation.error}`);
    }
    if (observation.error) {
      return `ERROR: ${observation.error}`;
    }
    return this.compactContextContent(observation.content);
  }

  private deduplicateObservationContent(
    context: Context,
    action: Action,
    observation: Observation,
  ): string | null {
    if (observation.error || !observation.content) {
      return null;
    }

    const existing = [...context.entries].reverse().find(
      (entry) =>
        entry.role === "tool" &&
        entry.metadata.action_name === action.name &&
        typeof entry.metadata.raw_observation_content === "string" &&
        entry.metadata.raw_observation_content === observation.content,
    );

    if (!existing) {
      return null;
    }

    return `[Repeated observation compacted: '${action.name}' returned the same content as an earlier step. Reuse the prior result instead of repeating this action.]`;
  }

  private compactContextContent(content: string): string {
    if (content.length <= AgentRuntime.MAX_CONTEXT_OBSERVATION_CHARS) {
      return content;
    }

    const totalChars = content.length;
    const totalLines = content.split("\n").length;
    const marker =
      `\n...[compacted output: ${totalChars} chars, ${totalLines} lines; middle omitted]...\n`;
    const available = Math.max(0, AgentRuntime.MAX_CONTEXT_OBSERVATION_CHARS - marker.length);
    const headChars = Math.ceil(available / 2);
    const tailChars = Math.floor(available / 2);
    return `${content.slice(0, headChars)}${marker}${content.slice(totalChars - tailChars)}`;
  }

  private resolveRunResult(
    records: StepRecord[],
    action: Action,
    terminationReason: TerminationReason,
  ): string {
    if (terminationReason === "finish") {
      return String(action.args.result ?? "");
    }

    return records.at(-1)?.observation.content ?? "";
  }

  private notifyStep(record: StepRecord): void {
    for (const observer of this.observers) {
      try {
        if (typeof observer.on_step === "function") {
          observer.on_step(record);
          continue;
        }
        observer.onStep(record);
      } catch {
        // observer failures must not break the loop
      }
    }
  }

  private finalize(result: RunResult): RunResult {
    for (const observer of this.observers) {
      try {
        if (typeof observer.on_run_end === "function") {
          observer.on_run_end(result);
          continue;
        }
        observer.onRunEnd(result);
      } catch {
        // observer failures must not break finalization
      }
    }
    return result;
  }

  private detectRepeatedAction(records: StepRecord[], action: Action): string | null {
    const comparableRecords = records.filter(
      (record) => !record.action.name.startsWith("__") && record.action.name !== "finish",
    );
    const recentRecords = comparableRecords.slice(-AgentRuntime.REPEATED_ACTION_WINDOW);
    if (recentRecords.length === 0) {
      return null;
    }

    const currentSignature = this.actionSignature(action);
    const duplicateCount = recentRecords.filter(
      (record) => this.actionSignature(record.action) === currentSignature,
    ).length;

    if (duplicateCount === 0) {
      return null;
    }

    return this.buildRepeatedActionGuidance(action);
  }

  private actionSignature(action: Action): string {
    return `${action.name}:${stableStringify(action.args)}`;
  }

  private buildRepeatedActionGuidance(action: Action): string {
    const base =
      `Repeated action suppressed: '${action.name}' with identical arguments was already attempted recently.`;

    if (action.name === "file_read") {
      const path = typeof action.args.path === "string" ? action.args.path : "the current file";
      return `${base} You already read ${path}. Do not reread the whole file. Next choose one of: file_edit on that file, a narrower search query for a specific symbol or condition, or read a different nearby test/helper file.`;
    }

    if (action.name === "search") {
      const query = typeof action.args.query === "string" ? action.args.query : "the same query";
      return `${base} You already searched for ${JSON.stringify(query)}. Next choose one of: file_read on the most relevant matched file, a narrower query that names a concrete symbol/call site, or file_edit if you already know the target file.`;
    }

    if (action.name === "bash") {
      return `${base} Do not rerun the same shell command. Next choose one of: inspect a specific file, run a narrower command, or edit the likely target file.`;
    }

    return `${base} Do not repeat the same action again. Choose a different tool or a narrower target.`;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
