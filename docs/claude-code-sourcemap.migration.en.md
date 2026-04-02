# claude-code-sourcemap Migration Report

## 1. Purpose

This document records the current migration status of `claude-code-sourcemap` into the shared `meta-agent-runtime` framework.

It focuses on the smallest runnable adapter we implemented in this iteration, rather than a full behavioral reproduction of the source repository.

## 2. Scope

### 2.1 Target repository

- Target repository: `/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-claude-code-sourcemap`
- Working branch: `codex/migrate-claude-code-sourcemap`

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
- prioritizes retaining tool error observations
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

Mapping to shared runtime tools:

- `Bash` -> runtime `bash`
- `Read` -> runtime `file_read`
- `Write` -> runtime `file_write`
- `Edit` -> runtime `file_edit`
- `Grep` -> runtime `search`

What was adapted:

- source-like tool names
- source-like English descriptions
- source-like argument schema shapes
- argument remapping before dispatch

Examples:

- `Read.file_path` -> `file_read.path`
- `Write.file_path` -> `file_write.path`
- `Edit.old_string/new_string` -> `file_edit.old_text/new_text`
- `Grep.pattern` -> `search.query`

Current limits:

- `Grep` is only a minimal alias over the shared runtime search tool
- `Edit` still uses the shared runtime's simple substring replacement semantics
- no source-style permission checks, read-before-write protection, mtime verification, or richer validation pipeline yet

## 6.5 Runtime registration

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
- rendering the prompt with `<functions>` and the XML-style contract
- exposing source-like tool names and argument schema

## 8.2 Commands run

Executed inside `runtime/`:

- `npm install`
- `npm run build`
- `npm test`

## 8.3 Results

- `npm run build`: passed
- `npm test`: passed
- total tests: 8
- passed: 8
- failed: 0

The new `claude-code-sourcemap` adapter tests were included in that passing run.

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
- a minimal context trimming strategy
- source-like tool naming over shared runtime tools
- runtime schema and registry integration

Status summary:

- `MVP adapter: completed`
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
