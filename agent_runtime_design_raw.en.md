# Agent Runtime Design Specification

> This document is the complete design specification for the **reference runtime**. It serves both as the blueprint for Codex-generated scaffold code and as the canonical migration template for other code agents.
>
> **Implementation languages**: TypeScript for the core runtime and HTTP server, and Python for evaluation scripts and the experiment-analysis client. The two layers communicate over local HTTP and share JSON-Schema-defined data contracts.

---

## 1. Research Background and Goals

### 1.1 Motivation

Existing open-source code agents such as smolagents, SWE-agent, OpenHands, and LangGraph often mix prompt templates, context management, action parsing, and tool execution logic together. That makes it impossible to swap out one component at a time for controlled experiments. The goal of this project is to build an **ablation platform**: hold every other variable fixed, replace only one module at a time, and measure that module's effect precisely.

### 1.2 Goals

Maximize task success rate under the following constraints:

- **Effectiveness goal**: task success rate, evaluated on SWE-bench Verified
- **Efficiency goal**: total token consumption plus end-to-end latency
- **Constraint model**: constrained optimization; maximize success rate under a token/time budget X
- **Task domain**: coding agents on SWE-bench Verified

### 1.3 Primary Research Variables

| Module | Impact on success rate | Impact on token/time | Research priority |
|------|----------------------|-------------------|-----------|
| `PromptBuilder` | High | High | Primary variable |
| `ContextStrategy` | Medium | High | Primary variable |
| `LLMClient` | High | High | Secondary variable |
| `ActionParser` | Medium | Low | Fixed baseline |
| `ToolSpec.interpreter` | Low | Low | Fixed baseline |

---

## 2. Boundary Definition

### 2.1 Core Design Decisions

The following are the design decisions that were established after full discussion:

| Decision | Conclusion |
|--------|------|
| Executor topology | Topology A: the executor lives inside the runtime |
| Execution authority | Invocation authority plus result interpretation authority, but not environment lifecycle management |
| Result interpretation | Tools provide a pure interpreter function |
| Termination | Option C: structural termination is determined by the runtime; semantic termination is expressed through the `finish` action |
| Status of `finish` | A normal tool; the runtime hard-codes recognition of `action.name == "finish"` in `termination_check` |
| Context management | Pluggable; passed in at runtime initialization |
| Action parsing | Pluggable; passed in at runtime initialization |
| Error handling | Errors are converted into `Observation`, the loop continues, no retry is performed, and decision authority remains with the LLM |
| Argument validation | The runtime validates args before tool invocation; failures are converted into error observations |
| Tool side-effect declaration | The runtime does not track it; it is not part of the `ToolSpec` contract |
| Prompt templates | Pluggable; passed in at runtime initialization |
| LLM | Dependency-injected externally; the runtime defines only a minimal interface |

### 2.2 In Scope vs Out of Scope

**Inside the boundary (runtime responsibilities)**:
- Decision: `LLM(context) -> action`
- Invocation: `action -> tool_spec.call(args)`
- Result interpretation: `tool_spec.interpreter(raw) -> Observation`
- Argument validation: `validate(args, tool_spec.args_schema)`
- Error fallback: any exception becomes an error `Observation`, and the loop continues
- Context maintenance: `context.append(action, observation)`
- Context trimming: `context_strategy.trim(context)`
- Termination checks: structural conditions plus recognition of `action.name == "finish"`

**Outside the boundary (not owned by the runtime)**:
- Physical execution environments for tools, including sandboxes, processes, and networks
- Tool implementations themselves
- Environment lifecycle management
- Side-effect control such as read-only vs write security policy
- Concrete implementations of pluggable modules
- Specific LLM models and vendors

---

## 3. Data Model Specification

### 3.1 `Observation`

The only information carrier inside the runtime. It is produced by the interpreter and enters the context.

```python
@dataclass
class Observation:
    content: str          # Primary content consumed by the LLM
    error: str | None     # Error message; None means success
    metadata: dict        # Optional metadata; not included in LLM context, only for observability

    @property
    def is_error(self) -> bool:
        return self.error is not None
```

**Design constraints**:
- `content` is the only field that enters the LLM prompt
- `metadata` is only for external observability such as token counting and timestamps; it must not affect control flow
- If `error` is non-empty, `content` may be an empty string, but it must not be `None`

### 3.2 `Action`

The structured representation of an LLM decision, parsed from raw text by `ActionParser`.

```python
@dataclass
class Action:
    name: str             # Tool name; corresponds to ToolSpec.name
    args: dict            # Tool invocation arguments; corresponds to ToolSpec.args_schema
    raw_text: str         # Original LLM output, preserved for debugging and observability
```

**Design constraints**:
- `name` must be found in the registered `ToolSpec` list or be the built-in `"finish"`
- `args` are schema-validated before tool invocation
- `raw_text` must not participate in control flow logic

