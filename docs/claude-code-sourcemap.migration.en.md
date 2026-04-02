# claude-code-sourcemap Migration Report

## 1. Purpose

This document records the current migration status of `claude-code-sourcemap` into the shared `meta-agent-runtime` framework.

It now reflects the state after both the initial minimal adapter landing and a follow-up fidelity / research-boundary correction pass, rather than only the first integration snapshot.

## 2. Scope

### 2.1 Target repository

- Current target repository: `/Applications/workspace/ailab/research/code-agent/meta_agent_runtime`
- Working branch: use the current local branch state

### 2.2 Source repository

- Source repository: `/Applications/workspace/ailab/research/code-agent/claude-code-sourcemap`

### 2.3 Migration goals for this iteration

This migration pass was intentionally limited to the minimal runnable unit:

- extract the smallest useful Claude Code-like runtime shape
- preserve the shared runtime's agent-agnostic boundary
- prioritize the following pluggable modules:
  - `PromptBuilder`
  - `ActionParser`
  - `ContextStrategy`
  - `ToolSpec` mapping
- add only the minimum required runtime registry integration
- avoid touching other agent adapters

## 3. What was reviewed

Before implementation, the following target-repo documents were reviewed:

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

The following shared runtime files were reviewed:

- `runtime/src/core/interfaces.ts`
- `runtime/src/core/runtime.ts`
- `runtime/src/core/toolSpec.ts`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/src/tools/*`
- `runtime/tests/*`

The following source-repo areas were reviewed to identify the minimal runnable boundary:

- `restored-src/src/QueryEngine.ts`
- `restored-src/src/query.ts`
- `restored-src/src/utils/queryContext.ts`
- `restored-src/src/utils/api.ts`
- `restored-src/src/context.ts`
- `restored-src/src/constants/prompts.ts`
- `restored-src/src/constants/tools.ts`
- `restored-src/src/utils/messages/systemInit.ts`
- `restored-src/src/utils/messages.ts`
- `restored-src/src/tools/BashTool/BashTool.tsx`
- `restored-src/src/tools/FileReadTool/FileReadTool.ts`
- `restored-src/src/tools/FileWriteTool/FileWriteTool.ts`
- `restored-src/src/tools/FileEditTool/FileEditTool.ts`

## 4. Minimal unit identified from the source agent

After reviewing the source repository, the smallest useful execution unit was identified as:

1. system prompt assembly
2. tool schema exposure
3. assistant tool/function call parsing
4. tool execution result reinjection into context
5. loop continuation until `finish` or runtime termination

At the same time, the source repository clearly contains much more:

- native Anthropic `tool_use/tool_result` message blocks
- streaming assembly and recovery logic
- permission workflows and user approval
- dynamic context such as `CLAUDE.md`, git status, memory prompts
- hooks, MCP, subagents, plan mode, structured SDK streams
- provider-specific tool schema shaping and caching

Because of that, this migration uses a compatibility-layer approach instead of a full port.

## 5. Files changed in this migration

## 5.1 New adapter package

New directory:

- `packages/agents/claude-code-sourcemap/src/`

New files:

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`
- `packages/agents/claude-code-sourcemap/src/actionParser.ts`
- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`
- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`

## 5.2 Minimal runtime wiring

Updated files:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`

## 5.3 Tests

New test file:

- `runtime/tests/claudeCodeSourcemap.test.ts`

## 6. Capabilities migrated in this iteration

## 6.1 PromptBuilder

Implemented in:

- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`

What it does:

- builds an English-only runtime prompt
- includes:
  - task
  - tool/function list
  - response contract
  - conversation history
- renders tools in a Claude Code-like `<functions>` block
- defines a `<function_calls><invoke ...>` response convention
- explicitly instructs the model to use `finish` to end the task
- centralizes adapter-facing response-format constants and tool naming in `constants.ts`

What it does not do yet:

- no full source-style system prompt section assembly
- no `CLAUDE.md`, git snapshot, memory, hooks, output-style, or MCP prompt sections
- no attempt to fully reproduce the source prompt stack

## 6.2 ActionParser

Implemented in:

- `packages/agents/claude-code-sourcemap/src/actionParser.ts`

Supported formats:

- primary format:
  - `<function_calls><invoke name="...">{...}</invoke></function_calls>`
- fallback formats:
  - `<tool_call name="...">{...}</tool_call>`
  - `{"name":"...","args":{...}}`
- source-like JSON compatibility:
  - `{"type":"tool_use","name":"...","input":{...}}`
  - `{"tool":"...","arguments":{...}}`

Current limits:

- no native Anthropic `tool_use` block parsing
- no streaming partial argument accumulation
- no multi-call block handling in one response
- focused on one action per turn for the shared runtime loop

## 6.3 ContextStrategy

Implemented in:

- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`

What it does:

- keeps the latest 12 context entries by default
- preserves chronological order instead of reshuffling around errors
- avoids trimming in the middle of an `assistant -> tool` pair when possible
- stays fully compatible with the existing shared runtime loop

What it does not do yet:

- no source-style cached system/user context layering
- no auto-compaction, snip, or microcompact behavior
- no thinking-block trajectory preservation

## 6.4 ToolSpec mapping

Implemented in:

- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`

Mapped tools:

- `Bash`
- `Read`
- `Write`
- `Edit`
- `Grep`

What was adapted:

- source-like tool names
- source-like English descriptions
- source-like argument schema shapes
- adapter-local wrappers for the minimum file and shell behaviors needed by the agent

Recovered source-leaning behaviors:

- `Read`
  - supports `file_path + offset + limit`
  - returns numbered lines
- `Edit`
  - supports `replace_all`
  - rejects ambiguous single replacements when `old_string` appears multiple times
- `Grep`
  - supports `glob / type / output_mode / multiline`
- `Bash`
  - remains available as a minimal shell escape hatch, while steering prompt usage toward dedicated tools

Current limits:

- this is still a compatibility tool layer, not a full source-tool ecosystem port
- no source-style permission checks, read-before-write protection, mtime verification, or richer validation pipeline yet
- `Glob`, notebook, MCP, subagent, and other broader tools are still not migrated
## 6.5 Adapter definition and research boundary cleanup

Implemented in:

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`

What it adds:

- stable exported adapter constants:
  - adapter name
  - default context window
  - function-call example
  - finish example
  - tool-name set
- a single `createClaudeCodeSourcemapAdapter(...)` assembly point for:
  - prompt builder
  - action parser
  - context strategy
  - tool preset
- explicit research knobs for `maxContextEntries` and custom `tools`

Why this matters:

- research code no longer needs to import multiple factories separately
- the adapter baseline is now more explicit and easier to compare across ablations
- the shared runtime core still stays untouched

## 6.6 Runtime registration

Integrated through:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

New registry keys:

- prompt builder: `claude_code_sourcemap`
- action parser: `claude_code_sourcemap`
- context strategy: `claude_code_sourcemap`
- tools preset: `claude_code_sourcemap`

This makes the adapter selectable through the shared runtime without changing the core loop.

## 7. Build-system adjustments

To compile the adapter from `packages/agents/claude-code-sourcemap/` together with the runtime, the following was updated:

- `runtime/tsconfig.json`

Changes:

- `rootDir` changed from `.` to `..`
- adapter source files were added to `include`

Because the output directory layout changed accordingly, the following runtime scripts were updated:

- `runtime/package.json`

Changes:

- `start` -> `node dist/runtime/src/server/app.js`
- `test` -> `node --test dist/runtime/tests/*.test.js`

These changes are build-path adjustments only. They do not change the shared runtime loop behavior.

## 8. Validation

## 8.1 Added tests

New test file:

- `runtime/tests/claudeCodeSourcemap.test.ts`

Covered cases:

- parsing the `<function_calls>` envelope
- parsing source-like `tool_use` JSON payloads
- rendering the prompt with `<functions>` and the XML-style contract
- exposing source-like tool names and argument schema
- assembling the adapter with explicit context-window and custom-tool overrides

## 8.2 Commands run

Executed inside `runtime/`:

- `node --import tsx --test tests/claudeCodeSourcemap.test.ts`

## 8.3 Results

- targeted `claude-code-sourcemap` adapter tests: passed
- total tests: 5
- passed: 5
- failed: 0

Important note:

- full-repository `npm run build` can still be blocked by unrelated adapter issues
- in the most recent check, the blocking error came from a duplicate export in `packages/agents/openhands/src/index.ts`
- that means adapter-local validation and whole-repo TypeScript build status should be tracked separately

## 9. Explicit TODOs and remaining gaps

The following capabilities were intentionally not migrated yet.

## 9.1 Dynamic system prompt context

Not migrated:

- `CLAUDE.md`
- git status snapshot
- source-style date and user context injection
- output style, language, hooks, memory, MCP instruction sections

Recommended next step:

- add an adapter-side prompt-context provider
- keep agent-specific behavior outside `runtime/src/core/*`

## 9.2 Message protocol compatibility

Not migrated:

- Anthropic `tool_use/tool_result` content blocks
- streaming partial tool input accumulation
- tool-result pairing
- interruption and orphan recovery behavior

Recommended next step:

- introduce an adapter-local intermediate message model
- evaluate whether the shared runtime interfaces need a very small extension later

## 9.3 Permissions and safety model

Not migrated:

- prompt-time permission approval
- deny/reject feedback loops
- read-before-write and mtime protection
- richer bash sandbox and destructive-action safeguards

Recommended next step:

- keep the shared runtime simple
- move as much pre-validation as possible into adapter-side tool wrappers

## 9.4 Broader tool surface

Not migrated:

- `Glob`
- a higher-fidelity `Grep`
- notebook, image, web, MCP tools
- subagents
- task / plan mode / cron / workflow tools

Recommended next step:

- prioritize `Glob + Grep + Read/Edit/Write` as the next higher-fidelity tool cluster

## 9.5 Long-context handling

Not migrated:

- auto compact
- snip / microcompact
- summary trajectory constraints
- thinking block preservation

Recommended next step:

- first measure whether existing shared runtime strategies are enough
- only add Claude Code-specific trimming behavior if the experiments need it

## 10. Boundary decisions made in this migration

This migration intentionally did not:

- modify `runtime/src/core/*`
- modify any other agent adapter directory
- import the source repository's large message/permission subsystems wholesale
- attempt a full one-shot reproduction of source behavior

That is aligned with the migration rules:

- agent-specific logic belongs in `packages/agents/<agent-name>/`
- runtime stays agent-agnostic
- compatibility starts with a minimal adapter and grows incrementally

## 11. Current status assessment

At the end of this migration pass, `claude-code-sourcemap` now has a compilable, testable, registerable minimal adapter inside `meta-agent-runtime`.

The current adapter covers:

- Claude Code-like English prompt construction
- source-like function-call parsing
- a chronology-preserving context trimming strategy that avoids splitting assistant/tool pairs when possible
- adapter-local tools that are closer to source parameter and behavior expectations
- an explicit adapter definition layer for modular research and ablation
- runtime schema and registry integration

Status summary:

- `MVP adapter: completed`
- `research-ready adapter boundary: completed`
- `high-fidelity compatibility: not completed yet`

## 12. Recommended next steps

Recommended order:

1. add `Glob` and improve `Grep`
2. make `Read/Write/Edit/Bash` closer to source validation and error semantics
3. add a prompt context provider for `CLAUDE.md`, git, date, and memory
4. evaluate whether an adapter-local message abstraction is needed for `tool_use/tool_result` compatibility
5. run apples-to-apples task comparisons between source behavior and shared runtime behavior

## 13. File inventory for this migration

Added:

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`
- `packages/agents/claude-code-sourcemap/src/actionParser.ts`
- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`
- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`
- `runtime/tests/claudeCodeSourcemap.test.ts`
- `docs/claude-code-sourcemap.migration.en.md`

Modified:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`
