# Cline Migration Report

## 1. Goal of This Migration

The goal of this work was to port the smallest runnable unit of the source agent `cline` into the shared `meta-agent-runtime` framework while preserving the platform constraints:

- `runtime/` must remain agent-agnostic.
- Agent-specific code should live under `packages/agents/cline/`.
- Runtime internals must keep an English-only prompt/tool path.
- Documentation must remain split by language.
- Registry integration should be minimal and should not interfere with other agent migrations.

This migration intentionally followed a minimal-skeleton-first strategy. Instead of attempting a full feature port, it focused on the four highest-priority modules:

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` mapping

## 2. Files Reviewed Before Implementation

### 2.1 Platform documents

The following documents were read first to establish platform boundaries and migration rules:

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

Key conclusions from those documents:

- The core runtime loop, data model, termination logic, validation path, and tool execution boundary are already fixed.
- Agent-specific behavior must be introduced through prompt/parser/context/tools/registry composition.
- `runtime/src/core/*` should not be modified to add cline-specific logic.

### 2.2 Source repository analysis

The following `cline` areas were inspected:

- `src/core/prompts/system-prompt/*`
- `src/core/prompts/system-prompt/registry/PromptBuilder.ts`
- `src/core/prompts/system-prompt/registry/ClineToolSet.ts`
- `src/core/prompts/system-prompt/tools/*`
- `src/core/assistant-message/parse-assistant-message.ts`
- `src/core/context/context-management/*`
- `src/shared/tools.ts`

Important behaviors identified:

- Prompt construction:
  cline generic prompts are assembled from English tool descriptions and reusable template sections, with XML-style tool formatting.

- Tool calling:
  the main tool names are `execute_command`, `read_file`, `write_to_file`, `replace_in_file`, `attempt_completion`, and related XML parameters.

- Message history:
  the source implementation uses a richer message/block model with assistant text, `tool_use`, and `tool_result` blocks, while the shared runtime only exposes linear `ContextEntry` items.

- Editing and execution semantics:
  the smallest useful runnable path depends on `execute_command`, `read_file`, `write_to_file`, and `replace_in_file`; notably, `replace_in_file` uses SEARCH/REPLACE blocks and is not equivalent to the reference runtime's built-in substring editor.

## 3. What Was Implemented

### 3.1 New adapter package

New directory:

- `packages/agents/cline/src/`

New files:

- `packages/agents/cline/src/index.ts`
- `packages/agents/cline/src/promptBuilder.ts`
- `packages/agents/cline/src/actionParser.ts`
- `packages/agents/cline/src/contextStrategy.ts`
- `packages/agents/cline/src/toolPreset.ts`

Together these files form the minimal cline compatibility layer for the shared runtime.

### 3.2 PromptBuilder migration

File:

- `packages/agents/cline/src/promptBuilder.ts`

What it does:

- Builds a minimal English system prompt.
- Preserves cline-style XML tool usage instructions.
- Renders tool descriptions, parameter lists, and usage blocks from runtime `ToolSpec.argsSchema`.
- Re-expresses the runtime `finish` tool as a cline-style `<attempt_completion>...</attempt_completion>` example.
- Renders runtime context into a simplified history structure:
  - `[assistant]`
  - `[tool_result]`
  - `[error]`

What was intentionally not migrated:

- cline's full variant system
- component registry and template engine
- MCP/skills/browser/rules sections
- model-family-specific prompt branches

This builder is intentionally minimal and only aims to preserve the essential behavior needed for a runnable XML-driven loop.

### 3.3 ActionParser migration

File:

- `packages/agents/cline/src/actionParser.ts`

What it supports:

- `execute_command`
- `read_file`
- `write_to_file`
- `replace_in_file`
- `search_files`
- `list_files`
- `attempt_completion`

Behavior:

- Parses generic `<param>value</param>` XML parameters into runtime `Action.args`.
- Coerces `requires_approval` to boolean.
- Coerces `timeout` to number.
- Maps `attempt_completion` to the runtime `finish` action, so the core runtime termination logic remains unchanged.

Deliberate scope limit:

- This parser targets the main case of a single complete XML tool block.
- It does not attempt to fully replicate cline's richer mixed text + tool block + partial streaming parser.

### 3.4 ContextStrategy migration

File:

- `packages/agents/cline/src/contextStrategy.ts`

What it does:

- Implements a pair-aware trimming strategy.
- Preserves recent assistant/tool pairs together.
- Avoids keeping a tool result without the assistant action that produced it.
- Uses the same lightweight token estimation style already used by the reference runtime.

What it does not yet do:

- full conversation compaction
- orphaned tool result cleanup
- message/block-level reconstruction
- native tool result pairing logic

It should be viewed as a minimal strategy tuned for XML action/result turns, not as a full port of cline's context management subsystem.

### 3.5 ToolSpec mapping

File:

- `packages/agents/cline/src/toolPreset.ts`

Minimal tool set added:

- `execute_command`
- `read_file`
- `write_to_file`
- `replace_in_file`
- `search_files`
- `list_files`

Notes:

- `execute_command`
  runs through `/bin/zsh -lc` and preserves cline naming and basic parameter shape.

- `read_file`
  maps to UTF-8 text reading.

- `write_to_file`
  creates parent directories before writing to preserve cline-like create/overwrite behavior.

- `replace_in_file`
  adds a SEARCH/REPLACE compatibility layer and applies blocks sequentially, failing if a SEARCH block does not match.

- `search_files`
  uses `rg -n` for a minimal compatibility path.

- `list_files`
  uses `rg --files` for a minimal compatibility path.

Why this matters:

The adapter keeps cline's tool names and approximate semantics localized inside `packages/agents/cline/`, instead of mutating the reference runtime tool layer or affecting other agents.

### 3.6 Minimal runtime registration

Modified files:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`

What changed:

- Added `cline` to `PROMPT_BUILDERS`
- Added `cline` to `ACTION_PARSERS`
- Added `cline` to `CONTEXT_STRATEGIES`
- Added `cline_minimal` to `TOOL_PRESETS`
- Extended request schema support for:
  - `prompt_builder: "cline"`
  - `action_parser: "cline"`
  - `context_strategy.name: "cline"`
  - `tools: "cline_minimal"`
- Updated the runtime TypeScript config so runtime compilation includes `packages/agents/cline/src/**/*.ts`

What did not change:

- `runtime/src/core/runtime.ts`
- `runtime/src/core/interfaces.ts`
- other agent packages

This keeps the migration aligned with the platform rule of integrating through registries rather than rewriting the core runtime.

### 3.7 Tests

New test file:

- `runtime/tests/clineAdapter.test.ts`

Covered cases:

- parsing `execute_command`
- mapping `attempt_completion` to `finish`
- rendering XML tool formatting and history in the prompt
- preserving assistant/tool pairs in context trimming

## 4. Capabilities Successfully Migrated

Completed in this iteration:

- minimal cline-style English prompt builder
- cline XML action parser
- cline pair-aware context strategy
- cline minimal tool preset
- runtime registry and schema integration
- minimal compatibility tests
- build/test verification

From the runtime module perspective, the following priority components are now in place:

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` preset mapping