### 3.3 `Context`

The full loop state, maintained by the runtime and trimmed by `ContextStrategy`.

```python
@dataclass
class ContextEntry:
    role: Literal["user", "assistant", "tool"]
    content: str
    metadata: dict        # Step number, timestamp, token count, etc.; not included in the LLM prompt

@dataclass
class Context:
    task: str                      # Original task description; always preserved and never trimmed
    entries: list[ContextEntry]    # Trimmable dialogue history
    step: int                      # Current step number
    token_count: int               # Estimated token count for the current context
```

**Design constraints**:
- `task` is handled specially by `PromptBuilder`, always appears in the prompt, and is never trimmed
- `entries` are the object manipulated by `ContextStrategy.trim()`
- `token_count` is updated by the runtime after each append; `ContextStrategy` may read it but does not own it

### 3.4 `StepRecord`

A full snapshot of a single step, used for observability and experiment replay. It is produced by the runtime after each step and does not participate in control flow.

```python
@dataclass
class StepRecord:
    step: int
    prompt: str           # Full prompt sent to the LLM for this step
    raw_text: str         # Raw LLM output
    action: Action        # Parsed action
    observation: Observation  # Observation for this step
    token_in: int         # Prompt token count for this step
    token_out: int        # Completion token count for this step
    elapsed_ms: int       # Elapsed time for this step in milliseconds
```

### 3.5 `RunResult`

The return value of `run()`.

```python
@dataclass
class RunResult:
    success: bool
    result: str                    # Result carried by the finish action, or the last observation content
    steps: list[StepRecord]        # Full step records
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int
    termination_reason: Literal["finish", "max_steps", "max_tokens", "error"]
```

---

## 4. Five Pluggable Interface Specifications

### 4.1 `LLMClient`

```python
from typing import Protocol

class LLMClient(Protocol):
    def complete(self, prompt: str) -> str:
        """
        Send a prompt and return the raw text output from the LLM.

        Constraints:
        - Must be synchronous (an async version may exist separately as AsyncLLMClient)
        - Must not perform any format post-processing; return the raw string
        - Network errors, timeouts, and similar failures should be raised directly and handled uniformly by the runtime
        - Token counting is not owned by this method
        """
        ...

    def count_tokens(self, text: str) -> int:
        """
        Estimate the token count of a text string for context management.

        Constraints:
        - Approximate algorithms such as len(text) // 4 are allowed
        - The value does not need to be exact, but it must be monotonic: longer text should yield a larger count
        """
        ...
```

**Reference implementation names**:
- `AnthropicLLMClient` - calls the Anthropic API
- `OpenAILLMClient` - calls the OpenAI API
- `LocalLLMClient` - calls a local model such as via ollama

### 4.2 `PromptBuilder`

```python
class PromptBuilder(Protocol):
    def build(self, task: str, tools: list[ToolSpec], context: Context) -> str:
        """
        Assemble task, tools, and context into the full prompt sent to the LLM.

        Constraints:
        - Must include the task and must not omit it
        - Must include every tool's name, description, and args_schema so the LLM can decide
        - Must include the history in context.entries, though formatting is flexible
        - Must not mutate the context object; this must be a pure function
        - The return value is a string, not a message list
        """
        ...
```

**Reference implementation names**:
- `ReActPromptBuilder` - ReAct style (Thought / Action / Observation loop)
- `CoTPromptBuilder` - chain-of-thought style
- `MinimalPromptBuilder` - minimal style without extra instructions, used as a baseline

**Migration notes**:
- The smolagents prompt template maps to `SmolagentsPromptBuilder`
- The SWE-agent ACI prompt maps to `SWEAgentPromptBuilder`

### 4.3 `ActionParser`

```python
class ActionParser(Protocol):
    def parse(self, raw_text: str) -> Action:
        """
        Parse the raw LLM output into a structured Action.

        Constraints:
        - Parsing failures must raise ParseError, not return None
        - Must not make any LLM call
        - Must be a pure function: same input, same output
        - raw_text must be preserved exactly in Action.raw_text
        """
        ...
```

**ParseError definition**:
```python
class ParseError(Exception):
    def __init__(self, message: str, raw_text: str):
        self.raw_text = raw_text
        super().__init__(message)
```

**Runtime handling of ParseError**: ParseError is caught, converted into an error observation, and the loop continues. The LLM will see the parse failure information and can adjust its output format.

**Reference implementation names**:
- `JSONActionParser` - expects LLM output in JSON action format
- `XMLActionParser` - expects `<tool_call>` XML tags
- `FunctionCallActionParser` - depends on the LLM's function-calling capability for structured output
- `ReActActionParser` - parses `Action: tool_name(args)` style output

### 4.4 `ContextStrategy`

