# ii-agent Migration Report

## Status

`ii-agent` has moved beyond a merely runnable skeleton and is now a research-oriented compatibility adapter inside the shared runtime.

Current adapter code lives under:

- `packages/agents/ii-agent/src`

The current state is:

**The adapter is runnable, isolated, and materially closer to the original `ii-agent` coding workflow, but it is still not a full reproduction of the original controller, event, native tool-calling, or long-horizon compression stack.**

## What Is Now Aligned

- `IIAgentPromptBuilder` now carries a stronger subset of the original coding-agent rules:
  - inspect first
  - prefer search/read before edit
  - use todo management for non-trivial work
  - preserve an English-only runtime prompt track
- `IIAgentActionParser` accepts multiple source-like envelopes:
  - `{name,args}`
  - `{tool,input}`
  - `{tool_name,tool_input}`
  - `{function:{name,arguments}}`
  - fenced JSON
- The parser also bridges a key semantic gap with the original project:
  - plain-text final answers are normalized to runtime `finish`
  - this approximates the original “no pending tool call means done” behavior
- `IIAgentContextStrategy` no longer acts as a plain recent-history window only:
  - it keeps the newest history within a token budget
  - it preserves the latest todo snapshot
- `createIIAgentToolPreset()` now exposes a more source-faithful tool surface:
  - `Bash`
  - `Read`
  - `Write`
  - `Edit`
  - `Grep`
  - `TodoWrite`
  - `TodoRead`

## Research-Friendly Refinements

One additional refinement was made specifically to improve modular experimentation:

- todo-state conventions were extracted into a dedicated helper module:
  - `packages/agents/ii-agent/src/todoState.ts`

This centralizes:

- todo item normalization
- todo formatting
- todo snapshot detection
- latest snapshot lookup

That change reduces hidden coupling between:

- `PromptBuilder`
- `ContextStrategy`
- todo-related `ToolSpec`s

which makes future ablations cleaner.

## Known Non-Migrated Areas

The following parts are still intentionally out of scope for the current adapter:

- provider-native tool calling end-to-end
- controller / orchestration semantics
- interruption handling
- event streaming
- run persistence / status lifecycle
- full `LLMCompact` summarization logic
- browser, web, media, MCP, and sub-agent ecosystems

## Validation

Relevant coverage:

- `runtime/tests/iiAgentAdapter.test.ts`

Covered behaviors include:

- source-style action envelopes
- fenced JSON
- plain-text completion to `finish`
- prompt rendering
- todo snapshot preservation
- shared todo helper semantics
- minimal tool loop closure
- source-faithful tool names

Commands run:

```bash
cd runtime
npm run build
node --test dist/runtime/tests/iiAgentAdapter.test.js
node --test dist/runtime/tests/serverContract.test.js dist/runtime/tests/runtimeCoreAlignment.test.js
```

## Notes

- A separate pre-existing build issue still exists in `packages/agents/openhands/src/index.ts`, where `createOpenHandsTools` is exported ambiguously. This is recorded here only as unrelated repository context; it is not part of the `ii-agent` migration itself.
