import type { Observer } from "../core/interfaces";
import type { RunResult, StepRecord } from "../core/types";

export class TokenBudgetObserver implements Observer {
  totalTokenIn = 0;
  totalTokenOut = 0;

  onStep(record: StepRecord): void {
    this.totalTokenIn += record.tokenIn;
    this.totalTokenOut += record.tokenOut;
  }

  onRunEnd(_result: RunResult): void {}
}