```python
class ContextStrategy(Protocol):
    def trim(self, context: Context) -> Context:
        """
        Trim a context object and return a new Context without mutating the original.

        Constraints:
        - context.task must be preserved exactly and must never be trimmed
        - The returned Context must be a new object, not an in-place mutation
        - The strategy may read context.token_count to decide how aggressively to trim
        - Must not make any LLM call
        """
        ...
```

**Reference implementation names**:
- `NoopContextStrategy` - no trimming, used as a baseline
- `SlidingWindowStrategy(max_tokens: int)` - keeps the most recent N tokens of history
- `SummarizationStrategy(max_tokens: int, llm: LLMClient)` - summarizes early history; this is an advanced strategy because it performs an internal LLM call
- `SelectiveRetentionStrategy` - keeps error observations and key steps while trimming redundant successful steps

### 4.5 `ToolSpec`

`ToolSpec` is not an interface. It is a data class and the full contract between the tool side and the runtime.

```python
@dataclass
class ToolSpec:
    name: str
    description: str              # For LLM decision-making; appears in the prompt
    args_schema: dict             # JSON Schema used for arg validation and arg generation
    call: Callable[[dict], Any]   # Actual execution function; takes args dict and returns any raw value
    interpreter: Callable[[Any], Observation]  # Pure function: raw -> Observation
```

**Interpreter constraints**:
- Must be a pure function: same input, same output
- Must not access context or any internal runtime state
- Must not call the LLM
- Must return an `Observation`; it must not raise an exception. Internally it should catch failures and convert them into `Observation(error=...)`
- It must be able to handle failed raw values such as `None` and return an error observation

**Built-in ToolSpec**: the runtime auto-registers `finish`; callers do not need to pass it in:

```python
FINISH_TOOL = ToolSpec(
    name="finish",
    description="Call this when the task is complete. Pass the final result as 'result'.",
    args_schema={
        "type": "object",
        "properties": {"result": {"type": "string"}},
        "required": ["result"]
    },
    call=lambda args: args["result"],
    interpreter=lambda raw: Observation(content=raw, error=None, metadata={"is_finish": True})
)
```

---

## 5. Runtime Core Specification

### 5.1 Initialization Contract

```python
@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000     # context token upper bound; triggers termination
    budget_token: int | None = None     # experiment token budget over the whole run
    budget_time_ms: int | None = None   # experiment time budget

class AgentRuntime:
    def __init__(
        self,
        llm: LLMClient,
        tools: list[ToolSpec],
        prompt_builder: PromptBuilder,
        action_parser: ActionParser,
        context_strategy: ContextStrategy,
        config: RuntimeConfig = RuntimeConfig(),
        observers: list[Observer] = [],   # observability hooks; see Section 6
    ):
        ...
```

### 5.2 Public Interface

```python
class AgentRuntime:
    def run(self, task: str) -> RunResult:
        """
        The only public entry point.

        Behavioral contract:
        - Initialize Context(task=task, entries=[], step=0, token_count=0)
        - Auto-register FINISH_TOOL and merge it into the incoming tools list
        - Execute the decision loop until termination
        - Return RunResult and never raise; all internal exceptions are converted into termination_reason="error"
        """
        ...
```

### 5.3 Decision Loop Pseudocode

```
function run(task):
    context = Context(task=task)
    records = []

    while True:
        # 1. Build prompt
        prompt = prompt_builder.build(task, tools, context)

        # 2. Call LLM
        t0 = now()
        try:
            raw_text = llm.complete(prompt)
        except Exception as e:
            return RunResult(success=False, termination_reason="error", ...)

        # 3. Parse action
        try:
            action = action_parser.parse(raw_text)
        except ParseError as e:
            obs = Observation(content="", error=f"Parse failed: {e}", metadata={})
            context = update_and_trim(context, raw_text, obs, context_strategy)
            records.append(StepRecord(...))
            context.step += 1
            continue  # loop continues instead of terminating

        # 4. Termination check (before executing the tool)
        done, reason = termination_check(context, action, config)
        if done:
            result = action.args.get("result", "") if action.name == "finish" else ""
            return RunResult(success=(reason == "finish"), result=result,
                             termination_reason=reason, steps=records, ...)

        # 5. Find the corresponding ToolSpec
        tool_spec = find_tool(action.name, tools)
        if tool_spec is None:
            obs = Observation(content="", error=f"Unknown tool: {action.name}", metadata={})
        else:
            # 6. Validate args
            validation_error = validate_args(action.args, tool_spec.args_schema)
            if validation_error:
                obs = Observation(content="", error=f"Invalid args: {validation_error}", metadata={})
            else:
                # 7. Invoke the tool
                try:
                    raw = tool_spec.call(action.args)
                except Exception as e:
                    raw = None
                    obs = Observation(content="", error=f"Tool error: {e}", metadata={})
                else:
                    # 8. Interpret result
                    obs = tool_spec.interpreter(raw)

        # 9. Update context
        elapsed = now() - t0
        token_in = llm.count_tokens(prompt)
        token_out = llm.count_tokens(raw_text)
        context = update_and_trim(context, raw_text, obs, context_strategy)
        context.step += 1

        # 10. Record StepRecord
        records.append(StepRecord(
            step=context.step,
            prompt=prompt,
            raw_text=raw_text,
            action=action,
            observation=obs,
            token_in=token_in,
            token_out=token_out,
            elapsed_ms=elapsed,
        ))

        # 11. Notify observers
        for observer in observers:
            observer.on_step(records[-1])
```

