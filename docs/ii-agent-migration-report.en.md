# ii-agent Migration Report

## Purpose

This report tracks the minimal runnable `ii-agent` adapter that has been integrated into `meta-agent-runtime`.

The migration keeps agent-specific logic inside `packages/agents/ii-agent/` and wires only the minimal runtime registration needed for prompt, parser, context, and tool compatibility.

## Scope

- Target workspace: `/Applications/workspace/ailab/research/code-agent/meta_agent_runtime`
- Source branch worktree: `codex/migrate-ii-agent`
- Source repository reviewed: `/Applications/workspace/ailab/research/code-agent/ii-agent`

## Migrated Surface

- `IIAgentPromptBuilder` provides an English-only prompt contract for the shared runtime loop.
- `IIAgentActionParser` accepts `{name,args}`, `{tool,input}`, and `{tool_name,tool_input}` payloads, including fenced JSON.
- `IIAgentContextStrategy` keeps the newest history inside an approximate token budget.
- `iiAgentToolPreset` remaps shared runtime tools to ii-agent-style names such as `ShellRunCommand` and `FileRead`.

## Integration Notes

- The adapter remains isolated under `packages/agents/ii-agent/src/`.
- Runtime wiring is now collected through the shared server registry helper rather than direct ad hoc edits in `runtime/src/server/registry.ts`.
- This pass intentionally does not port ii-agent event streaming, persistence, MCP loading, or multi-agent orchestration semantics.

## Validation

- Adapter-specific coverage lives in `runtime/tests/iiAgentAdapter.test.ts`.
- Repository-wide validation is executed from the integration branch after all agent adapters are consolidated.
