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

#### Action parsing

The original `pi-mono` execution path depends on native model tool calls and streaming assistant content, not on the simplified single-string action parser model used in the current reference runtime.

Because of that mismatch, this migration did not attempt to recreate the original streaming tool-call protocol in the first pass. Instead, it introduced a compatibility parser that:

- expects a single JSON action object
- accepts fenced JSON
- normalizes shared-runtime tool names and `pi-mono`-style names through aliases

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
- trims history backward in assistant/tool pairs
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

The shared runtime already had overlapping tools, but with different names:

- `file_read`
- `file_edit`
- `file_write`
- `bash`
- `search`

So this migration mapped existing shared tools rather than re-implementing them:

- `file_read/file_edit/file_write` are exposed as `read/edit/write`
- shared `bash` is reused directly
- a minimal readonly preset is exposed as `read + search`

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
- derives lightweight guidelines from the active tool set
- injects current date and time
- renders the task and prior history
- enforces a single JSON action contract

This is a minimal compatibility extraction from the original `system-prompt.ts`, not a full feature port.

### 4.3 ActionParser

Added `PiMonoActionParser` with the following behavior:

- accepts plain JSON or fenced JSON
- parses `{ name, args }`
- normalizes `file_read/file_edit/file_write` into `read/edit/write`
- raises runtime-standard `ParseError` on invalid payloads

### 4.4 ContextStrategy

Added `PiMonoContextStrategy` with the following behavior:

- accepts a token budget
- trims history in assistant/tool pairs
- preserves entries marked with `metadata.pinned === true`
- avoids leaving dangling half-turns in history

This is intentionally lightweight and does not include compaction summaries, branch summaries, or custom message transforms.

### 4.5 Tool preset mapping

Added two presets:

- `piMonoCodingTools`
- `piMonoReadonlyTools`

They currently map to:

- `piMonoCodingTools = [read, bash, edit, write]`
- `piMonoReadonlyTools = [read, search]`

The tools are mapped to shared runtime implementations rather than newly implemented from scratch.

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

## 5. Capabilities Migrated in This Pass

This pass successfully migrated or established compatibility for:

- a `pi-mono`-style English prompt baseline
- minimal dynamic tool rendering
- lightweight tool-aware guideline generation
- JSON action parsing compatible with the shared runtime
- tool alias normalization between shared-runtime and `pi-mono` naming
- pair-based context trimming centered on turns
- minimal runtime registry integration
- minimal automated tests for the adapter

## 6. Stubbed / Deferred / TODO Areas

The following parts remain out of scope for this first-pass migration:

### 6.1 Native streaming tool-call protocol

The source repository uses native model tool calls and streaming events. The current adapter simplifies this to a single JSON action object.

A higher-fidelity migration would require either:

- extending runtime action semantics
- or adding a more sophisticated bridge for native tool-call transcripts

### 6.2 Custom message system

The source repository supports multiple custom `AgentMessage` variants, including:

- `bashExecution`
- `custom`
- `branchSummary`
- `compactionSummary`

These have not yet been mapped onto the runtime `ContextEntry` abstraction.

### 6.3 Compaction and branch summary

The following source capabilities were not migrated:

- conversation compaction
- branch summaries
- overflow recovery
- summary generation

These may later need to become a stronger `ContextStrategy` or a dedicated compatibility layer.

### 6.4 Session / extension / skill / resource loader stack

The following higher-level subsystems were not migrated:

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

1. `npm install` inside `runtime/`
2. `npm run build`
3. `npm test`

Validation result:

- build passed
- tests passed
- 10 tests passed in total
- the new `pi-mono` adapter tests passed as part of that run

The added tests cover:

- stable adapter name export
- fenced JSON parsing
- tool alias normalization
- prompt builder inclusion of task / tools / JSON contract
- context strategy preservation of assistant/tool pairs
- expected tool preset names

## 8. Risk and Deviation Notes

### 8.1 Not yet behaviorally equivalent to source

The current result should be described as a `pi-mono` compatibility adapter, not a full-fidelity migration.

### 8.2 Simplified parser contract

The adapter assumes a single JSON action response, which is a meaningful simplification relative to the source behavior. That should be treated as an experiment configuration difference.

### 8.3 Readonly preset is still narrow

`pi_mono_readonly` is currently minimal and does not yet fully cover the source repo's exploration flow.

## 9. Recommended Next Steps

Recommended follow-up sequence:

1. add a richer exploration preset aligned with `grep/find/ls`
2. introduce message compatibility for summary / compaction-derived context entries
3. evaluate whether runtime should support a more native tool-call action protocol for better fidelity
4. add fixture-based comparisons between source prompt/parser behavior and adapter output
5. only if needed, phase in session / extension / skill systems later

## 10. Current Status Summary

This migration pass should be considered:

- skeleton complete
- full compatibility not yet complete

The current adapter is enough to make `pi-mono` available as an isolated migration target inside the shared runtime, with buildable, testable, and extendable foundations for later work.
