# Migration Notes

## Current Status Overview

The repository now has the basic structure needed for parallel adapter migration on top of a shared runtime:

- `runtime/` owns the shared loop, HTTP server, registries, and observer hooks
- `eval/` owns the Python client and experiment helpers
- `packages/agents/<agent-name>/` owns source-agent-specific prompt / parser / context / tool compatibility

The adapters currently present in the repository include:

- `claude-code-sourcemap`
- `goose`
- `ii-agent`
- `pi-mono`
- `opencode`
- `cline`
- `openhands`

`pi-mono` has now gone through both:

- an initial minimal runnable migration
- a follow-up source-faithfulness correction pass

That correction pass restored:

- tool-aware prompt guidance closer to the original `system-prompt.ts`
- a readonly tool surface closer to the source `readOnlyTools` shape: `read/grep/find/ls`
- broader parser compatibility for source-style tool envelopes
- more robust turn-oriented context trimming

The current project stance is still: migrate the smallest runnable slice first, then tighten fidelity where it materially affects controlled experiments, rather than importing each source agent runtime wholesale into the shared core.

## Parallel Migration Model

Each source agent should migrate into its own adapter package under `packages/agents/<agent-name>/`.
Each adapter package can independently provide:

- prompt builders
- action parsers
- context strategies
- tool presets
- compatibility tests/fixtures

The reference runtime in `runtime/` must stay agent-agnostic. This keeps multiple migration efforts decoupled and lets teams compare components under a shared loop.

## Suggested Workflow

1. Implement adapter-local prompt, parser, and context compatibility first.
2. Register exported factories in the runtime registry.
3. Add deterministic fixtures comparing original output formats with migrated parser and prompt behavior.
4. Run the same task set through the shared HTTP runtime for apples-to-apples comparison.

## Conventions

- Agent-specific code should not modify `runtime/src/core/*`.
- New behaviors should enter the platform through interfaces and registries.
- Shared utilities should be extracted only after at least two adapters need them.

## Current Migration Report Index

`ii-agent` status note:

- Recently promoted from a minimal runnable skeleton to a more research-friendly compatibility adapter.
- Most important recent corrections:
  - source-faithful tool names and argument shapes
  - plain-text completion compatibility via runtime `finish`
  - an explicit todo-state preservation protocol across tools, context, and prompt rendering
- Still intentionally not migrated:
  - controller / event / interruption semantics
  - provider-native tool-calling
  - full long-horizon compression behavior

- `claude-code-sourcemap`: `docs/claude-code-sourcemap.migration.zh.md` / `docs/claude-code-sourcemap.migration.en.md`
- `goose`: `docs/goose_migration_report.zh.md` / `docs/goose_migration_report.en.md`
- `ii-agent`: `docs/ii-agent-migration-report.zh.md` / `docs/ii-agent-migration-report.en.md`
- `pi-mono`: `docs/pi-mono-migration.zh.md` / `docs/pi-mono-migration.en.md`
- `opencode`: `docs/opencode-migration.zh.md` / `docs/opencode-migration.en.md`
- `cline`: `packages/agents/cline/MIGRATION_REPORT.zh.md` / `packages/agents/cline/MIGRATION_REPORT.en.md`
- `openhands`: `docs/openhands_migration_status.zh.md` / `docs/openhands_migration_status.en.md`

Additional note:

- `openhands` has now moved beyond the bare minimum runnable skeleton and into a more research-friendly state.
- its primary adapter implementation now lives under `packages/agents/openhands/`, with individually swappable tool factories to support finer-grained ablation work.

## Status Terms And Matrix

To avoid overloading the word “migrated”, this document uses the following labels:

- `minimal skeleton`: a runnable prompt / parser / context / tool preset adapter exists
- `research-ready`: interface boundaries are stable enough for controlled ablation and contract comparison
- `partially aligned`: integrated, but still has notable behavioral gaps versus the source project
- `full parity not done`: advanced orchestration / runtime semantics are still missing

Current project-wide status matrix:

| agent | prompt | parser | context | tools | status | notes |
|------|--------|--------|---------|-------|--------|------|
| `claude-code-sourcemap` | integrated | integrated | integrated | integrated | research-ready | completed one fidelity correction pass and adapter-boundary cleanup |
| `goose` | integrated | integrated | integrated | integrated | minimal skeleton | has adapter-level tests |
| `ii-agent` | integrated | integrated | integrated | integrated | minimal skeleton | deeper orchestration is still not migrated |
| `pi-mono` | integrated | integrated | integrated | integrated | minimal skeleton | minimal coding / readonly presets are separated |
| `opencode` | integrated | integrated | integrated | integrated | minimal skeleton | still primarily a compatibility layer |
| `cline` | integrated | integrated | integrated | integrated | research-ready | completed one additional fidelity correction pass |
| `openhands` | integrated | integrated | integrated | integrated | partially aligned | browser / delegation semantics are still missing |

## Near-Term Focus

- The design document has been re-aligned to `agent_runtime_design_raw.md`
- The runtime core, HTTP server contract, and Python client / eval contract have each gone through a raw-design alignment pass
- Adapter maturity still differs by source agent, so session / UI / streaming behavior from one source should not be treated as shared-runtime default behavior
- `pi-mono` should currently be viewed as a controlled prompt / parser / context / tool migration target, not as a full `AgentSession` port

## Validation Language

The project should explicitly distinguish between:

- `adapter-local validation passed`: adapter unit tests, targeted `tsx --test`, or Python targeted checks passed
- `repository-wide validation passed`: cross-module checks such as `npm run build`, `npm test`, and `python3 -m compileall eval` passed

Migration status should not mislabel an adapter as failed when its local validation is green but repository-wide checks are blocked by unrelated migration work elsewhere.
