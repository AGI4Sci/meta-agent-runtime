# Meta Agent Runtime

A reference platform for code-agent ablation studies and runtime research.

## Documentation Index

- Chinese README: [README.md](./README.md)
- English README: this file
- Chinese design doc: [agent_runtime_design.md](./agent_runtime_design.md)
- English design doc: [agent_runtime_design.en.md](./agent_runtime_design.en.md)
- Chinese migration notes: [docs/migration.zh.md](./docs/migration.zh.md)
- English migration notes: [docs/migration.en.md](./docs/migration.en.md)

## Documentation and Collaboration Language

- Chinese is the default working language.
- English documents are maintained for external collaboration and cross-team reference.
- New documentation should preferably be split into separate Chinese and English files instead of mixing both languages in the same page.
- If the Chinese and English versions diverge, the team should resolve the Chinese version first and then sync the English copy.
- Code identifiers, interface names, and directory names should remain in English to reduce implementation ambiguity.

## Project Layout

- `runtime/`: TypeScript reference runtime and HTTP server
- `eval/`: Python client and experiment helpers
- `packages/agents/`: per-agent migration adapters for parallel porting
- `docs/`: migration notes, platform conventions, and supporting documents

## Design Goals

- A stable core loop with explicit module boundaries
- Parallel and modular migration paths for different code agents
- Registry-driven composition for prompt, context, parser, and tool variants
- Experiment-friendly observability, replay, and analysis hooks
- A layered model: bilingual documentation, English-only runtime prompts

## Quick Start

```bash
cd runtime
npm install
npm run build
npm run dev
```

In another shell:

```bash
cd eval
pip install -e .
python -m agent_runtime_client.demo
```

## Current Status

- The repository includes the reference runtime skeleton, server, Python client, and adapter-oriented migration layout.
- LLM providers are still scaffolds and can be wired to real implementations later.
- Runtime prompts, tool descriptions, and experiment-facing interfaces are standardized in English for stability.
- Chinese is retained primarily in documentation and collaboration workflows.
- Integrated adapter packages now include `claude-code-sourcemap`, `goose`, `ii-agent`, `pi-mono`, `opencode`, `cline`, and `openhands`.

## Migration Principles

- `runtime/` should stay agent-agnostic and avoid source-agent-specific coupling.
- Each source agent should migrate independently under `packages/agents/<agent-name>/` to enable parallel workstreams.
- Shared capabilities should be introduced through interfaces and registries instead of patching the runtime loop directly.