### 5.4 `termination_check` Specification

```python
def termination_check(
    context: Context,
    action: Action,
    config: RuntimeConfig,
) -> tuple[bool, Literal["finish", "max_steps", "max_tokens", "budget_token", "budget_time"]]:
    """
    Termination checks must be evaluated strictly in the following priority order:

    1. action.name == "finish"      -> ("finish", True)        semantic termination, highest priority
    2. context.step >= max_steps    -> ("max_steps", True)     structural limit
    3. context.token_count >= max_tokens -> ("max_tokens", True)  context length limit
    4. cumulative token usage exceeds budget -> ("budget_token", True)  experiment budget constraint
    5. cumulative elapsed time exceeds budget -> ("budget_time", True)   experiment budget constraint

    If none match -> (False, None)
    """
```

---

## 6. Observability System Specification

The observability system is core infrastructure for the experiment platform. It does not participate in control flow and exists only for data collection.

### 6.1 `Observer` Interface

```python
class Observer(Protocol):
    def on_step(self, record: StepRecord) -> None:
        """Called after each step. Must not mutate record and must not raise."""
        ...

    def on_run_end(self, result: RunResult) -> None:
        """Called when run() finishes."""
        ...
```

### 6.2 Built-in Observer Reference Implementations

```
TokenBudgetObserver      - tracks cumulative token consumption and triggers budget termination
TimeBudgetObserver       - tracks cumulative elapsed time and triggers budget termination
StepLoggerObserver       - writes each step record into a structured log in JSONL format
ReplayBufferObserver     - serializes the full run for experiment replay
```

---

## 7. Migration Guide

### 7.1 Steps for Migrating an Open-Source Agent

To migrate an existing code agent into this framework, follow the sequence below:

**Step 1: Extract PromptBuilder**
- Find the code that builds the system prompt and user prompt in the source project
- Wrap it into a class that implements the `PromptBuilder` interface
- Confirm that `build()` is pure and does not mutate any external state

**Step 2: Extract ActionParser**
- Find the code that parses LLM outputs, such as regex, JSON, or XML parsing
- Wrap it into a class that implements the `ActionParser` interface
- Confirm that parse failures raise `ParseError` and never return None

**Step 3: Extract ContextStrategy**
- Find the code that truncates or manages context in the source project
- If the source project does not have an explicit strategy and simply truncates to max_tokens, use `SlidingWindowStrategy`
- Wrap it into a class that implements the `ContextStrategy` interface

**Step 4: Extract ToolSpec**
- Find the tool definitions in the source project, such as bash, file read/write, and search
- Split each tool into a `call` function and a pure `interpreter` function
- Important: `interpreter` must not access any external state and may only use the `raw` argument

**Step 5: Validate behavioral equivalence**
- Run the same task with the same LLM through both the source project and the migrated runtime
- Focus on whether prompt format is equivalent, whether action parsing covers all expected output forms, and whether context trimming happens at the same stage

### 7.2 Migration References for Major Open-Source Agents

#### smolagents (`MultiStepAgent`)

| smolagents component | Corresponding interface | Notes |
|----------------|---------|------|
| `system_prompt` template | `PromptBuilder` | See `_build_agent_prompt()` in `agents.py` |
| `extract_action()` | `ActionParser` | JSON format; see `utils.py` |
| context truncation (no explicit strategy) | `SlidingWindowStrategy` | smolagents directly truncates to a window |
| `tool.forward()` | `ToolSpec.call` | Returns a string directly |
| string formatting | `ToolSpec.interpreter` | raw is a string; wrap it into Observation |

#### SWE-agent

| SWE-agent component | Corresponding interface | Notes |
|---------------|---------|------|
| ACI system prompt | `PromptBuilder` | See system prompt construction and `_get_obs()` in `agent/agent.py` |
| bash output parsing | `ActionParser` | `command_parser.py` |
| history management | `ContextStrategy` | `HistoryProcessor` class |
| `bash()` / `edit()` / `search()` | `ToolSpec.call` | See the `tools/` directory |
| output formatting such as long-output truncation | `ToolSpec.interpreter` | The original project does truncation at the tool layer; migrate that into the interpreter |

#### OpenHands (`CodeActAgent`)

