import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime } from "../src/core/runtime";
import { ParseError } from "../src/core/errors";
import type {
  ActionParser,
  ContextStrategy,
  LLMClient,
  Observer,
  PromptBuilder,
} from "../src/core/interfaces";
import type { Context } from "../src/core/types";
import { FINISH_TOOL, type ToolSpec } from "../src/core/toolSpec";
import { NoopContextStrategy } from "../src/context/noop";
import { JSONActionParser } from "../src/parser/jsonParser";
import { MinimalPromptBuilder } from "../src/prompt/minimal";
import type { RunResult, StepRecord } from "../src/core/types";

class StubLLM implements LLMClient {
  private calls = 0;

  complete(): string {
    this.calls += 1;
    return this.calls === 1 ? JSON.stringify({ name: "finish", args: { result: "done" } }) : "";
  }

  countTokens(text: string): number {
    return text.length;
  }
}

class StubPromptBuilder implements PromptBuilder {
  build(task: string, _tools: ToolSpec[], _context: Context): string {
    return task;
  }
}

class StubActionParser implements ActionParser {
  parse(rawText: string) {
    const parsed = JSON.parse(rawText) as { name: string; args: Record<string, unknown> };
    return { name: parsed.name, args: parsed.args, rawText };
  }
}

class SequenceLLM implements LLMClient {
  private index = 0;

  constructor(private readonly outputs: string[]) {}

  complete(): string {
    const next = this.outputs[this.index];
    this.index += 1;
    return next ?? "";
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
    return { name: "finish", args: { result: "recovered" }, rawText };
  }
}

class RecordingObserver implements Observer {
  steps = 0;
  runEnds = 0;
  lastResult?: string;

  onStep(): void {
    this.steps += 1;
  }

  onRunEnd(result: { result: string }): void {
    this.runEnds += 1;
    this.lastResult = result.result;
  }
}

class SnakeCaseObserver implements Observer {
  steps = 0;
  runEnds = 0;

  onStep(): void {}

  onRunEnd(): void {}

  on_step(): void {
    this.steps += 1;
  }

  on_run_end(): void {
    this.runEnds += 1;
  }
}

class ThrowingObserver implements Observer {
  onStep(): void {
    throw new Error("observer step failure");
  }

  onRunEnd(): void {
    throw new Error("observer end failure");
  }
}

test("runtime returns finish result", async () => {
  const runtime = new AgentRuntime({
    llm: new StubLLM(),
    tools: [],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
  });

  const result = await runtime.run("test task");
  assert.equal(result.success, true);
  assert.equal(result.terminationReason, "finish");
  assert.equal(result.result, "done");
});

test("runtime turns ParseError into observation and continues loop", async () => {
  const runtime = new AgentRuntime({
    llm: new SequenceLLM(["not valid", '{"name":"finish","args":{"result":"recovered"}}']),
    tools: [],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new ParseThenFinishParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
  });

  const result = await runtime.run("test task");

  assert.equal(result.success, true);
  assert.equal(result.result, "recovered");
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.action.name, "__parse_error__");
  assert.match(result.steps[0]?.observation.error ?? "", /Parse failed: bad format/);
});

test("runtime notifies observers and swallows observer failures", async () => {
  const recorder = new RecordingObserver();
  const runtime = new AgentRuntime({
    llm: new SequenceLLM(['{"name":"demo_tool","args":{}}', '{"name":"finish","args":{"result":"done"}}']),
    tools: [
      {
        name: "demo_tool",
        description: "demo",
        argsSchema: { type: "object", properties: {} },
        call: () => "ok",
        interpreter: () => ({ content: "ok", error: null, metadata: {} }),
      },
    ],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
    observers: [recorder, new ThrowingObserver()],
  });

  const result = await runtime.run("task");

  assert.equal(result.success, true);
  assert.equal(recorder.steps, 1);
  assert.equal(recorder.runEnds, 1);
  assert.equal(recorder.lastResult, "done");
});

test("runtime supports raw-design snake_case observer hooks", async () => {
  const observer = new SnakeCaseObserver();
  const runtime = new AgentRuntime({
    llm: new SequenceLLM(['{"name":"demo_tool","args":{}}', '{"name":"finish","args":{"result":"done"}}']),
    tools: [
      {
        name: "demo_tool",
        description: "demo",
        argsSchema: { type: "object", properties: {} },
        call: () => "ok",
        interpreter: () => ({ content: "ok", error: null, metadata: {} }),
      },
    ],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
    observers: [observer],
  });

  const result = await runtime.run("task");

  assert.equal(result.success, true);
  assert.equal(observer.steps, 1);
  assert.equal(observer.runEnds, 1);
});

