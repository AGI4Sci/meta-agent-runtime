import type { Observer } from "../core/interfaces";
import type { RunResult, StepRecord } from "../core/types";

export class ReplayBufferObserver implements Observer {
  readonly steps: StepRecord[] = [];
  result: RunResult | null = null;

  onStep(record: StepRecord): void {
    this.steps.push(record);
  }

  onRunEnd(result: RunResult): void {
    this.result = result;
  }
}

