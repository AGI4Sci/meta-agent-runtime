# Migration Notes

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

- `claude-code-sourcemap`: `docs/claude-code-sourcemap.migration.zh.md` / `docs/claude-code-sourcemap.migration.en.md`
- `goose`: `docs/goose_migration_report.zh.md` / `docs/goose_migration_report.en.md`
- `ii-agent`: `docs/ii-agent-migration-report.zh.md` / `docs/ii-agent-migration-report.en.md`
- `pi-mono`: `docs/pi-mono-migration.zh.md` / `docs/pi-mono-migration.en.md`
- `opencode`: `docs/opencode-migration.zh.md` / `docs/opencode-migration.en.md`
- `cline`: `packages/agents/cline/MIGRATION_REPORT.zh.md` / `packages/agents/cline/MIGRATION_REPORT.en.md`
- `openhands`: `docs/openhands_migration_status.zh.md` / `docs/openhands_migration_status.en.md`