| OpenHands component | Corresponding interface | Notes |
|---------------|---------|------|
| CodeAct prompt | `PromptBuilder` | `agenthub/codeact_agent/` |
| action parsing | `ActionParser` | Requires adaptation from the action type system in `core/actions/` |
| condensation | `ContextStrategy` | The condenser in `core/memory/` |
| sandbox invocation | `ToolSpec.call` | The sandbox itself is outside the runtime boundary; `call` only sends instructions |
| sandbox result parsing | `ToolSpec.interpreter` | `core/observations/` |

**Note**: OpenHands is designed with Topology B (controller/runtime split). Migrating it into this framework requires flattening its controller logic into this framework's linear loop, which may lose some concurrency behavior.

### 7.3 Common Problems During Migration

**Problem 1: the source project sends tool return values directly into the prompt and has no interpreter layer**

Solution: use an identity interpreter:

```python
interpreter=lambda raw: Observation(content=str(raw), error=None, metadata={})
```

**Problem 2: the source project performs internal LLM calls inside the loop, such as summarization or reflection**

Solution:
- If it is summarization -> wrap it as `SummarizationStrategy` and move it into `ContextStrategy`
- If it is reflection -> wrap it as a specialized `PromptBuilder` that injects reflection instructions during build
- If it is multi-agent invocation -> that is outside the boundary of this framework and should not be migrated in this phase

**Problem 3: the source project has complex termination logic with multiple termination signals**

Solution: normalize all termination signals into the `finish` action, and explain in the prompt that the model should call `finish` under all completion conditions.

---

## 8. Directory Layout

```text
agent_runtime/
├── runtime/                          # TypeScript core (npm package)
│   ├── src/
│   │   ├── core/
│   │   │   ├── types.ts              # Observation, Action, Context, StepRecord, RunResult
│   │   │   ├── interfaces.ts         # LLMClient, PromptBuilder, ActionParser, ContextStrategy, Observer
│   │   │   ├── toolSpec.ts           # ToolSpec interface + FINISH_TOOL
│   │   │   ├── runtime.ts            # AgentRuntime core + terminationCheck + validation
│   │   │   └── errors.ts             # ParseError and other custom exceptions
│   │   │
│   │   ├── llm/
│   │   │   ├── anthropicClient.ts    # AnthropicLLMClient
│   │   │   ├── openaiClient.ts       # OpenAILLMClient
│   │   │   └── localClient.ts        # LocalLLMClient (ollama)
│   │   │
│   │   ├── prompt/
│   │   │   ├── react.ts              # ReActPromptBuilder
│   │   │   ├── cot.ts                # CoTPromptBuilder
│   │   │   ├── minimal.ts            # MinimalPromptBuilder (baseline)
│   │   │   ├── smolagents.ts         # SmolagentsPromptBuilder (migration)
│   │   │   └── sweAgent.ts           # SWEAgentPromptBuilder (migration)
│   │   │
│   │   ├── parser/
│   │   │   ├── jsonParser.ts         # JSONActionParser
│   │   │   ├── xmlParser.ts          # XMLActionParser
│   │   │   ├── functionCall.ts       # FunctionCallActionParser
│   │   │   └── reactParser.ts        # ReActActionParser
│   │   │
│   │   ├── context/
│   │   │   ├── noop.ts               # NoopContextStrategy (baseline)
│   │   │   ├── slidingWindow.ts      # SlidingWindowStrategy
│   │   │   ├── summarization.ts      # SummarizationStrategy
│   │   │   └── selective.ts          # SelectiveRetentionStrategy
│   │   │
│   │   ├── tools/
│   │   │   ├── bash.ts               # bash tool required for SWE-bench
│   │   │   ├── fileRead.ts           # file read tool
│   │   │   ├── fileWrite.ts          # file write tool
│   │   │   ├── fileEdit.ts           # file edit tool (str_replace style)
│   │   │   └── search.ts             # code search tool
│   │   │
│   │   ├── observers/
│   │   │   ├── tokenBudget.ts        # TokenBudgetObserver
│   │   │   ├── timeBudget.ts         # TimeBudgetObserver
│   │   │   ├── stepLogger.ts         # StepLoggerObserver (JSONL)
│   │   │   └── replayBuffer.ts       # ReplayBufferObserver
│   │   │
│   │   └── server/                   # HTTP server layer (see Section 10)
│   │       ├── app.ts                # Fastify app initialization
│   │       ├── routes.ts             # /run and /health routes
│   │       ├── registry.ts           # module registry (name -> implementation mapping)
│   │       └── schema.ts             # RunRequest / RunResult JSON Schema (zod)
│   │
│   ├── tests/
│   │   ├── runtime.test.ts           # loop control-flow tests
│   │   ├── termination.test.ts       # termination-condition tests
│   │   ├── parsers.test.ts           # parser unit tests
│   │   └── fixtures/                 # fixed LLM output samples for deterministic tests
│   │
│   ├── package.json
│   └── tsconfig.json
│
└── eval/                             # Python evaluation layer (pip package)
    ├── agent_runtime_client/
    │   ├── __init__.py
    │   ├── client.py                 # AgentRuntimeClient (see Section 11)
    │   └── types.py                  # Python dataclasses mirroring TypeScript types
    │
    ├── experiments/
    │   ├── ablation.py               # ablation experiment runner
    │   ├── swebench_runner.py        # SWE-bench Verified evaluation script
    │   └── configs/                  # experiment config files (YAML)
    │
    ├── analysis/
    │   ├── metrics.py                # success-rate and token-usage calculation
    │   └── plots.py                  # visualization of experiment results
    │
    └── tests/
        └── test_client.py            # Python client tests
```

