# OpenCode Migration Report

This document records the current migration status of `opencode` into the shared `meta-agent-runtime` framework.

- Migration date: 2026-04-02
- Target repository: `meta-agent-runtime`
- Source repository: `opencode`
- Working branch: `codex/migrate-opencode`
- Scope of this pass: prioritize a minimal runnable skeleton, not a full behavior match

## 1. Constraints Followed In This Pass

This migration followed the repository constraints below:

- Read `agent_runtime_design.md`, `docs/migration.zh.md`, and `README.md` first
- Keep runtime-internal prompts, tool descriptions, and experiment-path text in English
- Keep documentation split by language instead of mixing bilingual content in one file
- Place agent-specific code under `packages/agents/opencode/`
- Keep `runtime/` agent-agnostic and only add minimal registry wiring
- Do not modify other agent directories
- Do not revert unrelated work

## 2. Source Analysis Scope

The following source files were reviewed as the main migration references:

- `packages/opencode/loop.md`
- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/session/system.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/tool/read.ts`
- `packages/opencode/src/tool/bash.ts`

Key findings are summarized below.

### 2.1 Prompt construction

`opencode` does not use a single static prompt template. Its prompt behavior is assembled dynamically from multiple layers:

- `SystemPrompt.provider()` selects provider/model-family-specific system headers
- `SystemPrompt.environment()` injects cwd, git status, platform, date, and environment metadata
- `InstructionPrompt` injects session-level or file-level instructions
- `SessionPrompt.loop` combines message history, tool definitions, structured-output behavior, and runtime state

This means the original implementation behaves more like a dynamic prompt assembler than a plain template.

### 2.2 Action parsing

The original `opencode` execution model is built around AI SDK streaming tool-call events rather than the shared runtime's simpler `raw_text -> Action` contract.

Because of that, a direct port of the original streaming protocol was not appropriate in this pass. Instead, this migration introduced a compatibility layer that accepts:

- `{"tool":"name","input":{...}}`
- the shared runtime's existing `{"name":"name","args":{...}}`
- `finish` as a normal terminal action

### 2.3 Context management

The original `opencode` context boundary is substantially richer than the reference runtime. It includes:

- message history filtering
- compaction tasks
- summary / prune logic
- synthetic user messages
- subtask result reinjection
- context overflow handling

Those capabilities exceed the smallest viable shared-runtime loop, so this pass only ports a minimal trimming strategy.

### 2.4 Tool definition model

`opencode` has a fairly heavy tool ecosystem beyond basic file and shell operations, including:

- permission gating
- metadata write-back
- plugin hooks
- MCP tools
- task/subagent execution
- todo tools
- apply_patch
- webfetch / websearch / codesearch
- truncation behavior
- LSP integration

These were intentionally not fully migrated in the first pass. Only a minimal mapped tool preset was extracted.

### 2.5 Main loop boundary

From `loop.md`, `session/prompt.ts`, and `session/processor.ts`, the source system has two loops:

- an outer session loop that dispatches task / compaction / normal execution branches
- an inner step processor that consumes streaming reasoning / text / tool events

The current shared runtime is intentionally simpler:

- build prompt
- complete
- parse action
- execute tool
- append observation

This pass therefore uses the following strategy:

- do not modify the reference runtime core loop
- only port the smallest OpenCode-compatible pieces that fit the current runtime model
- record explicit TODO items for everything that remains outside that boundary

## 3. Actual Changes Made

### 3.1 New OpenCode adapter directory

New directory:

- `packages/agents/opencode/src/`

New files:

- `packages/agents/opencode/src/index.ts`
- `packages/agents/opencode/src/promptBuilder.ts`
- `packages/agents/opencode/src/actionParser.ts`
- `packages/agents/opencode/src/contextStrategy.ts`
- `packages/agents/opencode/src/toolPreset.ts`

### 3.2 PromptBuilder migration

A new `OpenCodePromptBuilder` was added to provide a shared-runtime-compatible prompt skeleton while preserving key OpenCode traits.

The current implementation includes:

- OpenCode identity framing
- CLI coding-agent positioning
- minimal editing and tool-usage rules
- English environment metadata
- tool listing plus JSON schema rendering
- history rendering
- strict JSON-only output instructions
- explicit `{"tool":"<tool-name>","input":{...}}` tool-call format
- explicit `finish` format guidance

This is not a full reproduction of the source repo's `SystemPrompt + InstructionPrompt + runtime assembly` pipeline. It is a compatibility-oriented prompt builder for the shared runtime.

### 3.3 ActionParser migration

A new `OpenCodeActionParser` was added.

It currently supports:

- `{"name":"bash","args":{"command":"pwd"}}`
- `{"tool":"read","input":{"filePath":"README.md"}}`
- `{"result":"done"}`, which is normalized into `finish`

Design goals:

- fit the shared runtime's `Action` shape
- accept OpenCode-style `tool/input` naming
- preserve minimal runnable behavior without importing streaming protocol complexity

### 3.4 ContextStrategy migration

A new `OpenCodeContextStrategy` was added.

Current behavior:

- lightweight sliding-window trimming
- character-count-based token estimation
- retention of recent history
- insertion of a synthetic omission marker when earlier history is dropped

This is not meant to reproduce `SessionCompaction`. It creates a semantic placeholder for future compaction / summary migration work.

### 3.5 ToolSpec mapping

A new `openCodeToolPreset` was added with the smallest runnable tool set:

- `bash`
- `read`
- `edit`
- `write`
- `grep`
- `glob`

Details:

- `read` supports both file reads and directory listing
- `edit` performs a single substring replacement
- `write` performs overwrite writes
- `grep` / `glob` are implemented on top of `rg`

This preset is a shared-runtime-compatible approximation, not a full copy of the source tool layer. The following source features are not yet wired in:

- permission asks
- metadata streaming
- plugin hooks
- truncation policy
- external-directory protection
- file mtime discipline

### 3.6 Minimal runtime registration

To make the adapter selectable from the shared runtime, this pass only added minimal registry wiring in:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

Added registry entries:

- `prompt_builder: opencode`
- `action_parser: opencode`
- `context_strategy: opencode`
- `tools: opencode`

No changes were made to `runtime/src/core/*`.

### 3.7 Build and test script adjustment

Since `runtime/tsconfig.json` now includes `packages/agents/opencode/src/**/*.ts`, the effective compilation root changed and the output layout became:

- `dist/runtime/...`
- `dist/packages/...`

As a result, the following were updated:

- `runtime/package.json`
  - `start -> node dist/runtime/src/server/app.js`
  - `test -> node --test dist/runtime/tests/*.test.js`
- `runtime/tsconfig.json`
  - `rootDir`
  - `include`

## 4. Capabilities Completed In This Pass

### 4.1 Completed

- OpenCode-style English prompt builder
- OpenCode-style action parser
- OpenCode minimal context trimming strategy
- OpenCode minimal tool mapping preset
- minimal runtime registry integration
- runtime schema integration
- minimal automated test coverage

### 4.2 Minimal runnable path now supported

The shared runtime can now execute the following minimal OpenCode-style path:

1. Build an English prompt with the `opencode` prompt builder
2. Produce an OpenCode-style JSON action
3. Parse it with `OpenCodeActionParser`
4. Execute a minimal mapped tool
5. Feed the observation back into context
6. End via the `finish` action

## 5. Not Yet Migrated / Stub / TODO

The following capabilities are still missing or only represented by placeholders.

### 5.1 Session and streaming execution layer

- outer `SessionPrompt.loop` orchestration
- inner `SessionProcessor.process` streaming event handling
- segmented reasoning/text/tool part recording
- structured `step-start` / `finish-step` handling
- blocked / retry / denied branches

### 5.2 Advanced context behavior

- compaction tasks
- summary generation
- prune behavior
- automatic overflow-to-task conversion
- synthetic user-message injection strategy

### 5.3 Tool ecosystem

- `task` / subagent
- `todo`
- `apply_patch`
- `webfetch`
- `websearch`
- `codesearch`
- `question`
- `skill`
- `lsp`
- `mcp` tools

### 5.4 Permission and safety layer

- permission rulesets
- doom-loop detection
- external-directory guard
- read-before-write / mtime discipline
- tool metadata / ask hooks

### 5.5 Output and observability layer

- snapshot / patch recording
- SessionSummary diff generation
- provider-specific stream metadata
- structured-output tool injection

## 6. Differences From Source Behavior

The current adapter differs materially from the source repository and should be treated accordingly:

- it is a shared-runtime adapter with OpenCode-compatible components, not the full OpenCode runtime
- the parser is a non-streaming JSON parser, not the original streaming tool-call protocol
- the context strategy is a lightweight trimmer, not the source compaction / summary system
- the tools are a minimal runnable subset, not the full source permission/plugin/MCP tool stack
- the prompt preserves core style only and does not fully reproduce source model-routing and instruction injection

This makes the current result suitable for:

- establishing a minimal apples-to-apples baseline
- validating that the shared runtime can host OpenCode-style components
- creating a stable landing point for incremental migration

It is not suitable for:

- claiming full OpenCode equivalence
- doing a one-to-one parity comparison against the source CLI behavior

## 7. Validation Log

The following validations were executed in this pass:

- `npm install` inside `runtime/`
- `npm run build`
- `npm test`

Test result:

- all 8 tests passed

Newly added coverage includes:

- OpenCode parser support for `tool/input`
- OpenCode prompt rendering of the JSON action contract
- a minimal `read -> write -> finish` loop using the OpenCode tool preset

## 8. Recommended Next Steps

Recommended order for the next migration phase:

1. migrate `apply_patch` and more source-faithful file-edit behavior
2. migrate a minimal compatibility layer for permission / ask / doom-loop behavior
3. migrate `task` subagent support
4. migrate compaction / summary behavior
5. evaluate whether the shared runtime interface should be extended for a streaming processor

## 9. Conclusion

This pass completed the “minimal runnable skeleton” goal.

Current status in short:

- OpenCode prompt/parser/context/tools adapters now exist in the shared runtime
- minimal registry integration is complete
- build and test validation passed
- advanced loop, permission, compaction, subagent, MCP, and observability capabilities are still pending

This creates a compilable, testable, and runnable foundation for future component-by-component migration and controlled experiments.
