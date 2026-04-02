import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Observer } from "../core/interfaces";
import type { RunResult, StepRecord } from "../core/types";

export class StepLoggerObserver implements Observer {
  constructor(private readonly logFile: string) {}

  onStep(record: StepRecord): void {
    void mkdir(dirname(this.logFile), { recursive: true })
      .then(() => appendFile(this.logFile, `${JSON.stringify(record)}\n`, "utf8"))
      .catch(() => {
        // Logging is best-effort and must not interrupt runtime execution.
      });
  }

  onRunEnd(_result: RunResult): void {}
}