---

## 9. Summary of Key Design Invariants

The following invariants must be followed strictly when Codex implements the system:

1. **`run()` must not raise**: all internal failures are converted into `RunResult(success=False, termination_reason="error")`
2. **`interpreter` must not raise**: it should catch failures internally and convert them into `Observation(error=...)`
3. **`ContextStrategy.trim()` must not mutate the original context**: it must return a new object
4. **`PromptBuilder.build()` must be pure**: it must not mutate any external state
5. **`context.task` must never be trimmed**: every `ContextStrategy` must preserve the `task` field
6. **The `finish` tool is auto-registered by the runtime**: the caller's `tools` list must not contain a tool named `"finish"`
7. **`termination_check` must run before the tool call**: the `finish` action does not trigger an actual tool invocation
8. **`StepRecord` must not participate in control flow**: it is for observability only and must not influence loop decisions
9. **`Observer.on_step()` must not break the loop**: observer failures must never interrupt the run
10. **`metadata` fields must never enter the LLM prompt**: `Observation.metadata` and `ContextEntry.metadata` are only for the observability layer

---

## 10. HTTP Server Specification (TypeScript Side)

### 10.1 Technology Choices

- **Framework**: Fastify (lightweight, type-friendly, built-in schema validation)
- **Schema validation**: zod (native TypeScript, both compile-time and runtime validation)
- **Port**: defaults to `3282`, overridable with the `RUNTIME_PORT` environment variable

### 10.2 Startup Modes

```bash
# Development mode
cd runtime && npx ts-node src/server/app.ts

# Production mode
cd runtime && npm run build && node dist/server/app.js

# Environment variables
RUNTIME_PORT=3282          # listen port
RUNTIME_LOG_LEVEL=info     # log level (debug / info / warn / error)
RUNTIME_TOOLS_PRESET=swe   # tool preset (swe / minimal / custom)
```

### 10.3 Route Specifications

#### `POST /run`

Execute one complete agent run.

**Request body (`RunRequest`)**:

```typescript
// src/server/schema.ts
import { z } from "zod";

export const RunRequestSchema = z.object({
  task: z.string().min(1),

  llm: z.object({
    provider: z.enum(["anthropic", "openai", "local"]),
    model: z.string(),
    api_key: z.string().optional(),   // read from env by default; this field acts as an override
    base_url: z.string().optional(),  // used by the local provider
  }),

  prompt_builder: z.enum([
    "react", "cot", "minimal", "smolagents", "swe_agent"
  ]).default("react"),

  action_parser: z.enum([
    "json", "xml", "function_call", "react"
  ]).default("json"),

  context_strategy: z.object({
    name: z.enum(["noop", "sliding_window", "summarization", "selective"]),
    max_tokens: z.number().optional(),   // used by sliding_window and summarization
  }).default({ name: "sliding_window", max_tokens: 8000 }),

  tools: z.enum(["swe", "minimal", "custom"]).default("swe"),
  // when tools="custom", the toolset is selected by RUNTIME_TOOLS_PRESET on server startup
  // dynamic tool implementation injection over HTTP is not supported in this phase

  config: z.object({
    max_steps: z.number().default(50),
    max_tokens: z.number().default(100000),
    budget_token: z.number().optional(),
    budget_time_ms: z.number().optional(),
  }).default({}),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
```

**Response body (`RunResponse`)**:

```typescript
export const RunResponseSchema = z.object({
  success: z.boolean(),
  result: z.string(),
  termination_reason: z.enum(["finish", "max_steps", "max_tokens",
                               "budget_token", "budget_time", "error"]),
  steps: z.array(z.object({
    step: z.number(),
    action_name: z.string(),
    action_args: z.record(z.unknown()),
    observation_content: z.string(),
    observation_error: z.string().nullable(),
    token_in: z.number(),
    token_out: z.number(),
    elapsed_ms: z.number(),
  })),
  total_token_in: z.number(),
  total_token_out: z.number(),
  total_elapsed_ms: z.number(),
});

export type RunResponse = z.infer<typeof RunResponseSchema>;
```

**Note**: `StepRecord.prompt` and `StepRecord.raw_text` are not included in the HTTP response because the payload would be too large. When full step data is needed, use `StepLoggerObserver` to write local JSONL files and consume them from Python.

