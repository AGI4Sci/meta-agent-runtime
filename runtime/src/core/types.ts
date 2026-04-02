export type ContextRole = "user" | "assistant" | "tool";
export type TerminationReason =
  | "finish"
  | "max_steps"
  | "max_tokens"
  | "budget_token"
  | "budget_time"
  | "error";

export interface Observation {
  content: string;
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface Action {
  name: string;
  args: Record<string, unknown>;
  rawText: string;
}

export interface ContextEntry {
  role: ContextRole;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Context {
  task: string;
  entries: ContextEntry[];
  step: number;
  tokenCount: number;
}

export interface StepRecord {
  step: number;
  prompt: string;
  rawText: string;
  action: Action;
  observation: Observation;
  tokenIn: number;
  tokenOut: number;
  elapsedMs: number;
}

export interface RunResult {
  success: boolean;
  result: string;
  steps: StepRecord[];
  totalTokenIn: number;
  totalTokenOut: number;
  totalElapsedMs: number;
  terminationReason: TerminationReason;
}

export interface RuntimeConfig {
  maxSteps: number;
  maxTokens: number;
  budgetToken?: number;
  budgetTimeMs?: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxSteps: 50,
  maxTokens: 100_000,
};

