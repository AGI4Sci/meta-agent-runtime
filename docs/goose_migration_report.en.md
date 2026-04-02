# Goose Migration Report

## 1. Overview

This report documents the current status of migrating the reference `goose` agent into the shared `meta-agent-runtime` framework.

It covers:

- scope and constraints
- source analysis
- architectural mapping
- code changes completed in this round
- verification performed
- remaining gaps and TODOs

This migration follows the platform rules:

- keep `runtime/` agent-agnostic
- keep Goose-specific logic under `packages/agents/goose/` as much as possible
- keep runtime prompts and tool descriptions in English
- keep documentation split by language
- prioritize a minimal runnable skeleton before deeper feature parity

## 2. Inputs Reviewed

### 2.1 Target runtime documentation

The migration started by reading:

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

### 2.2 Goose source implementation

To identify Goose's minimum runnable unit, the following source files were reviewed in the reference repository:

- `crates/goose/src/agents/prompt_manager.rs`
- `crates/goose/src/prompts/system.md`
- `crates/goose/src/agents/agent.rs`
- `crates/goose/src/conversation/message.rs`
- `crates/goose/src/agents/platform_extensions/developer/mod.rs`
- `crates/goose/src/agents/platform_extensions/developer/tree.rs`
- `crates/goose/src/agents/platform_extensions/developer/shell.rs`

## 3. Migration Goal for This Round

This round intentionally focused on the smallest shared-runtime-compatible slice of Goose:

1. PromptBuilder
2. ActionParser
3. ContextStrategy
4. ToolSpec mapping
5. minimal runtime registry wiring
6. minimal tests and build validation

The goal was not full Goose parity. The goal was a clean, non-invasive adapter that can run on the shared runtime loop.

## 4. Key Goose Behaviors Identified

### 4.1 Prompt construction

From `prompt_manager` and `system.md`, Goose's system prompt structure has several defining traits:

- a fixed Goose persona
- English runtime prompt text
- extension-aware capability framing
- explicit tool-usage workflow guidance
- a separate response-guideline section

For the shared runtime, only the core prompt behavior was migrated:

- Goose persona
- current date/time
- developer-extension-style instructions
- efficient tool usage guidance
- JSON action contract
- history rendering

### 4.2 Action parsing

The reference Goose implementation supports richer provider-specific tool-call formats and a more expressive internal message model.

Because the shared runtime currently expects a much smaller `Action` shape, this migration implemented a compatibility parser that accepts:

- `{"name":"...","args":{...}}`
- `{"tool":"...","arguments":{...}}`
- `{"function":{"name":"...","arguments":{...}}}`
- `{"function":{"name":"...","arguments":"{\"k\":\"v\"}"}}`
- fenced JSON blocks

This is intentionally a compatibility layer, not a full reproduction of Goose's native tool-call pipeline.

### 4.3 Context management

The real Goose agent includes much more than simple truncation:

- conversation repair
- compaction
- context recovery
- tool-pair summarization
- reasoning/thinking handling

Those behaviors are tightly coupled to Goose's own provider and message architecture, so this round only migrated a minimal context strategy:

- retain recent history approximately within a token budget
- keep the shared runtime loop functional

### 4.4 Tool surface

The most important general-purpose coding workflow in Goose comes from the developer extension. Based on the source review, this round prioritized the minimal developer loop:

- `shell`
- `write`
- `edit`
- `tree`

This tool set is enough to support the basic inspect / edit / execute workflow inside the shared runtime.

### 4.5 Main loop boundary

After reviewing Goose's main loop, the following features were explicitly left out of this first migration round:

- permission approval
- tool inspection
- frontend tools
- action-required / elicitation handling
- dynamic extension enable / disable
- subagent orchestration
- compaction recovery
- provider-native thinking / reasoning replay

These remain future compatibility work.

## 5. Code Changes Completed

### 5.1 New adapter directory

Added:

- `packages/agents/goose/src/`

New files:

- `packages/agents/goose/src/index.ts`
- `packages/agents/goose/src/promptBuilder.ts`
- `packages/agents/goose/src/actionParser.ts`
- `packages/agents/goose/src/contextStrategy.ts`
- `packages/agents/goose/src/tools.ts`

### 5.2 PromptBuilder

`packages/agents/goose/src/promptBuilder.ts` implements `GoosePromptBuilder`.

It includes:

- an English Goose persona
- an hour-level fixed timestamp closer to Goose's `PromptManager`
- developer extension instructions
- tool efficiency guidance
- a JSON action output contract
- task and history rendering

This is not a verbatim copy of Goose's system prompt. It is a distilled shared-runtime version of the most important prompt behaviors.

### 5.3 ActionParser

`packages/agents/goose/src/actionParser.ts` implements `GooseActionParser`.

Supported input styles:

- raw JSON action
- fenced JSON action
- alias fields for tool name and arguments
- stringified JSON inside `function.arguments`
- finish result compatibility

Its purpose is to let Goose-style prompting produce stable shared-runtime `Action` objects.

### 5.4 ContextStrategy

`packages/agents/goose/src/contextStrategy.ts` adds a lightweight `GooseContextStrategy`:

- trims context approximately to a token budget
- does not implement summarization or compaction

This is a compatibility stub rather than a full Goose context-management port.

### 5.5 ToolSpec mapping

`packages/agents/goose/src/tools.ts` implements the minimal developer tool preset.

#### `shell`

