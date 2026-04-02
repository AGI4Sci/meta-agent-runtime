import assert from "node:assert/strict";
import test from "node:test";
import { NoopContextStrategy } from "../src/context/noop";
import { ParseError } from "../src/core/errors";
import type {
  ActionParser,
  LLMClient,
  Observer,
  PromptBuilder,
} from "../src/core/interfaces";
import { AgentRuntime, terminationCheck } from "../src/core/runtime";
import type { Context, RunResult, StepRecord } from "../src/core/types";
import type { ToolSpec } from "../src/core/toolSpec";
import { safeObservation } from "../src/core/toolSpec";

class EchoPromptBuilder implements PromptBuilder {
  build(task: string, _tools: ToolSpec[], _context: Context): string {
    return task;
  }
}

test("runtime converts ParseError into an observation and continues the loop", async () => {
  class ScriptedLLM implements LLMClient {
    private calls = 0;

    complete(): string {
      this.calls += 1;
      if (this.calls === 1) {
        return "not valid action";
      }
      return JSON.stringify({ name: "finish", args: { result: "done" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  class ParseThenFinishParser implements ActionParser {
    private calls = 0;

    parse(rawText: string) {
      this.calls += 1;
      if (this.calls === 1) {
        throw new ParseError("bad format", rawText);
      }
      return { name: "finish", args: { result: "done" }, rawText };
    }
  }

  const runtime = new AgentRuntime({
    llm: new ScriptedLLM(),
    tools: [],
    promptBuilder: new EchoPromptBuilder(),
    actionParser: new ParseThenFinishParser(),
    contextStrategy: new NoopContextStrategy(),
  });

  const result = await runtime.run("demo");
  assert.equal(result.success, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.action.name, "__parse_error__");
  assert.equal(result.steps[0]?.observation.error, "Parse failed: bad format");
});

test("runtime returns the last observation content when terminating without finish", async () => {
  class ScriptedLLM implements LLMClient {
    private calls = 0;

    complete(): string {
      this.calls += 1;
      if (this.calls === 1) {
        return JSON.stringify({ name: "echo", args: { value: "tool-output" } });
      }
      return JSON.stringify({ name: "echo", args: { value: "never-runs" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  class JsonParser implements ActionParser {
    parse(rawText: string) {
      const parsed = JSON.parse(rawText) as { name: string; args: Record<string, unknown> };
      return { name: parsed.name, args: parsed.args, rawText };
    }
  }

  const echoTool: ToolSpec = {
    name: "echo",
    description: "echo",
    argsSchema: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    },
    call: (args) => args.value,
    interpreter: (raw) => safeObservation(String(raw)),
  };

  const runtime = new AgentRuntime({
    llm: new ScriptedLLM(),
    tools: [echoTool],
    promptBuilder: new EchoPromptBuilder(),
    actionParser: new JsonParser(),
    contextStrategy: new NoopContextStrategy(),
    config: { maxSteps: 1, maxTokens: 10_000 },
  });

  const result = await runtime.run("demo");
  assert.equal(result.success, false);
  assert.equal(result.terminationReason, "max_steps");
  assert.equal(result.result, "tool-output");
});

test("observer failures do not break step notifications or finalization", async () => {
  class ScriptedLLM implements LLMClient {
    complete(): string {
      return JSON.stringify({ name: "finish", args: { result: "done" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  class JsonParser implements ActionParser {
    parse(rawText: string) {
      const parsed = JSON.parse(rawText) as { name: string; args: Record<string, unknown> };
      return { name: parsed.name, args: parsed.args, rawText };
    }
  }

  const calls: Array<"step" | "end"> = [];
  const explodingObserver: Observer = {
    onStep(_record: StepRecord): void {
      calls.push("step");
      throw new Error("ignore me");
    },
    onRunEnd(_result: RunResult): void {
      calls.push("end");
      throw new Error("ignore me too");
    },
  };

  const runtime = new AgentRuntime({
    llm: new ScriptedLLM(),
    tools: [],
    promptBuilder: new EchoPromptBuilder(),
    actionParser: new JsonParser(),
    contextStrategy: new NoopContextStrategy(),
    observers: [explodingObserver],
  });

  const result = await runtime.run("demo");
  assert.equal(result.success, true);
  assert.deepEqual(calls, ["end"]);
});

test("termination check follows the raw design priority order", () => {
  const result = terminationCheck({
    context: { task: "x", entries: [], step: 1, tokenCount: 1 },
    action: { name: "work", args: {}, rawText: "" },
    config: { maxSteps: 1, maxTokens: 1, budgetToken: 1, budgetTimeMs: 1 },
    totalTokenIn: 1,
    totalTokenOut: 1,
    totalElapsedMs: 1,
  });

  assert.equal(result, "max_steps");
});
