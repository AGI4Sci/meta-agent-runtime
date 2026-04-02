# Agent Runtime Design Specification

> This document is the English design specification for the reference runtime used for implementation, migration, and external collaboration.
>
> Implementation languages: TypeScript for the core runtime and HTTP server, Python for evaluation scripts and experiment-analysis clients. The two layers communicate over local HTTP and share JSON-Schema-defined data contracts.

## 0. Documentation and Collaboration Language

- Chinese is the default working language for the project.
- The Chinese design document is maintained separately at [agent_runtime_design.md](./agent_runtime_design.md).
- New documents should preferably be split into separate Chinese and English files instead of mixing both languages in a single page.
- If the Chinese and English versions diverge, internal discussion should resolve the Chinese version first and then sync the English copy.
- Code identifiers, interface names, and directory names stay in English.
- Runtime prompts, tool descriptions, and experiment-facing interfaces stay in English to reduce drift in high-frequency execution paths.

## 1. Research Background and Goals

### 1.1 Motivation

Existing open-source code agents such as smolagents, SWE-agent, OpenHands, and LangGraph often mix prompt templates, context management, action parsing, and tool execution logic together. That makes controlled ablation difficult. This project aims to build an ablation platform where one module can be swapped at a time while all other variables remain fixed.

### 1.2 Goals

Maximize task success rate under the following constraints:

- Effectiveness target: task success rate on SWE-bench Verified
- Efficiency target: total token usage plus end-to-end latency
- Constraint model: maximize success rate within a token/time budget
- Task domain: coding agents on SWE-bench Verified

### 1.3 Primary Research Variables

| Module | Success-rate impact | Token/time impact | Priority |
|--------|---------------------|-------------------|----------|
| `PromptBuilder` | High | High | Primary |
| `ContextStrategy` | Medium | High | Primary |
| `LLMClient` | High | High | Secondary |
| `ActionParser` | Medium | Low | Fixed baseline |
| `ToolSpec.interpreter` | Low | Low | Fixed baseline |

## 2. Boundary Definition

### 2.1 Core Design Decisions

| Decision | Conclusion |
|----------|------------|
| Executor topology | Topology A: executor lives inside the runtime |
| Execution authority | Tool invocation plus result interpretation, but not environment lifecycle |
| Result interpretation | Pure interpreter function provided by the tool side |
| Termination | Structural termination in runtime; semantic termination via `finish` action |
| `finish` status | Normal tool recognized explicitly in `termination_check` |
| Context management | Pluggable |
| Action parsing | Pluggable |
| Error handling | Convert errors into observations and continue |
| Argument validation | Runtime validates args before tool invocation |
| Prompt template | Pluggable |
| Prompt language | Fixed to English inside the runtime; Chinese is kept in docs and collaboration layers |
| LLM | Injected dependency with a minimal runtime interface |

### 2.2 In Scope vs Out of Scope

In scope:

- Decision making: `LLM(context) -> action`
- Tool invocation and interpretation
- Arg validation
- Error-to-observation fallback
- Context maintenance and trimming
- Termination checks
- English prompt assembly

Out of scope:

- Physical execution environments for tools
- Tool implementations themselves
- Environment lifecycle management
- Side-effect governance
- Concrete business logic inside pluggable modules
- Specific model/vendor choices

## 3. Data Model Specification

### 3.1 `Observation`

```python
@dataclass
class Observation:
    content: str
    error: str | None
    metadata: dict
```

### 3.2 `Action`

```python
@dataclass
class Action:
    name: str
    args: dict
    raw_text: str
```

### 3.3 `Context`

```python
@dataclass
class ContextEntry:
    role: Literal["user", "assistant", "tool"]
    content: str
    metadata: dict

@dataclass
class Context:
    task: str
    entries: list[ContextEntry]
    step: int
    token_count: int
```

### 3.4 `StepRecord`

```python
@dataclass
class StepRecord:
    step: int
    prompt: str
    raw_text: str
    action: Action
    observation: Observation
    token_in: int
    token_out: int
    elapsed_ms: int
```

### 3.5 `RunResult`

```python
@dataclass
class RunResult:
    success: bool
    result: str
    steps: list[StepRecord]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int
    termination_reason: Literal["finish", "max_steps", "max_tokens", "error"]
```

## 4. Five Pluggable Interfaces

### 4.1 `LLMClient`

### 4.2 `PromptBuilder`

The prompt builder must be a pure function.
Runtime prompts and tool descriptions should remain in English.

### 4.3 `ActionParser`

### 4.4 `ContextStrategy`

### 4.5 `ToolSpec`

## 5. Runtime Core Specification

### 5.1 Initialization Contract

class AgentRuntime:
    def run(self, task: str) -> RunResult:
        ...
```

## 6. Observability

- Observers do not participate in control flow.
- Observer failures must not break the runtime loop.

## 7. Migration Guide

- Migrate in the order `PromptBuilder -> ActionParser -> ContextStrategy -> ToolSpec`.
- Each source agent should migrate under `packages/agents/<agent-name>/`.
- Adapter packages should avoid modifying `runtime/src/core/*` directly.

## 8. Directory Layout

```text
meta-agent-runtime/
├── runtime/
├── eval/
├── packages/agents/
├── docs/
├── README.md
├── README.en.md
├── agent_runtime_design.md
└── agent_runtime_design.en.md
```

## 9. Key Design Constraints

1. `run()` must not throw.
2. `interpreter` must not throw.
3. `ContextStrategy.trim()` must not mutate the original object.
4. `PromptBuilder.build()` must be pure.
5. `task` must never be trimmed away.
6. `finish` is auto-registered by the runtime.
7. `termination_check` runs before the tool call.
8. `StepRecord` must not affect control flow.
9. Observer failures must not break the loop.
10. `metadata` must not enter prompts.
11. Runtime prompts and tool descriptions must stay in English.

## 10. HTTP Server Specification

- Default port: `3282`
- `POST /run` does not expose runtime prompt-language switching
- `GET /health`
- `GET /registry`

## 11. Python Client Specification

- The Python client does not expose runtime prompt-language switching
- If users provide tasks in Chinese, translation or rewriting may happen outside the runtime, while runtime templates remain in English
