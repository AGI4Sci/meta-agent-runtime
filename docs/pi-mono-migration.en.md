# pi-mono Migration Report

## 1. Objective

This migration moved the smallest runnable slice of the existing `pi-mono` coding agent into the shared `meta-agent-runtime` framework.

The work followed these constraints:

- keep runtime prompts in English
- keep documentation separated by language
- place agent-specific logic under `packages/agents/pi-mono/`
- only add minimal runtime registry integration
- do not modify other agent adapter directories
- use compatibility layers first when the original behavior is too complex to port directly

The first-pass scope focused on extracting:

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` mappings / presets

## 2. Target Documentation Reviewed

Before implementation, the following target-repo documents were reviewed:

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

Key requirements derived from those documents:

- `runtime/` must remain agent-agnostic
- migrated logic belongs in `packages/agents/<agent-name>/`
- prompt/parser/context/tool behavior should enter through registries and interfaces, not through direct core loop modifications
- runtime-facing prompts and tool descriptions should stay in English
- Chinese should remain in the documentation and collaboration layer

## 3. Source Repository Analysis

### 3.1 Main Source Files Inspected

To identify the smallest runnable unit in `pi-mono`, the following source files were inspected:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/messages.ts`
- `packages/coding-agent/src/core/tools/index.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 3.2 Boundary Identification

#### Prompt construction

In the source repository, prompt construction is centered around `packages/coding-agent/src/core/system-prompt.ts`.
Its notable behavior includes:

- building an English system prompt
- rendering a tool list based on currently enabled tools
- generating tool-dependent guidelines
- appending current date/time and working directory
- optionally appending context files, skills, and extension-injected prompt fragments

This migration preserved only the stable and minimal subset:

- English system prompt baseline
- dynamic tool list rendering
- lightweight guideline generation
- current date/time injection
- history rendering

Skills, context files, and extension prompt augmentation were intentionally left out.

Important note: after the first adapter landing, the `pi-mono` migration also went through a follow-up source-faithfulness correction pass. The status below reflects that corrected state, not only the first minimal wiring pass.

#### Action parsing

The original `pi-mono` execution path depends on native model tool calls and streaming assistant content, not on the simplified single-string action parser model used in the current reference runtime.

Because of that mismatch, this migration did not attempt to recreate the original streaming tool-call protocol in the first pass. Instead, it introduced a compatibility parser that:

- expects a single JSON action object
- accepts fenced JSON
- normalizes shared-runtime tool names and `pi-mono`-style names through aliases
- accepts source-style tool envelopes such as `toolCall` / `arguments`

This makes `pi-mono` runnable inside the shared runtime without forcing deep runtime changes.

#### Context management

Context handling in the source repository is much richer and includes:

- `convertToLlm` transforms for custom message types
- compaction and branch summaries
- filtering UI-only messages
- steering and follow-up queues
- session state and extension-injected context

This migration did not port those systems in full. Instead, it identified the smallest common structure:

- assistant output is followed by a tool result / observation
- recent assistant/tool pairs are the most important unit to keep

That led to a lightweight `PiMonoContextStrategy` that:

- preserves explicitly pinned entries
- trims history backward primarily in assistant/tool pairs
- keeps trailing non-paired entries stable instead of assuming the entire context is strictly pair-shaped
- avoids keeping half of a turn

This is closer to `pi-mono` turn semantics than a naive sliding window while still staying simple.

#### Tool definitions

The smallest useful tool set in the source repository is:

- `read`
- `bash`
- `edit`
- `write`

Additional exploration tools in the source include:

- `grep`
- `find`
- `ls`

The shared runtime already had overlapping tools, but not the exact readonly surface used by the source repository.

So the adapter now uses a mixed approach:

- `file_read/file_edit/file_write` are exposed as `read/edit/write`
- shared `bash` is reused directly
- minimal compat implementations are provided for `grep`, `find`, and `ls`
- the readonly preset is restored to `read + grep + find + ls`

#### Main loop boundary

The source `agent-loop.ts` has these characteristics:

- one assistant turn may emit multiple tool calls
- tool execution is streamed as events
- steering messages can interrupt after tool execution
- follow-up messages can re-enter the loop after apparent completion

The current reference runtime loop is simpler:

- one `prompt -> raw_text -> action -> tool -> observation` cycle per step
- one parsed action per model output
- errors become observations instead of breaking the loop
- `finish` is recognized structurally by runtime

That means this migration focused on extracting pluggable components from `pi-mono`, not on porting the original loop itself.

## 4. Actual Changes Made

### 4.1 New adapter directory

Added directory:

- `packages/agents/pi-mono/src/`

Added files:

- `packages/agents/pi-mono/src/index.ts`
- `packages/agents/pi-mono/src/promptBuilder.ts`
- `packages/agents/pi-mono/src/parser.ts`
- `packages/agents/pi-mono/src/contextStrategy.ts`
- `packages/agents/pi-mono/src/tools.ts`

### 4.2 PromptBuilder

Added `PiMonoPromptBuilder` with the following behavior:

- keeps the prompt fully in English
- preserves the `pi`-style assistant framing
- renders a dynamic tool list
- derives tool-aware guidance closer to the original `system-prompt.ts`
- injects current date/time and working directory
- renders the task and prior history
- enforces a single JSON action contract
- exposes injectable `cwd` / `now()` hooks for deterministic experiments

This is a minimal compatibility extraction from the original `system-prompt.ts`, not a full feature port.

### 4.3 ActionParser

Added `PiMonoActionParser` with the following behavior:

- accepts plain JSON or fenced JSON
- parses `{ name, args }`
- accepts source-style envelopes including `toolCall`, `arguments`, and `tool_input`
- normalizes `file_read/file_edit/file_write` into `read/edit/write`
- raises runtime-standard `ParseError` on invalid payloads

### 4.4 ContextStrategy

Added `PiMonoContextStrategy` with the following behavior:

- accepts a token budget
- trims history primarily in assistant/tool pairs
- preserves entries marked with `metadata.pinned === true`
- avoids leaving dangling half-turns in history
- remains stable when the latest entry is not part of a tool pair

This is intentionally lightweight and does not include compaction summaries, branch summaries, or custom message transforms.

### 4.5 Tool preset mapping

Added two presets:

- `piMonoCodingTools`
- `piMonoReadonlyTools`

They currently map to:

- `piMonoCodingTools = [read, bash, edit, write]`
- `piMonoReadonlyTools = [read, grep, find, ls]`

`read/edit/write/bash` still reuse shared runtime implementations where possible, while `grep/find/ls` are minimal compat tools added to preserve the source repository's exploration surface.

### 4.6 Registry integration

Updated `runtime/src/server/registry.ts` to register:

- prompt builder: `pi_mono`
- action parser: `pi_mono`
- context strategy: `pi_mono`
- tool presets: `pi_mono_coding` and `pi_mono_readonly`

No runtime core loop changes were made, and no other agent adapter directories were modified.

### 4.7 Build configuration updates

Because the adapter now lives outside `runtime/`, while the runtime registry imports it directly, the runtime build configuration needed a minimal adjustment:

- `runtime/tsconfig.json` now includes `../packages/**/*.ts`
- `rootDir` was widened to the repository root scope
- `runtime/package.json` output paths were updated accordingly for build/start/test

These changes are purely for compilation and packaging of the adapter source.

## 5. Capabilities Migrated So Far

The current adapter now provides:

- a `pi-mono`-style English prompt baseline
- minimal dynamic tool rendering
- tool-aware guidance closer to the source prompt logic
- JSON action parsing compatible with the shared runtime
- source-style tool envelope compatibility
- tool alias normalization between shared-runtime and `pi-mono` naming
- turn-oriented context trimming with more stable trailing-entry handling
- a readonly tool surface closer to the source preset: `read/grep/find/ls`
- deterministic prompt-builder hooks for experiment control
- minimal runtime registry integration
- minimal automated tests for the adapter

## 6. Stubbed / Deferred / TODO Areas

The following parts remain intentionally out of scope:

### 6.1 Native streaming tool-call protocol

The original repository depends on a native streaming tool-call / assistant-content protocol. The adapter still runs on the shared runtime's single-action loop and does not recreate that protocol.

### 6.2 `AgentSession`-level state systems

The following source systems are still not migrated:

- compaction summaries
- branch summaries
- steering / follow-up queues
- retry / overflow recovery logic
- extension runner / skill / resource loader plumbing
- UI-only message filtering and session persistence

### 6.3 Source prompt augmentation layers

The adapter preserves only the stable prompt skeleton, not the full prompt assembly stack. It still does not port:

- docs-path injection
- context file injection
- skills sections
- extension-appended prompt fragments

## 7. Current Assessment

From the perspective of modular runtime research, the adapter is now in a better state than the initial landing:

- the prompt variable is closer to the source algorithm
- the tool variable is closer to the source readonly preset
- the context variable is less brittle
- session / UI / streaming behavior is still intentionally kept outside the shared core

So the correct framing is:

- this is still not a full `pi-mono` port
- but it is now a more faithful minimal skeleton for PromptBuilder / ActionParser / ContextStrategy / ToolSpec experiments

- `AgentSession`
- extension runtime
- skill loading and formatting
- resource loader
- prompt template expansion
- model/session management

They are beyond the scope of a smallest-runnable-skeleton migration.

### 6.5 Full exploration tool parity

The current presets only cover:

- coding preset: `read/bash/edit/write`
- readonly preset: `read/search`

The source repository's `grep/find/ls` exploration workflow is not yet represented as a dedicated `pi-mono` preset.

### 6.6 Deeper prompt parity

The current prompt builder preserves tone, structure, and key constraints, but does not fully port:

- pi self-documentation hints
- documentation routing behavior
- skills/context files/appendSystemPrompt support
- extension-injected prompt fragments

## 7. Validation Performed

The following validation steps were executed:

1. `npm test` inside `runtime/`
2. targeted `pi-mono` adapter test expansion
3. source-to-adapter fidelity checks against prompt / parser / readonly preset / context behavior

Validation result:

- tests passed
- the repository test suite currently passes at `79/79`
- the `pi-mono` adapter tests cover both the initial skeleton and the later fidelity-correction pass
- `npm run build` is currently not a clean signal for `pi-mono` alone because the workspace still contains unrelated adapter-side TypeScript issues

The added tests cover:

- stable adapter name export
- fenced JSON parsing
- source-style tool envelope compatibility
- tool alias normalization
- prompt builder inclusion of task / tools / JSON contract / working directory
- readonly exploration guidance
- context strategy preservation of assistant/tool pairs
- stable handling of trailing non-paired entries
- expected tool preset names

## 8. Risk and Deviation Notes

### 8.1 Not yet behaviorally equivalent to source

The current result should be described as a `pi-mono` compatibility adapter, not a full-fidelity migration.

### 8.2 Simplified parser contract

The adapter assumes a single JSON action response, which is a meaningful simplification relative to the source behavior. That should be treated as an experiment configuration difference.

### 8.3 Session and streaming behavior remain out of scope

Even though `pi_mono_readonly` has now been restored to `read + grep + find + ls`, the source repository's session-level and streaming behavior is still not ported. The adapter should therefore be treated as a modular research target, not as a full behavioral proxy of the source runtime.

## 9. Recommended Next Steps

Recommended follow-up sequence:

1. add fixture-based comparisons between source prompt/parser/readonly preset behavior and adapter output
2. introduce message compatibility for summary / compaction-derived context entries if the research question needs it
3. evaluate whether runtime should support a more native tool-call transcript bridge for better fidelity
4. only if the study depends on session behavior, phase in `AgentSession`-level compatibility later
5. keep the current modular prompt/context/parser/tool split instead of collapsing back into a source-runtime-shaped port

## 10. Current Status Summary

The current `pi-mono` migration should be described as:

- minimal skeleton complete
- one meaningful fidelity-correction pass completed
- full session / streaming compatibility still deferred

The adapter is now strong enough to serve as an isolated PromptBuilder / ActionParser / ContextStrategy / ToolSpec research target inside the shared runtime, while remaining explicitly short of a full source-runtime port.