## 5. Remaining Stubs and TODOs

Not migrated in this iteration:

- full prompt variant system
  - generic / next-gen / native-gpt-5 / gemini variants

- native tool calling
  - provider-specific native tool registration
  - native `tool_use` / `tool_result` interoperability

- full assistant message parsing
  - mixed text + tool blocks
  - partial / streaming tool calls
  - multiple tool blocks in a single message

- full conversation compaction behavior
  - orphaned tool result cleanup
  - truncation range bookkeeping
  - richer block-level history reconstruction

- advanced tool surface
  - MCP
  - browser
  - web fetch/search
  - use_skill
  - use_subagents
  - ask_followup_question
  - plan_mode / act_mode
  - focus_chain / todo
  - generate_explanation

- stricter semantic compatibility
  - `list_files` is only a minimal compatibility shim
  - `search_files` only supports a reduced parameter shape
  - `replace_in_file` currently implements only the base SEARCH/REPLACE behavior

Suggested next steps:

1. Expand the parser to support mixed text and tool blocks.
2. Bring over richer prompt sections and general cline operating rules.
3. Extend the tool preset with the next most important control tools.
4. Decide later, based on experiment needs, whether a native tool calling compatibility layer is worth adding.

## 6. Key Design Decisions

### 6.1 Why a minimal skeleton first

Three reasons drove this choice:

- The shared runtime is built for controlled experimentation, so a minimal runnable baseline is more useful than a large, entangled first port.
- cline's feature surface is broad enough that a full immediate port would push agent-specific logic into places that should stay shared.
- The repository explicitly supports parallel agent migrations, so a small isolated adapter is the lowest-risk path.

### 6.2 Why `attempt_completion` maps to `finish`

The shared runtime already treats `finish` as the structural completion tool. Mapping cline's semantic completion action `attempt_completion` to `finish` keeps the runtime core unchanged and keeps the boundary clean.

### 6.3 Why `replace_in_file` needs its own compatibility layer

The reference runtime's built-in file edit tool performs a simple substring replacement. cline's `replace_in_file` is centered around SEARCH/REPLACE blocks with tighter prompt/tool semantic coupling. Reusing the shared runtime editor directly would create a prompt/tool mismatch, so the adapter needed its own implementation.

## 7. Validation Performed

The following verification steps were completed:

- `npx tsc -p tsconfig.json --noEmit`
  - result: passed

- `npx tsx --test tests/*.test.ts`
  - result: passed
  - total passing tests: 9

- `npm run build`
  - result: passed

Notes:

- An earlier build failure was caused by sandbox write restrictions on `dist/`, not by TypeScript errors.
- An earlier test typing issue was resolved by explicitly asserting test args as `Record<string, unknown>`.

## 8. Scope Control

This migration only modified or added files in:

- `packages/agents/cline/`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/tests/clineAdapter.test.ts`

Not modified:

- `runtime/src/core/*`
- other agent package directories
- unrelated shared runtime modules

This means the migration stayed within the intended boundary and did not interfere with parallel migration work for other agents.

## 9. Current Status Summary

The current cline migration status can be described as:

- stage: `minimal runnable skeleton`
- status: `completed and validated`
- usability: `available as a standalone adapter option in the shared runtime`
- completeness: `main-path only, not a full cline parity port`

One-sentence summary:

This migration successfully extracted and integrated the minimal cline prompt/parser/context/tools skeleton into `meta-agent-runtime` with low intrusion, leaving a clean foundation for future incremental compatibility work.