- runs with `/bin/zsh -lc`
- supports `timeout_secs`
- returns `stdout`, `stderr`, and `exitCode`
- approximates Goose-style truncation for long output streams
- maps non-zero exit status into runtime observations

#### `write`

- creates parent directories
- overwrites the target file
- returns `Created/Wrote ... (N lines)` style results

#### `edit`

- uses Goose-style `before/after` arguments
- requires an exact unique match for replacement
- supports deletion via empty `after`
- errors if `before` is missing or ambiguous

#### `tree`

- supports `depth`
- prefers `rg --files` for file enumeration
- explicitly loads the root `.gitignore`
- reports approximate line counts
- falls back to a simpler recursive walk if `rg` is unavailable

This `tree` implementation is a practical approximation of Goose's `TreeTool`, not a complete parity port.

### 5.6 Runtime registry integration

Only minimal registry-level integration was added. The runtime main loop was not modified.

Updated:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

New runtime-selectable options:

- `prompt_builder: "goose"`
- `action_parser: "goose"`
- `context_strategy.name: "goose"`
- `tools: "goose"`

### 5.7 TypeScript build boundary update

Because the runtime registry now imports code from `packages/agents/goose/`, the TypeScript project boundary needed a minimal adjustment.

Updated:

- `runtime/tsconfig.json`
- `runtime/package.json`

Changes:

- `rootDir` was widened from `runtime/` to the repository root
- build output now lands under `dist/runtime/...`
- `start` and `test` scripts were updated accordingly

This change was needed so the shared runtime can compile package-level adapters cleanly instead of relying on `noEmit` checks only.

## 6. Tests Added

Added:

- `runtime/tests/gooseAdapter.test.ts`

Current coverage includes:

1. `GooseActionParser` parses `name/args`
2. `GooseActionParser` parses fenced `tool/arguments`
3. `GooseActionParser` parses `function.arguments` string envelopes
4. `GoosePromptBuilder` renders source-faithful Goose instructions
5. `GooseContextStrategy` trims by approximate token budget
6. `gooseTreeTool` respects `depth` and `.gitignore`
7. `gooseEditTool` rejects ambiguous replacements
8. `gooseEditTool` supports deletion via empty `after`
9. `gooseShellTool` preserves non-zero exit codes in observations
10. `gooseShellTool` supports `timeout_secs`

## 7. Capabilities Successfully Migrated

The following Goose capabilities are now present in the shared runtime:

- minimal Goose PromptBuilder
- minimal Goose ActionParser
- token-budget-based Goose ContextStrategy approximation
- minimal developer tool preset
- runtime registry integration
- schema integration
- minimal tests
- targeted adapter validation

## 8. Stubbed or Deferred Capabilities

The following parts of Goose are still stubbed, simplified, or not yet migrated:

### 8.1 Prompt and mode behavior

- hints loading
- Goose mode switching
- additional system prompt extras
- full extension metadata rendering

### 8.2 Context management

- compaction
- overflow recovery
- conversation repair
- tool-pair summarization

### 8.3 Tooling and execution

- permission approval
- tool inspection
- frontend tools
- platform tools
- dynamic extension management

### 8.4 Multi-agent and platform features

- subagents
- scheduling
- recipe-related platform features

### 8.5 Provider-native integration

- native tool-call message structures
- thinking / reasoning preservation
- richer event and message semantics

## 9. Migration Tradeoffs

Several explicit tradeoffs were made in this round.

### 9.1 Minimal runnable skeleton first

The migration did not try to transplant Goose's entire provider/message/event system into the shared runtime.

### 9.2 Adapter-local logic first

Most Goose-specific behavior is isolated under `packages/agents/goose/`, with only minimal registry-level wiring into `runtime/`.

### 9.3 English-only runtime path

Prompt text and tool descriptions remain English in the runtime path, matching the design constraints.

### 9.4 Compatibility layer before deep parity

For complex subsystems like compaction, approval, and provider-native tool-call handling, this round deliberately stopped at a compatibility layer.

## 10. Verification Performed

The following checks were run:

- `npx tsx --test ./tests/gooseAdapter.test.ts`
- Goose-related coverage inside `npx tsx --test ./tests/*.ts`

Result:

- Goose-targeted tests passed
- Goose-related repository tests passed
- repository-wide `tsc` and some full server paths are still affected by unrelated existing adapter issues, and should not be recorded as Goose migration failures

## 11. Current Worktree Scope

The migration changes in this round are concentrated in:

- `packages/agents/goose/`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`
- `runtime/tests/gooseAdapter.test.ts`

No other agent adapter directories were modified.

## 12. Recommended Next Steps

Suggested follow-up priorities:

1. add prompt/parser fixtures and compare against Goose source snapshots
2. extend prompt fixtures and snapshots instead of increasing adapter complexity prematurely
3. explore a Goose-specific compaction-aware `ContextStrategy`
4. design a cleaner mapping from Goose provider-native messages into runtime `Action/Observation`
5. abstract approval and inspection hooks without polluting the shared runtime loop

## 13. Conclusion

This migration has completed the stage of:

- a minimal runnable Goose adapter on the shared runtime
- a basic developer-tool compatibility layer
- registry integration
- test and build validation

It does not yet provide full Goose feature parity. However, it already serves as:

- a strong baseline for future Goose compatibility work
- a controlled adapter for prompt/parser/context/tool experiments
- a low-intrusion migration that does not interfere with other agent lines

The current state is intentionally incremental, testable, and safe to extend.