#### `GET /health`

```json
{ "status": "ok", "version": "0.1.0" }
```

#### `GET /registry`

Return the names of all modules currently registered in the server, so the Python client can validate configuration legality:

```json
{
  "prompt_builders": ["react", "cot", "minimal", "smolagents", "swe_agent"],
  "action_parsers": ["json", "xml", "function_call", "react"],
  "context_strategies": ["noop", "sliding_window", "summarization", "selective"],
  "tools": ["swe", "minimal"]
}
```

### 10.4 Module Registry

```typescript
// src/server/registry.ts

import { ReActPromptBuilder } from "../prompt/react";
import { CoTPromptBuilder } from "../prompt/cot";
// ... other imports

export const PROMPT_BUILDERS: Record<string, () => PromptBuilder> = {
  react:      () => new ReActPromptBuilder(),
  cot:        () => new CoTPromptBuilder(),
  minimal:    () => new MinimalPromptBuilder(),
  smolagents: () => new SmolagentsPromptBuilder(),
  swe_agent:  () => new SWEAgentPromptBuilder(),
};

export const ACTION_PARSERS: Record<string, () => ActionParser> = {
  json:          () => new JSONActionParser(),
  xml:           () => new XMLActionParser(),
  function_call: () => new FunctionCallActionParser(),
  react:         () => new ReActActionParser(),
};

export const CONTEXT_STRATEGIES: Record<
  string,
  (params: { max_tokens?: number; llm?: LLMClient }) => ContextStrategy
> = {
  noop:           () => new NoopContextStrategy(),
  sliding_window: ({ max_tokens = 8000 }) => new SlidingWindowStrategy(max_tokens),
  summarization:  ({ max_tokens = 8000, llm }) => new SummarizationStrategy(max_tokens, llm!),
  selective:      () => new SelectiveRetentionStrategy(),
};

export const TOOL_PRESETS: Record<string, ToolSpec[]> = {
  swe:     [bashTool, fileReadTool, fileWriteTool, fileEditTool, searchTool],
  minimal: [bashTool],
};
```

### 10.5 Concurrency Handling

Each `POST /run` request creates an independent `AgentRuntime` instance with no shared state. Fastify already supports concurrent requests, so no extra concurrency handling is required.

For SWE-bench evaluation, it is recommended to limit concurrency on the Python side to avoid LLM API rate limiting.

---

## 11. Python Client Specification

### 11.1 Installation

```bash
cd eval && pip install -e .
```

### 11.2 `AgentRuntimeClient`

```python
# eval/agent_runtime_client/client.py

import httpx
from dataclasses import dataclass
from .types import RunRequest, RunResponse, LLMConfig, ContextStrategyConfig, RuntimeConfig

class AgentRuntimeClient:
    def __init__(
        self,
        base_url: str = "http://localhost:3282",
        timeout: float = 600.0,   # maximum wait time per run in seconds
    ):
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        self._verify_server()

    def _verify_server(self) -> None:
        """Check server reachability at initialization; raise ConnectionError if unavailable."""
        resp = self._client.get("/health")
        resp.raise_for_status()

    def run(self, request: RunRequest) -> RunResponse:
        """
        Execute a single agent run and block until it completes.

        Args:
            request: a RunRequest dataclass carrying task, llm config, module config, etc.

        Returns:
            a RunResponse dataclass

        Raises:
            httpx.TimeoutException - server timeout
            httpx.HTTPStatusError - non-2xx server response
            ValueError - response payload shape is invalid
        """
        resp = self._client.post("/run", json=request.to_dict())
        resp.raise_for_status()
        return RunResponse.from_dict(resp.json())

    def registry(self) -> dict:
        """Return the currently registered module names from the server."""
        return self._client.get("/registry").json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
```

### 11.3 Data Types (mirroring TypeScript schema)

```python
# eval/agent_runtime_client/types.py

from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

@dataclass
class LLMConfig:
    provider: Literal["anthropic", "openai", "local"]
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None

@dataclass
class ContextStrategyConfig:
    name: Literal["noop", "sliding_window", "summarization", "selective"] = "sliding_window"
    max_tokens: Optional[int] = 8000

@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000
    budget_token: Optional[int] = None
    budget_time_ms: Optional[int] = None

@dataclass
class RunRequest:
    task: str
    llm: LLMConfig
    prompt_builder: Literal["react", "cot", "minimal", "smolagents", "swe_agent"] = "react"
    action_parser: Literal["json", "xml", "function_call", "react"] = "json"
    context_strategy: ContextStrategyConfig = field(default_factory=ContextStrategyConfig)
    tools: Literal["swe", "minimal"] = "swe"
    config: RuntimeConfig = field(default_factory=RuntimeConfig)

    def to_dict(self) -> dict:
        return asdict(self)

@dataclass
class StepSummary:
    step: int
    action_name: str
    action_args: dict
    observation_content: str
    observation_error: Optional[str]
    token_in: int
    token_out: int
    elapsed_ms: int

@dataclass
class RunResponse:
    success: bool
    result: str
    termination_reason: Literal["finish", "max_steps", "max_tokens",
                                 "budget_token", "budget_time", "error"]
    steps: list[StepSummary]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int

    @classmethod
    def from_dict(cls, data: dict) -> "RunResponse":
        steps = [StepSummary(**s) for s in data.pop("steps", [])]
        return cls(steps=steps, **data)
```

