import type { Observer } from "../core/interfaces";
import type { RunResult, StepRecord } from "../core/types";

export class TimeBudgetObserver implements Observer {
  totalElapsedMs = 0;

  onStep(record: StepRecord): void {
    this.totalElapsedMs += record.elapsedMs;
  }

  onRunEnd(_result: RunResult): void {}
}