test("runtime returns last observation content for non-finish termination", async () => {
  const runtime = new AgentRuntime({
    llm: new SequenceLLM(['{"name":"demo_tool","args":{}}', '{"name":"demo_tool","args":{}}']),
    tools: [
      {
        name: "demo_tool",
        description: "demo",
        argsSchema: { type: "object", properties: {} },
        call: () => "last observation",
        interpreter: (raw) => ({ content: String(raw), error: null, metadata: {} }),
      },
    ],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
    config: { maxSteps: 1 },
  });

  const result = await runtime.run("task");

  assert.equal(result.success, false);
  assert.equal(result.terminationReason, "max_steps");
  assert.equal(result.result, "last observation");
  assert.equal(result.steps.length, 1);
});

test("runtime rejects caller-provided finish tool", () => {
  assert.throws(
    () =>
      new AgentRuntime({
        llm: new StubLLM(),
        tools: [FINISH_TOOL],
        promptBuilder: new StubPromptBuilder(),
        actionParser: new StubActionParser(),
        contextStrategy: new NoopContextStrategy() as ContextStrategy,
      }),
    /custom finish tool/,
  );
});

test("minimal prompt renders english tool descriptions", () => {
  const promptBuilder = new MinimalPromptBuilder();
  const tool: ToolSpec = {
    name: "demo_tool",
    description: "English tool description",
    argsSchema: { type: "object", properties: {} },
    call: () => "",
    interpreter: () => ({ content: "", error: null, metadata: {} }),
  };
  const context = { task: "t", entries: [], step: 0, tokenCount: 0 };

  const prompt = promptBuilder.build("task", [tool], context);

  assert.match(prompt, /English tool description/);
});

test("parse errors are surfaced back into prompt-visible context", async () => {
  const seenPrompts: string[] = [];

  class ParseRecoveryLLM implements LLMClient {
    private calls = 0;

    complete(prompt: string): string {
      seenPrompts.push(prompt);
      this.calls += 1;
      return this.calls === 1 ? "not valid action" : JSON.stringify({ name: "finish", args: { result: "done" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  const runtime = new AgentRuntime({
    llm: new ParseRecoveryLLM(),
    tools: [],
    promptBuilder: new MinimalPromptBuilder(),
    actionParser: new JSONActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
  });

  const result = await runtime.run("recover after parse error");

  assert.equal(result.success, true);
  assert.equal(result.steps.length, 1);
  assert.match(seenPrompts[1] ?? "", /ERROR: Parse failed:/);
});

test("tool errors are surfaced back into prompt-visible context", async () => {
  const seenPrompts: string[] = [];

  class ToolErrorLLM implements LLMClient {
    private calls = 0;

    complete(prompt: string): string {
      seenPrompts.push(prompt);
      this.calls += 1;
      return this.calls === 1
        ? JSON.stringify({ name: "boom", args: {} })
        : JSON.stringify({ name: "finish", args: { result: "done" } });
    }

    countTokens(text: string): number {
      return text.length;
    }
  }

  const runtime = new AgentRuntime({
    llm: new ToolErrorLLM(),
    tools: [
      {
        name: "boom",
        description: "Always fails",
        argsSchema: { type: "object", properties: {} },
        call: () => {
          throw new Error("kaboom");
        },
        interpreter: () => ({ content: "", error: null, metadata: {} }),
      },
    ],
    promptBuilder: new MinimalPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
  });

  const result = await runtime.run("recover after tool error");

  assert.equal(result.success, true);
  assert.equal(result.steps.length, 1);
  assert.match(seenPrompts[1] ?? "", /ERROR: Tool error: kaboom/);
});

test("observer failures do not break runtime and onRunEnd is called", async () => {
  const calls: string[] = [];

  const runtime = new AgentRuntime({
    llm: new StubLLM(),
    tools: [],
    promptBuilder: new StubPromptBuilder(),
    actionParser: new StubActionParser(),
    contextStrategy: new NoopContextStrategy() as ContextStrategy,
    observers: [
      {
        onStep(_record: StepRecord): void {
          calls.push("step");
          throw new Error("observer step failure");
        },
        onRunEnd(_result: RunResult): void {
          calls.push("end");
        },
      },
    ],
  });

  const result = await runtime.run("test task");

  assert.equal(result.success, true);
  assert.deepEqual(calls, ["end"]);
});

test("finish tool interpreter marks finish metadata", () => {
  const observation = FINISH_TOOL.interpreter("done");

  assert.equal(observation.content, "done");
  assert.equal(observation.error, null);
  assert.equal(observation.metadata.is_finish, true);
});