### 11.4 Typical Usage Patterns

#### Single call

```python
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig

with AgentRuntimeClient() as client:
    result = client.run(RunRequest(
        task="Fix the failing test in tests/test_foo.py",
        llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
        prompt_builder="react",
        context_strategy=ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ))
    print(result.success, result.termination_reason)
    print(f"tokens: {result.total_token_in} in / {result.total_token_out} out")
```

#### Ablation experiment

```python
# eval/experiments/ablation.py

import itertools
import json
from pathlib import Path
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig, ContextStrategyConfig

TASKS = [...]   # list of SWE-bench tasks

PROMPT_BUILDERS = ["react", "cot", "minimal"]
CONTEXT_STRATEGIES = [
    ContextStrategyConfig(name="noop"),
    ContextStrategyConfig(name="sliding_window", max_tokens=4000),
    ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ContextStrategyConfig(name="selective"),
]

def run_ablation(output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    with AgentRuntimeClient() as client:
        for pb, cs in itertools.product(PROMPT_BUILDERS, CONTEXT_STRATEGIES):
            experiment_id = f"{pb}__{cs.name}_{cs.max_tokens}"
            results = []

            for task in TASKS:
                resp = client.run(RunRequest(
                    task=task["problem_statement"],
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                    prompt_builder=pb,
                    context_strategy=cs,
                    config=RuntimeConfig(budget_token=50_000),  # shared budget constraint
                ))
                results.append({
                    "task_id": task["instance_id"],
                    "success": resp.success,
                    "termination_reason": resp.termination_reason,
                    "total_token_in": resp.total_token_in,
                    "total_token_out": resp.total_token_out,
                    "total_elapsed_ms": resp.total_elapsed_ms,
                })

            out_file = output_dir / f"{experiment_id}.jsonl"
            with open(out_file, "w") as f:
                for r in results:
                    f.write(json.dumps(r) + "\n")

            success_rate = sum(r["success"] for r in results) / len(results)
            avg_tokens = sum(r["total_token_in"] + r["total_token_out"] for r in results) / len(results)
            print(f"{experiment_id}: success={success_rate:.2%}, avg_tokens={avg_tokens:.0f}")
```

#### SWE-bench evaluation script

```python
# eval/experiments/swebench_runner.py
# Assume the SWE-bench task format has already been parsed

from datasets import load_dataset
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig

def run_swebench(
    split: str = "verified",
    prompt_builder: str = "react",
    max_tasks: int | None = None,
    budget_token: int = 100_000,
):
    dataset = load_dataset("princeton-nlp/SWE-bench_Verified", split=split)
    if max_tasks:
        dataset = dataset.select(range(max_tasks))

    with AgentRuntimeClient(timeout=900.0) as client:
        for task in dataset:
            result = client.run(RunRequest(
                task=task["problem_statement"],
                llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                prompt_builder=prompt_builder,
                config=RuntimeConfig(budget_token=budget_token),
            ))
            # Emit patch data for the SWE-bench evaluator
            yield task["instance_id"], result
```

### 11.5 Reading Log Files

When full step data is needed, such as raw prompts and raw LLM outputs, read the JSONL written on the TypeScript side:

```python
# eval/analysis/metrics.py

import json
from pathlib import Path

def load_step_logs(log_dir: Path, experiment_id: str) -> list[dict]:
    """Read JSONL files written by the TypeScript StepLoggerObserver."""
    log_file = log_dir / f"{experiment_id}_steps.jsonl"
    with open(log_file) as f:
        return [json.loads(line) for line in f]

def compute_metrics(results_jsonl: Path) -> dict:
    results = [json.loads(l) for l in open(results_jsonl)]
    total = len(results)
    succeeded = sum(1 for r in results if r["success"])
    return {
        "success_rate": succeeded / total,
        "avg_token_in": sum(r["total_token_in"] for r in results) / total,
        "avg_token_out": sum(r["total_token_out"] for r in results) / total,
        "avg_elapsed_ms": sum(r["total_elapsed_ms"] for r in results) / total,
        "termination_breakdown": {
            reason: sum(1 for r in results if r["termination_reason"] == reason) / total
            for reason in ["finish", "max_steps", "max_tokens", "budget_token", "budget_time", "error"]
        },
    }
```
